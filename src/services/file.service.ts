import { readdir, readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname } from 'path';
import type { ProjectFileEntry, ProjectFilesManifest } from '../types';

/**
 * Get MIME type from file extension
 */
function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Determine if a MIME type is text-based
 */
function isTextFile(mimeType: string): boolean {
  if (mimeType.startsWith('text/')) return true;
  const textTypes = [
    'application/json',
    'application/javascript',
    'application/typescript',
    'application/xml',
    'application/yaml',
  ];
  return textTypes.includes(mimeType);
}

/**
 * Service for managing files within projects.
 */
export class FileService {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Get path to _files.json manifest for a project
   */
  private getManifestPath(projectSlug: string): string {
    return join(this.workspacePath, projectSlug, '_files.json');
  }

  /**
   * Get path to _files directory for a project
   */
  private getFilesDir(projectSlug: string): string {
    return join(this.workspacePath, projectSlug, '_files');
  }

  /**
   * Read the files manifest
   */
  private async readManifest(projectSlug: string): Promise<ProjectFilesManifest> {
    const manifestPath = this.getManifestPath(projectSlug);
    try {
      const content = await readFile(manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { files: [] };
    }
  }

  /**
   * Write the files manifest
   */
  private async writeManifest(
    projectSlug: string,
    manifest: ProjectFilesManifest
  ): Promise<void> {
    const manifestPath = this.getManifestPath(projectSlug);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Generate a unique filename by appending -2, -3, etc. if needed
   */
  private async generateUniqueFilename(
    projectSlug: string,
    originalName: string
  ): Promise<string> {
    const filesDir = this.getFilesDir(projectSlug);
    const ext = extname(originalName);
    const baseName = originalName.slice(0, originalName.length - ext.length);

    let filename = originalName;
    let counter = 2;

    while (true) {
      const filePath = join(filesDir, filename);
      try {
        await readFile(filePath);
        // File exists, try next number
        filename = `${baseName}-${counter}${ext}`;
        counter++;
      } catch {
        // File doesn't exist, we can use this name
        return filename;
      }
    }
  }

  /**
   * List all files in a project
   */
  async listFiles(projectSlug: string): Promise<ProjectFileEntry[]> {
    const manifest = await this.readManifest(projectSlug);
    return manifest.files;
  }

  /**
   * Get a specific file entry
   */
  async getFile(projectSlug: string, filename: string): Promise<ProjectFileEntry> {
    const manifest = await this.readManifest(projectSlug);
    const file = manifest.files.find((f) => f.filename === filename);
    if (!file) {
      throw new Error(`File not found: ${filename}`);
    }
    return file;
  }

  /**
   * List files associated with a specific card
   */
  async listCardFiles(projectSlug: string, cardSlug: string): Promise<ProjectFileEntry[]> {
    const manifest = await this.readManifest(projectSlug);
    return manifest.files.filter((f) => f.cardSlugs.includes(cardSlug));
  }

  /**
   * Add a new file to the project
   */
  async addFile(
    projectSlug: string,
    originalName: string,
    fileBuffer: Buffer | ArrayBuffer,
    description: string = ''
  ): Promise<ProjectFileEntry> {
    const filesDir = this.getFilesDir(projectSlug);
    
    // Create _files directory if it doesn't exist
    await mkdir(filesDir, { recursive: true });

    // Generate unique filename
    const filename = await this.generateUniqueFilename(projectSlug, originalName);
    const filePath = join(filesDir, filename);

    // Create file entry
    const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
    const entry: ProjectFileEntry = {
      filename,
      originalName,
      description,
      mimeType: getMimeType(filename),
      size: buffer.length,
      created: new Date().toISOString(),
      cardSlugs: [],
    };

    // Update manifest first
    const manifest = await this.readManifest(projectSlug);
    manifest.files.push(entry);
    await this.writeManifest(projectSlug, manifest);

    // Write physical file after manifest is updated
    try {
      await Bun.write(filePath, buffer);
    } catch (error) {
      // Rollback: remove from manifest if file write fails
      const rollbackManifest = await this.readManifest(projectSlug);
      const index = rollbackManifest.files.findIndex(f => f.filename === filename);
      if (index !== -1) {
        rollbackManifest.files.splice(index, 1);
        await this.writeManifest(projectSlug, rollbackManifest);
      }
      throw error;
    }

    return entry;
  }

  /**
   * Delete a file from the project
   */
  async deleteFile(
    projectSlug: string,
    filename: string
  ): Promise<{ associatedCards: string[] }> {
    const manifest = await this.readManifest(projectSlug);
    const fileIndex = manifest.files.findIndex((f) => f.filename === filename);
    
    if (fileIndex === -1) {
      throw new Error(`File not found: ${filename}`);
    }

    const file = manifest.files[fileIndex];
    const associatedCards = [...file.cardSlugs];

    // Delete physical file first
    const filePath = join(this.getFilesDir(projectSlug), filename);
    try {
      await unlink(filePath);
    } catch (error) {
      // If physical file doesn't exist, that's okay - continue with manifest cleanup
      console.warn(`Failed to delete file ${filePath}:`, error);
    }

    // Remove from manifest (after physical deletion)
    manifest.files.splice(fileIndex, 1);
    await this.writeManifest(projectSlug, manifest);

    return { associatedCards };
  }

  /**
   * Update a file's description
   */
  async updateFileDescription(
    projectSlug: string,
    filename: string,
    description: string
  ): Promise<ProjectFileEntry> {
    const manifest = await this.readManifest(projectSlug);
    const file = manifest.files.find((f) => f.filename === filename);

    if (!file) {
      throw new Error(`File not found: ${filename}`);
    }

    file.description = description;
    await this.writeManifest(projectSlug, manifest);

    return file;
  }

  /**
   * Associate a file with a card
   */
  async associateFile(
    projectSlug: string,
    filename: string,
    cardSlug: string
  ): Promise<ProjectFileEntry> {
    const manifest = await this.readManifest(projectSlug);
    const file = manifest.files.find((f) => f.filename === filename);

    if (!file) {
      throw new Error(`File not found: ${filename}`);
    }

    if (!file.cardSlugs.includes(cardSlug)) {
      file.cardSlugs.push(cardSlug);
      await this.writeManifest(projectSlug, manifest);
    }

    return file;
  }

  /**
   * Disassociate a file from a card
   */
  async disassociateFile(
    projectSlug: string,
    filename: string,
    cardSlug: string
  ): Promise<ProjectFileEntry> {
    const manifest = await this.readManifest(projectSlug);
    const file = manifest.files.find((f) => f.filename === filename);

    if (!file) {
      throw new Error(`File not found: ${filename}`);
    }

    const index = file.cardSlugs.indexOf(cardSlug);
    if (index !== -1) {
      file.cardSlugs.splice(index, 1);
      await this.writeManifest(projectSlug, manifest);
    }

    return file;
  }

  /**
   * Remove a card from all file associations (called when card is deleted)
   */
  async removeCardFromAllFiles(projectSlug: string, cardSlug: string): Promise<void> {
    const manifest = await this.readManifest(projectSlug);
    let modified = false;

    for (const file of manifest.files) {
      const index = file.cardSlugs.indexOf(cardSlug);
      if (index !== -1) {
        file.cardSlugs.splice(index, 1);
        modified = true;
      }
    }

    if (modified) {
      await this.writeManifest(projectSlug, manifest);
    }
  }

  /**
   * Get the absolute path to a file
   */
  async getFilePath(projectSlug: string, filename: string): Promise<string> {
    // Verify file exists in manifest
    await this.getFile(projectSlug, filename);
    return join(this.getFilesDir(projectSlug), filename);
  }

  /**
   * Get file content (text files only)
   */
  async getFileContent(
    projectSlug: string,
    filename: string
  ): Promise<{ content: string; mimeType: string }> {
    const file = await this.getFile(projectSlug, filename);

    if (!isTextFile(file.mimeType)) {
      throw new Error(
        `File is binary (${file.mimeType}). Cannot read as text. Please rely on the file description instead.`
      );
    }

    const filePath = join(this.getFilesDir(projectSlug), filename);
    const content = await readFile(filePath, 'utf-8');

    return {
      content,
      mimeType: file.mimeType,
    };
  }

  /**
   * Create a text file and associate it with a card (atomic operation)
   */
  async addFileToCard(
    projectSlug: string,
    cardSlug: string,
    filename: string,
    content: string,
    description: string = '',
    cardPrefix?: string,
    cardNumber?: number
  ): Promise<ProjectFileEntry> {
    // Validate inputs
    if (!filename || filename.trim() === '') {
      throw new Error('Filename cannot be empty');
    }
    
    if (filename.includes('/') || filename.includes('\\')) {
      throw new Error('Filename cannot contain path separators');
    }
    
    if (!content || content.trim() === '') {
      throw new Error('File content cannot be empty');
    }

    // Add .md extension if no extension is provided
    if (!filename.includes('.')) {
      filename = `${filename}.md`;
    }

    // Prepend card ID to filename (format: {PREFIX}-{cardNumber}_{filename})
    if (cardPrefix && cardNumber) {
      const cardId = `${cardPrefix}-${cardNumber}`;
      filename = `${cardId}_${filename}`;
    }

    // Create file buffer from UTF-8 string
    const buffer = Buffer.from(content, 'utf-8');

    // Add file to project (handles deduplication, MIME detection)
    const fileEntry = await this.addFile(projectSlug, filename, buffer, description);

    // Associate with card (may fail if card doesn't exist)
    const updatedEntry = await this.associateFile(projectSlug, fileEntry.filename, cardSlug);

    return updatedEntry;
  }
}
