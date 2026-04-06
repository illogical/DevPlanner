import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { CardLink, CreateLinkInput, UpdateLinkInput } from '../types';
import { MarkdownService } from './markdown.service';
import { resourceLock } from '../utils/resource-lock';
import { resolveCardRef, type CardLaneResult } from '../utils/card-resolver';

/**
 * Service for managing URL links within cards.
 * Mirrors the patterns from task.service.ts: per-card locking via the shared
 * resourceLock singleton, frontmatter mutation via MarkdownService.
 * See frontend counterpart: frontend/src/types/index.ts `CardLink`
 */
export class LinkService {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Find which lane a card is in by searching all lanes.
   * Accepts either a slug (filename without .md) or a card ID (e.g. DEV-42, dev42).
   * Returns { lane, slug } where slug is always the canonical filename-based slug.
   */
  private async findCardLane(
    projectSlug: string,
    cardRef: string
  ): Promise<CardLaneResult | null> {
    return resolveCardRef(this.workspacePath, projectSlug, cardRef);
  }

  /**
   * Validate and normalise a URL string.
   * Trims whitespace, parses via WHATWG URL, enforces http/https protocol.
   * Returns the normalised href on success; throws a structured API error on failure.
   */
  private validateUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
      throw { error: 'INVALID_URL', message: 'URL is required.' };
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw {
        error: 'INVALID_URL',
        message: `"${trimmed}" is not a valid URL. Use an absolute http or https URL.`,
      };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw {
        error: 'INVALID_URL',
        message: `Only http and https URLs are allowed. Got protocol "${parsed.protocol}".`,
      };
    }
    return parsed.href;
  }

  /**
   * Add a new link to a card.
   */
  async addLink(
    projectSlug: string,
    cardSlug: string,
    input: CreateLinkInput
  ): Promise<CardLink> {
    // Validate label
    const label = input.label?.trim() ?? '';
    if (!label) {
      throw { error: 'INVALID_LABEL', message: 'Label is required and must not be blank.' };
    }

    // Validate and normalise URL
    const normalizedUrl = this.validateUrl(input.url);

    const result = await this.findCardLane(projectSlug, cardSlug);
    if (!result) {
      throw new Error(`Card '${cardSlug}' not found in project '${projectSlug}'`);
    }

    const { lane, slug } = result;
    const releaseLock = await resourceLock.acquire(`${projectSlug}:card:${slug}`);

    try {
      const cardPath = join(this.workspacePath, projectSlug, lane, `${slug}.md`);
      const fileContent = await readFile(cardPath, 'utf-8');
      const { frontmatter, content } = MarkdownService.parse(fileContent);

      // Check for duplicate URL
      const existing = (frontmatter.links ?? []) as CardLink[];
      const duplicate = existing.find((l) => l.url === normalizedUrl);
      if (duplicate) {
        throw {
          error: 'DUPLICATE_LINK',
          message: `A link with URL "${normalizedUrl}" already exists on this card.`,
          existingLink: duplicate,
        };
      }

      const now = new Date().toISOString();
      const newLink: CardLink = {
        id: crypto.randomUUID(),
        label,
        url: normalizedUrl,
        kind: input.kind ?? 'other',
        createdAt: now,
        updatedAt: now,
      };

      if (!frontmatter.links) {
        frontmatter.links = [];
      }
      (frontmatter.links as CardLink[]).push(newLink);
      frontmatter.updated = now;
      frontmatter.version = (frontmatter.version ?? 1) + 1;

      const markdown = MarkdownService.serialize(frontmatter, content);
      await writeFile(cardPath, markdown);

      return newLink;
    } finally {
      releaseLock();
    }
  }

  /**
   * Update an existing link (partial update — only provided fields change).
   */
  async updateLink(
    projectSlug: string,
    cardSlug: string,
    linkId: string,
    input: UpdateLinkInput
  ): Promise<CardLink> {
    const result = await this.findCardLane(projectSlug, cardSlug);
    if (!result) {
      throw new Error(`Card '${cardSlug}' not found in project '${projectSlug}'`);
    }

    const { lane, slug } = result;
    const releaseLock = await resourceLock.acquire(`${projectSlug}:card:${slug}`);

    try {
      const cardPath = join(this.workspacePath, projectSlug, lane, `${slug}.md`);
      const fileContent = await readFile(cardPath, 'utf-8');
      const { frontmatter, content } = MarkdownService.parse(fileContent);

      const links = (frontmatter.links ?? []) as CardLink[];
      const idx = links.findIndex((l) => l.id === linkId);
      if (idx === -1) {
        throw { error: 'LINK_NOT_FOUND', message: `Link "${linkId}" not found on card "${slug}".` };
      }

      const existing = { ...links[idx] };

      // Validate label if provided
      if (input.label !== undefined) {
        const label = input.label.trim();
        if (!label) {
          throw { error: 'INVALID_LABEL', message: 'Label is required and must not be blank.' };
        }
        existing.label = label;
      }

      // Validate and check URL if provided
      if (input.url !== undefined) {
        const normalizedUrl = this.validateUrl(input.url);
        // Duplicate check (excluding self)
        const duplicate = links.find((l, i) => i !== idx && l.url === normalizedUrl);
        if (duplicate) {
          throw {
            error: 'DUPLICATE_LINK',
            message: `A link with URL "${normalizedUrl}" already exists on this card.`,
          };
        }
        existing.url = normalizedUrl;
      }

      if (input.kind !== undefined) {
        existing.kind = input.kind;
      }

      const now = new Date().toISOString();
      existing.updatedAt = now;
      links[idx] = existing;
      frontmatter.links = links;
      frontmatter.updated = now;
      frontmatter.version = (frontmatter.version ?? 1) + 1;

      const markdown = MarkdownService.serialize(frontmatter, content);
      await writeFile(cardPath, markdown);

      return existing;
    } finally {
      releaseLock();
    }
  }

  /**
   * Delete a link from a card by ID.
   */
  async deleteLink(
    projectSlug: string,
    cardSlug: string,
    linkId: string
  ): Promise<void> {
    const result = await this.findCardLane(projectSlug, cardSlug);
    if (!result) {
      throw new Error(`Card '${cardSlug}' not found in project '${projectSlug}'`);
    }

    const { lane, slug } = result;
    const releaseLock = await resourceLock.acquire(`${projectSlug}:card:${slug}`);

    try {
      const cardPath = join(this.workspacePath, projectSlug, lane, `${slug}.md`);
      const fileContent = await readFile(cardPath, 'utf-8');
      const { frontmatter, content } = MarkdownService.parse(fileContent);

      const links = (frontmatter.links ?? []) as CardLink[];
      const idx = links.findIndex((l) => l.id === linkId);
      if (idx === -1) {
        throw { error: 'LINK_NOT_FOUND', message: `Link "${linkId}" not found on card "${slug}".` };
      }

      links.splice(idx, 1);
      frontmatter.links = links;
      frontmatter.updated = new Date().toISOString();
      frontmatter.version = (frontmatter.version ?? 1) + 1;

      const markdown = MarkdownService.serialize(frontmatter, content);
      await writeFile(cardPath, markdown);
    } finally {
      releaseLock();
    }
  }
}
