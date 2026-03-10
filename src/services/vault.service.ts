import { mkdir, readFile, readdir, stat, unlink } from 'fs/promises';
import { join, resolve } from 'path';
import * as path from 'path';
import { slugify } from '../utils/slug';
import { LinkService } from './link.service';
import type { CardLink } from '../types';

export interface TreeFile { name: string; path: string; updatedAt: string; }
export interface TreeFolder { name: string; path: string; parentPath: string | null; count: number; files: TreeFile[]; }
export interface TreeError { path: string; error: string; }

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
   * Read raw content of a vault artifact file.
   * relativePath must be relative to vaultPath (no leading slash, no ../ traversal).
   * Throws structured errors for missing config, traversal attempts, or missing files.
   */
  async readArtifactContent(relativePath: string): Promise<string> {
    if (!relativePath || relativePath.trim() === '') {
      throw { error: 'INVALID_PATH', message: 'Path parameter is required and must not be empty.' };
    }

    const resolvedVault = resolve(this.vaultPath);
    const resolvedFile = resolve(this.vaultPath, relativePath);

    if (!resolvedFile.startsWith(resolvedVault + path.sep) && resolvedFile !== resolvedVault) {
      throw { error: 'INVALID_PATH', message: 'Path traversal detected. Path must be within the vault directory.' };
    }

    try {
      const content = await readFile(resolvedFile, 'utf-8');
      return content;
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        throw { error: 'FILE_NOT_FOUND', message: `File not found: ${relativePath}` };
      }
      throw err;
    }
  }

  async deleteArtifactFile(relativePath: string): Promise<void> {
    if (!relativePath || relativePath.trim() === '') {
      throw { error: 'INVALID_PATH', message: 'Path parameter is required and must not be empty.' };
    }
    const resolvedVault = resolve(this.vaultPath);
    const resolvedFile = resolve(this.vaultPath, relativePath);
    if (!resolvedFile.startsWith(resolvedVault + path.sep) && resolvedFile !== resolvedVault) {
      throw { error: 'INVALID_PATH', message: 'Path traversal detected. Path must be within the vault directory.' };
    }
    try {
      await unlink(resolvedFile);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        throw { error: 'FILE_NOT_FOUND', message: `File not found: ${relativePath}` };
      }
      throw err;
    }
  }

  async writeArtifactContent(relativePath: string, content: string): Promise<void> {
    if (!relativePath || relativePath.trim() === '') {
      throw { error: 'INVALID_PATH', message: 'Path parameter is required and must not be empty.' };
    }
    const resolvedVault = resolve(this.vaultPath);
    const resolvedFile = resolve(this.vaultPath, relativePath);
    if (!resolvedFile.startsWith(resolvedVault + path.sep) && resolvedFile !== resolvedVault) {
      throw { error: 'INVALID_PATH', message: 'Path traversal detected. Path must be within the vault directory.' };
    }
    await mkdir(path.dirname(resolvedFile), { recursive: true });
    await Bun.write(resolvedFile, content);
  }

  async listTree(): Promise<{ folders: TreeFolder[]; errors: TreeError[] }> {
    const resolvedVault = resolve(this.vaultPath);
    const folders: TreeFolder[] = [];
    const errors: TreeError[] = [];

    async function scanDir(dirPath: string, parentPath: string | null): Promise<void> {
      let entries: any[];
      try {
        entries = await readdir(dirPath, { withFileTypes: true });
      } catch (err: any) {
        errors.push({ path: dirPath, error: err.message });
        return;
      }

      const files: TreeFile[] = [];
      const subDirs: string[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = join(dirPath, entry.name);
        const relPath = path.relative(resolvedVault, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          subDirs.push(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const s = await stat(fullPath);
            files.push({ name: entry.name, path: relPath, updatedAt: s.mtime.toISOString() });
          } catch (err: any) {
            errors.push({ path: relPath, error: err.message });
          }
        }
      }

      // Sort files by updatedAt desc
      files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      const relDirPath = dirPath === resolvedVault ? '' : path.relative(resolvedVault, dirPath).replace(/\\/g, '/');
      const dirName = dirPath === resolvedVault ? '/' : path.basename(dirPath);

      if (files.length > 0 || subDirs.length > 0) {
        folders.push({
          name: dirName,
          path: relDirPath,
          parentPath,
          count: files.length,
          files,
        });
      }

      subDirs.sort();
      for (const subDir of subDirs) {
        await scanDir(subDir, relDirPath);
      }
    }

    await scanDir(resolvedVault, null);
    folders.sort((a, b) => a.path.localeCompare(b.path));
    return { folders, errors };
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
