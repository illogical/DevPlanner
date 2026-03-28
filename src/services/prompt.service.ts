import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Card } from '../types';

/**
 * Prompt templates and helpers for card dispatch.
 * Assembles the system prompt (CLAUDE.md) and user prompt (card context)
 * that are passed to the agent CLI.
 */
export class PromptService {
  /**
   * Build both prompts for the given card.
   *
   * @returns `{ systemPrompt, userPrompt }` ready for the adapter.
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
   * Build the system prompt written to CLAUDE.md in the worktree.
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
        // Include at most the first 4000 chars to avoid overwhelming the context
        projectClaudeMd =
          content.length > 4000
            ? content.slice(0, 4000) + '\n...(truncated)'
            : content;
      } catch {
        // Ignore read errors — CLAUDE.md is optional
      }
    }

    const projectContextSection = projectClaudeMd
      ? `## Project Context\n\n${projectClaudeMd}\n`
      : '';

    return `# Agent Instructions

You are a software development agent implementing a feature described below.
Work in the current directory — it is a git worktree checked out to a feature branch.

## DevPlanner Board Updates

You have access to the DevPlanner MCP server (\`mcp__devplanner__*\` tools).

1. Call \`mcp__devplanner__get_card\` first to read current task indices (0-based).
2. Call \`mcp__devplanner__toggle_task\` immediately after finishing each task.
3. Call \`mcp__devplanner__update_card\` with \`status: "blocked"\` and a \`blockedReason\` if you get stuck.
4. Call \`mcp__devplanner__move_card\` with \`lane: "03-complete"\` when all tasks are done.
5. Optionally call \`mcp__devplanner__create_vault_artifact\` to attach a summary.

Project: ${projectSlug} | Card: ${cardSlug}
Toggle tasks immediately — do not batch them at the session end.

## DevPlanner Board Updates (REST fallback — use MCP tools if available)

If MCP tools are not available, update the board via HTTP:

  # Toggle a task complete (0-based index):
  curl -X PATCH http://${devplannerHost}:${devplannerPort}/api/projects/${projectSlug}/cards/${cardSlug}/tasks/{index} \\
    -H "Content-Type: application/json" \\
    -d '{"checked": true}'

  # Mark yourself blocked:
  curl -X PATCH http://${devplannerHost}:${devplannerPort}/api/projects/${projectSlug}/cards/${cardSlug} \\
    -H "Content-Type: application/json" \\
    -d '{"status": "blocked", "blockedReason": "explanation"}'

  # Move to complete when all tasks are done:
  curl -X PATCH http://${devplannerHost}:${devplannerPort}/api/projects/${projectSlug}/cards/${cardSlug}/move \\
    -H "Content-Type: application/json" \\
    -d '{"lane": "03-complete"}'

## Git Instructions

- Commit changes with descriptive messages as you complete logical units of work
- Do not push — the dispatch system handles branch management
- Your branch: \`${branch}\`

${projectContextSection}`;
  }

  /**
   * Build the user prompt containing card content and task list.
   */
  async buildUserPrompt(card: Card, projectSlug: string): Promise<string> {
    const cardId = card.cardId ?? card.slug;
    const title = card.frontmatter.title;
    const description = card.frontmatter.description ?? '_No description provided._';

    // Build the task list with 0-based indices
    const taskSection = card.tasks.length > 0
      ? card.tasks
          .map(
            (t) =>
              `- [${t.checked ? 'x' : ' '}] ${t.index}: ${t.text}`
          )
          .join('\n')
      : '_No tasks defined._';

    // Build artifact links section
    const artifactSection = await this.buildArtifactSection(card);

    return `# Card: ${cardId} — ${title}

## Description

${description}

## Content

${card.content.trim() || '_No additional content._'}

## Tasks

${taskSection}

${artifactSection}`;
  }

  /**
   * Build the "Reference Artifacts" section by fetching linked vault content.
   */
  private async buildArtifactSection(card: Card): Promise<string> {
    const links = card.frontmatter.links ?? [];
    const artifactBasePath = process.env.ARTIFACT_BASE_PATH ?? process.env.OBSIDIAN_VAULT_PATH;
    const artifactBaseUrl = process.env.ARTIFACT_BASE_URL ?? process.env.OBSIDIAN_BASE_URL;

    if (links.length === 0 || !artifactBasePath || !artifactBaseUrl) {
      return '';
    }

    const sections: string[] = ['## Reference Artifacts'];

    for (const link of links) {
      // Only fetch links that point to the vault (match the configured base URL)
      if (!artifactBaseUrl || !link.url.startsWith(artifactBaseUrl)) {
        sections.push(`### ${link.label}\n_External link: ${link.url}_`);
        continue;
      }

      try {
        // Decode the relative path from the URL query string
        const urlObj = new URL(link.url);
        const pathParam = urlObj.searchParams.get('path') ?? urlObj.pathname.replace(/^\//, '');
        const relativePath = decodeURIComponent(pathParam);
        const filePath = join(artifactBasePath, '..', relativePath);

        if (existsSync(filePath)) {
          const content = await readFile(filePath, 'utf-8');
          sections.push(`### ${link.label} (artifact)\n${content}`);
        } else {
          sections.push(`### ${link.label}\n_Artifact file not found at: ${filePath}_`);
        }
      } catch {
        sections.push(`### ${link.label}\n_Could not fetch artifact: ${link.url}_`);
      }
    }

    return sections.join('\n\n');
  }
}
