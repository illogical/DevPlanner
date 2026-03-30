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
   *
   * For dispatch, raw URLs are never passed to the agent — only resolved
   * document content is included. Two URL patterns are resolved:
   *   1. URLs matching ARTIFACT_BASE_URL (the configured vault prefix)
   *   2. Any URL carrying a `path=` query parameter (VaultPad's URL format)
   *
   * External links with no resolvable local path are passed through as-is,
   * since they may be genuinely useful external references (e.g. GitHub issues,
   * design docs). Internal artifact URLs that fail to resolve are noted without
   * the URL since the URL itself is not useful to a coding agent.
   */
  private async buildArtifactSection(card: Card): Promise<string> {
    const links = card.frontmatter.links ?? [];
    if (links.length === 0) return '';

    const artifactBasePath =
      process.env.ARTIFACT_BASE_PATH ?? process.env.OBSIDIAN_VAULT_PATH;
    const artifactBaseUrl =
      process.env.ARTIFACT_BASE_URL ?? process.env.OBSIDIAN_BASE_URL;

    const sections: string[] = ['## Reference Artifacts'];

    for (const link of links) {
      // Determine whether this looks like a local artifact / VaultPad link.
      // Strategy: try to parse the URL and extract a relative path either from
      // the `path=` query parameter (VaultPad format) or from the pathname when
      // the URL matches the configured artifact base.
      let relativePath: string | null = null;
      let isArtifactUrl = false;

      try {
        const urlObj = new URL(link.url);
        const pathParam = urlObj.searchParams.get('path');

        if (pathParam) {
          // VaultPad-style: ?path=10-Projects%2Fhex%2Fcard%2Ffile.md
          relativePath = decodeURIComponent(pathParam);
          isArtifactUrl = true;
        } else if (artifactBaseUrl && link.url.startsWith(artifactBaseUrl)) {
          // Pathname-suffix style matching the configured base URL
          relativePath = decodeURIComponent(urlObj.pathname.replace(/^\//, ''));
          isArtifactUrl = true;
        }
      } catch {
        // Unparseable URL — treat as opaque external link
      }

      if (isArtifactUrl && artifactBasePath && relativePath) {
        // Resolve the path relative to the artifact vault root and read content.
        try {
          const filePath = join(artifactBasePath, '..', relativePath);
          if (existsSync(filePath)) {
            const content = await readFile(filePath, 'utf-8');
            sections.push(`### ${link.label}\n${content}`);
          } else {
            // File not found — note it without exposing the internal URL
            sections.push(
              `### ${link.label}\n_Referenced document — content not available in dispatch context._`
            );
          }
        } catch {
          sections.push(
            `### ${link.label}\n_Referenced document — content not available in dispatch context._`
          );
        }
      } else if (isArtifactUrl && !artifactBasePath) {
        // Detected an artifact URL but vault path not configured — note without URL
        sections.push(
          `### ${link.label}\n_Referenced document — ARTIFACT_BASE_PATH not configured on this server._`
        );
      } else {
        // Genuinely external URL (GitHub, Jira, external docs, etc.)
        // Pass through — the agent may find the reference useful.
        sections.push(`### ${link.label}\n_Reference: ${link.url}_`);
      }
    }

    if (sections.length === 1) return ''; // Only the header — nothing to include
    return sections.join('\n\n');
  }
}

