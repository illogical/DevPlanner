import { mkdir } from 'fs/promises';
import { join } from 'path';
import * as path from 'path';
import { slugify } from '../utils/slug';
import { LinkService } from './link.service';
import type { CardLink } from '../types';

export interface CreateArtifactResult {
  link: CardLink;
  filePath: string;
}

/**
 * Service for writing Markdown artifacts to the Obsidian Vault and registering
 * them as links on the corresponding card.
 *
 * Files are written to: {vaultPath}/{projectSlug}/{cardSlug}/{TIMESTAMP}_{LABEL-SLUG}.md
 * Links are constructed using OBSIDIAN_BASE_URL as the base.
 *
 * workspacePath: kanban workspace — used by LinkService to locate card files
 * vaultPath: Obsidian vault root (OBSIDIAN_VAULT_PATH) — where artifact files are written
 */
export class VaultService {
  private vaultPath: string;
  private obsidianBaseUrl: string;
  private linkService: LinkService;

  constructor(workspacePath: string, vaultPath: string, obsidianBaseUrl: string) {
    this.vaultPath = vaultPath;
    this.obsidianBaseUrl = obsidianBaseUrl;
    this.linkService = new LinkService(workspacePath);
  }

  /**
   * Write a Markdown artifact to the vault and attach a link to the card.
   */
  async createArtifact(
    projectSlug: string,
    cardSlug: string,
    label: string,
    kind: CardLink['kind'],
    content: string
  ): Promise<CreateArtifactResult> {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      throw { error: 'INVALID_LABEL', message: 'Label is required and must not be blank.' };
    }

    // Generate filename: YYYY-MM-DD_HH-MM-SS_UPPERCASE-LABEL-SLUG.md
    const now = new Date();
    const timestamp = now.toISOString()
      .replace('T', '_')
      .replace(/:/g, '-')
      .slice(0, 19); // YYYY-MM-DD_HH-MM-SS
    const labelSlug = slugify(trimmedLabel).toUpperCase();
    const filename = `${timestamp}_${labelSlug}.md`;

    // Compute artifact directory and file path (inside vault, not workspace)
    const artifactDir = join(this.vaultPath, projectSlug, cardSlug);
    const filePath = join(artifactDir, filename);

    // Ensure directory exists
    await mkdir(artifactDir, { recursive: true });

    // Write file content
    await Bun.write(filePath, content);

    // Compute vault URL: base%2Frelative%2Fpath
    const relativePath = path.relative(this.vaultPath, filePath).replace(/\\/g, '/');
    const url = `${this.obsidianBaseUrl}%2F${encodeURIComponent(relativePath)}`;

    // Add link to card (in kanban workspace)
    const link = await this.linkService.addLink(projectSlug, cardSlug, {
      label: trimmedLabel,
      url,
      kind,
    });

    return { link, filePath };
  }
}
