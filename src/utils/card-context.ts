/**
 * Shared helper for building card context responses.
 * Used by both the REST endpoint and the MCP tool handler.
 */

import type { Card } from '../types/index.js';
import type { VaultService } from '../services/vault.service.js';

export interface ArtifactContext {
  label: string;
  kind: string;
  path: string;
  content: string;
}

export interface LinkContext {
  label: string;
  kind: string;
  url: string;
}

export interface CardContextResult {
  cardId: string | null;
  slug: string;
  title: string;
  description: string | null;
  tasks: string;
  artifacts: ArtifactContext[];
  links: LinkContext[];
  contextText: string;
}

/**
 * Extracts the relative vault path from a vault artifact URL.
 * Vault URLs are constructed as: `${artifactBaseUrl}%2F${encodeURIComponent(relativePath)}`
 * Returns null if the URL doesn't start with the base URL.
 */
function extractVaultPath(url: string, artifactBaseUrl: string): string | null {
  if (!url.startsWith(artifactBaseUrl)) return null;
  const suffix = url.slice(artifactBaseUrl.length);
  const decoded = decodeURIComponent(suffix);
  return decoded.replace(/^\/+/, '');
}

/**
 * Builds a CardContextResult from a card, optionally reading linked artifact file contents.
 *
 * Links whose URL starts with artifactBaseUrl are treated as local vault artifacts and
 * their file contents are read via vaultService. All other links are included as metadata.
 */
export async function buildCardContext(
  card: Card,
  vaultService: VaultService | null,
  artifactBaseUrl: string | null
): Promise<CardContextResult> {
  const links = card.frontmatter.links ?? [];
  const artifacts: ArtifactContext[] = [];
  const externalLinks: LinkContext[] = [];

  for (const link of links) {
    if (artifactBaseUrl && vaultService && link.url.startsWith(artifactBaseUrl)) {
      const relativePath = extractVaultPath(link.url, artifactBaseUrl);
      if (relativePath) {
        try {
          const content = await vaultService.readArtifactContent(relativePath);
          artifacts.push({ label: link.label, kind: link.kind, path: relativePath, content });
        } catch {
          // File unreadable — fall back to treating it as an external link
          externalLinks.push({ label: link.label, kind: link.kind, url: link.url });
        }
      } else {
        externalLinks.push({ label: link.label, kind: link.kind, url: link.url });
      }
    } else {
      externalLinks.push({ label: link.label, kind: link.kind, url: link.url });
    }
  }

  const tasks = card.tasks
    .map(t => `- [${t.checked ? 'x' : ' '}] ${t.text}`)
    .join('\n');

  const contextText = buildContextText(card, tasks, artifacts, externalLinks);

  return {
    cardId: card.cardId,
    slug: card.slug,
    title: card.frontmatter.title,
    description: card.frontmatter.description ?? null,
    tasks,
    artifacts,
    links: externalLinks,
    contextText,
  };
}

function buildContextText(
  card: Card,
  tasks: string,
  artifacts: ArtifactContext[],
  links: LinkContext[]
): string {
  const heading = card.cardId
    ? `# Card ${card.cardId}: ${card.frontmatter.title}`
    : `# Card: ${card.frontmatter.title}`;

  const parts: string[] = [heading, '', `**Lane:** ${card.lane}`];

  if (card.frontmatter.description) {
    parts.push('', '## Description', '', card.frontmatter.description);
  }

  if (card.tasks.length > 0) {
    parts.push('', '## Tasks', '', tasks);
  }

  for (const artifact of artifacts) {
    parts.push(
      '',
      `## Artifact: ${artifact.label} (${artifact.kind})`,
      '',
      '---',
      artifact.content,
      '---'
    );
  }

  if (links.length > 0) {
    parts.push('', '## Links', '');
    for (const link of links) {
      parts.push(`- [${link.label}](${link.url}) (${link.kind})`);
    }
  }

  return parts.join('\n');
}
