import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { PromptLoader } from './prompt-loader.service';
import type { Card } from '../types';

/**
 * Builds the system and user prompts for card dispatch.
 * Templates are loaded from `src/prompts/` markdown files; token substitution
 * handles dynamic values so no logic is hard-coded in this file.
 */
export class PromptService {
  /**
   * Build both prompts for the given card.
   */
  async buildPrompts(
    card: Card,
    projectSlug: string,
    branch: string,
    repoPath: string
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    const systemPrompt = await this.buildSystemPrompt(
      card,
      projectSlug,
      branch,
      repoPath
    );
    const userPrompt = await this.buildUserPrompt(card, projectSlug);
    return { systemPrompt, userPrompt };
  }

  /**
   * Build the system prompt from the `dispatch-system.md` template.
   * Claude Code reads CLAUDE.md automatically as project instructions.
   */
  async buildSystemPrompt(
    card: Card,
    projectSlug: string,
    branch: string,
    repoPath: string
  ): Promise<string> {
    const cardSlug = card.slug;
    const devplannerPort = process.env.PORT ?? '17103';
    const devplannerHost = 'localhost';

    // Try to read an existing CLAUDE.md from the project root for extra context
    let projectClaudeMd = '';
    const claudeMdPath = join(repoPath, 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      try {
        const content = await readFile(claudeMdPath, 'utf-8');
        projectClaudeMd =
          content.length > 4000
            ? content.slice(0, 4000) + '\n...(truncated)'
            : content;
      } catch {
        // Ignore read errors — CLAUDE.md is optional
      }
    }

    const projectContextSection = projectClaudeMd
      ? `## Project Context\n\n${projectClaudeMd}`
      : '';

    return PromptLoader.load('dispatch-system', {
      projectSlug,
      cardSlug,
      branch,
      devplannerHost,
      devplannerPort,
      projectContextSection,
    });
  }

  /**
   * Build the user prompt from the `dispatch-user.md` template.
   */
  async buildUserPrompt(card: Card, projectSlug: string): Promise<string> {
    const cardId = card.cardId ?? card.slug;
    const title = card.frontmatter.title;
    const description = card.frontmatter.description ?? '_No description provided._';

    const taskSection =
      card.tasks.length > 0
        ? card.tasks
            .map((t) => `- [${t.checked ? 'x' : ' '}] ${t.index}: ${t.text}`)
            .join('\n')
        : '_No tasks defined._';

    const artifactSection = await this.buildArtifactSection(card);

    return PromptLoader.load('dispatch-user', {
      cardId,
      title,
      description,
      content: card.content.trim() || '_No additional content._',
      taskSection,
      artifactSection,
    });
  }

  /**
   * Build the "Reference Artifacts" section by fetching linked vault content.
   */
  private async buildArtifactSection(card: Card): Promise<string> {
    const links = card.frontmatter.links ?? [];
    const artifactBasePath = process.env.ARTIFACT_BASE_PATH;
    const artifactBaseUrl = process.env.ARTIFACT_BASE_URL;

    if (links.length === 0 || !artifactBasePath || !artifactBaseUrl) {
      return '';
    }

    const sections: string[] = ['## Reference Artifacts'];

    for (const link of links) {
      if (!artifactBaseUrl || !link.url.startsWith(artifactBaseUrl)) {
        sections.push(`### ${link.label}\n_External link: ${link.url}_`);
        continue;
      }

      try {
        const urlObj = new URL(link.url);
        const pathParam =
          urlObj.searchParams.get('path') ??
          urlObj.pathname.replace(/^\//, '');
        const relativePath = decodeURIComponent(pathParam);
        const filePath = join(artifactBasePath, '..', relativePath);

        if (existsSync(filePath)) {
          const content = await readFile(filePath, 'utf-8');
          sections.push(`### ${link.label} (artifact)\n${content}`);
        } else {
          sections.push(
            `### ${link.label}\n_Artifact file not found at: ${filePath}_`
          );
        }
      } catch {
        sections.push(
          `### ${link.label}\n_Could not fetch artifact: ${link.url}_`
        );
      }
    }

    return sections.join('\n\n');
  }
}

