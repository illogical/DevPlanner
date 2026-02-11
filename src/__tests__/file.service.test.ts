import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from '../services/project.service';
import { FileService } from '../services/file.service';

describe('FileService', () => {
  let testWorkspace: string;
  let projectService: ProjectService;
  let fileService: FileService;
  const projectSlug = 'test-project';

  beforeEach(async () => {
    testWorkspace = await mkdtemp(join(tmpdir(), 'devplanner-test-'));
    projectService = new ProjectService(testWorkspace);
    fileService = new FileService(testWorkspace);

    // Create a test project
    await projectService.createProject('Test Project');
  });

  afterEach(async () => {
    try {
      await rm(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('addFile', () => {
    test('adds a file with required fields', async () => {
      const buffer = Buffer.from('test content');
      const file = await fileService.addFile(projectSlug, 'test.txt', buffer);

      expect(file.filename).toBe('test.txt');
      expect(file.originalName).toBe('test.txt');
      expect(file.description).toBe('');
      expect(file.mimeType).toBe('text/plain');
      expect(file.size).toBe(buffer.length);
      expect(file.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(file.cardSlugs).toEqual([]);
    });

    test('adds a file with description', async () => {
      const buffer = Buffer.from('test content');
      const file = await fileService.addFile(
        projectSlug,
        'test.txt',
        buffer,
        'Test description'
      );

      expect(file.description).toBe('Test description');
    });

    test('deduplicates filenames', async () => {
      const buffer = Buffer.from('test content');
      
      const file1 = await fileService.addFile(projectSlug, 'test.txt', buffer);
      expect(file1.filename).toBe('test.txt');

      const file2 = await fileService.addFile(projectSlug, 'test.txt', buffer);
      expect(file2.filename).toBe('test-2.txt');

      const file3 = await fileService.addFile(projectSlug, 'test.txt', buffer);
      expect(file3.filename).toBe('test-3.txt');
    });

    test('detects MIME types correctly', async () => {
      const buffer = Buffer.from('test');
      
      const pdf = await fileService.addFile(projectSlug, 'doc.pdf', buffer);
      expect(pdf.mimeType).toBe('application/pdf');

      const md = await fileService.addFile(projectSlug, 'readme.md', buffer);
      expect(md.mimeType).toBe('text/markdown');

      const json = await fileService.addFile(projectSlug, 'data.json', buffer);
      expect(json.mimeType).toBe('application/json');

      const unknown = await fileService.addFile(projectSlug, 'file.xyz', buffer);
      expect(unknown.mimeType).toBe('application/octet-stream');
    });
  });

  describe('listFiles', () => {
    test('returns empty array for project with no files', async () => {
      const files = await fileService.listFiles(projectSlug);
      expect(files).toEqual([]);
    });

    test('returns all files in project', async () => {
      const buffer = Buffer.from('test');
      await fileService.addFile(projectSlug, 'file1.txt', buffer);
      await fileService.addFile(projectSlug, 'file2.md', buffer);
      await fileService.addFile(projectSlug, 'file3.pdf', buffer);

      const files = await fileService.listFiles(projectSlug);
      expect(files).toHaveLength(3);
      expect(files.map(f => f.filename)).toContain('file1.txt');
      expect(files.map(f => f.filename)).toContain('file2.md');
      expect(files.map(f => f.filename)).toContain('file3.pdf');
    });
  });

  describe('getFile', () => {
    test('returns file by filename', async () => {
      const buffer = Buffer.from('test content');
      await fileService.addFile(projectSlug, 'test.txt', buffer, 'Test file');

      const file = await fileService.getFile(projectSlug, 'test.txt');
      expect(file.filename).toBe('test.txt');
      expect(file.description).toBe('Test file');
    });

    test('throws error for non-existent file', async () => {
      await expect(
        fileService.getFile(projectSlug, 'nonexistent.txt')
      ).rejects.toThrow('File not found: nonexistent.txt');
    });
  });

  describe('deleteFile', () => {
    test('deletes file and returns associated cards', async () => {
      const buffer = Buffer.from('test');
      const file = await fileService.addFile(projectSlug, 'test.txt', buffer);
      
      // Associate with cards
      await fileService.associateFile(projectSlug, 'test.txt', 'card-1');
      await fileService.associateFile(projectSlug, 'test.txt', 'card-2');

      const result = await fileService.deleteFile(projectSlug, 'test.txt');
      expect(result.associatedCards).toEqual(['card-1', 'card-2']);

      // Verify file is gone from manifest
      const files = await fileService.listFiles(projectSlug);
      expect(files.find(f => f.filename === 'test.txt')).toBeUndefined();
    });

    test('throws error for non-existent file', async () => {
      await expect(
        fileService.deleteFile(projectSlug, 'nonexistent.txt')
      ).rejects.toThrow('File not found: nonexistent.txt');
    });
  });

  describe('updateFileDescription', () => {
    test('updates file description', async () => {
      const buffer = Buffer.from('test');
      await fileService.addFile(projectSlug, 'test.txt', buffer, 'Old description');

      const updated = await fileService.updateFileDescription(
        projectSlug,
        'test.txt',
        'New description'
      );

      expect(updated.description).toBe('New description');

      // Verify it persisted
      const file = await fileService.getFile(projectSlug, 'test.txt');
      expect(file.description).toBe('New description');
    });

    test('throws error for non-existent file', async () => {
      await expect(
        fileService.updateFileDescription(projectSlug, 'nonexistent.txt', 'desc')
      ).rejects.toThrow('File not found: nonexistent.txt');
    });
  });

  describe('associateFile', () => {
    test('associates file with card', async () => {
      const buffer = Buffer.from('test');
      await fileService.addFile(projectSlug, 'test.txt', buffer);

      const file = await fileService.associateFile(projectSlug, 'test.txt', 'card-1');
      expect(file.cardSlugs).toEqual(['card-1']);
    });

    test('does not duplicate associations', async () => {
      const buffer = Buffer.from('test');
      await fileService.addFile(projectSlug, 'test.txt', buffer);

      await fileService.associateFile(projectSlug, 'test.txt', 'card-1');
      const file = await fileService.associateFile(projectSlug, 'test.txt', 'card-1');
      
      expect(file.cardSlugs).toEqual(['card-1']);
    });

    test('allows multiple card associations', async () => {
      const buffer = Buffer.from('test');
      await fileService.addFile(projectSlug, 'test.txt', buffer);

      await fileService.associateFile(projectSlug, 'test.txt', 'card-1');
      await fileService.associateFile(projectSlug, 'test.txt', 'card-2');
      const file = await fileService.associateFile(projectSlug, 'test.txt', 'card-3');

      expect(file.cardSlugs).toEqual(['card-1', 'card-2', 'card-3']);
    });

    test('throws error for non-existent file', async () => {
      await expect(
        fileService.associateFile(projectSlug, 'nonexistent.txt', 'card-1')
      ).rejects.toThrow('File not found: nonexistent.txt');
    });
  });

  describe('disassociateFile', () => {
    test('removes card from file associations', async () => {
      const buffer = Buffer.from('test');
      await fileService.addFile(projectSlug, 'test.txt', buffer);
      await fileService.associateFile(projectSlug, 'test.txt', 'card-1');
      await fileService.associateFile(projectSlug, 'test.txt', 'card-2');

      const file = await fileService.disassociateFile(projectSlug, 'test.txt', 'card-1');
      expect(file.cardSlugs).toEqual(['card-2']);
    });

    test('handles disassociating non-associated card gracefully', async () => {
      const buffer = Buffer.from('test');
      await fileService.addFile(projectSlug, 'test.txt', buffer);

      const file = await fileService.disassociateFile(projectSlug, 'test.txt', 'card-1');
      expect(file.cardSlugs).toEqual([]);
    });
  });

  describe('listCardFiles', () => {
    test('returns only files associated with card', async () => {
      const buffer = Buffer.from('test');
      await fileService.addFile(projectSlug, 'file1.txt', buffer);
      await fileService.addFile(projectSlug, 'file2.txt', buffer);
      await fileService.addFile(projectSlug, 'file3.txt', buffer);

      await fileService.associateFile(projectSlug, 'file1.txt', 'card-1');
      await fileService.associateFile(projectSlug, 'file2.txt', 'card-1');
      await fileService.associateFile(projectSlug, 'file3.txt', 'card-2');

      const files = await fileService.listCardFiles(projectSlug, 'card-1');
      expect(files).toHaveLength(2);
      expect(files.map(f => f.filename)).toContain('file1.txt');
      expect(files.map(f => f.filename)).toContain('file2.txt');
    });

    test('returns empty array for card with no files', async () => {
      const files = await fileService.listCardFiles(projectSlug, 'card-1');
      expect(files).toEqual([]);
    });
  });

  describe('removeCardFromAllFiles', () => {
    test('removes card from all file associations', async () => {
      const buffer = Buffer.from('test');
      await fileService.addFile(projectSlug, 'file1.txt', buffer);
      await fileService.addFile(projectSlug, 'file2.txt', buffer);
      await fileService.addFile(projectSlug, 'file3.txt', buffer);

      await fileService.associateFile(projectSlug, 'file1.txt', 'card-1');
      await fileService.associateFile(projectSlug, 'file1.txt', 'card-2');
      await fileService.associateFile(projectSlug, 'file2.txt', 'card-1');
      await fileService.associateFile(projectSlug, 'file3.txt', 'card-2');

      await fileService.removeCardFromAllFiles(projectSlug, 'card-1');

      const file1 = await fileService.getFile(projectSlug, 'file1.txt');
      expect(file1.cardSlugs).toEqual(['card-2']);

      const file2 = await fileService.getFile(projectSlug, 'file2.txt');
      expect(file2.cardSlugs).toEqual([]);

      const file3 = await fileService.getFile(projectSlug, 'file3.txt');
      expect(file3.cardSlugs).toEqual(['card-2']);
    });

    test('handles card with no file associations gracefully', async () => {
      await fileService.removeCardFromAllFiles(projectSlug, 'card-1');
      // Should not throw error
    });
  });

  describe('getFilePath', () => {
    test('returns absolute path to file', async () => {
      const buffer = Buffer.from('test');
      await fileService.addFile(projectSlug, 'test.txt', buffer);

      const path = await fileService.getFilePath(projectSlug, 'test.txt');
      expect(path).toContain('_files');
      expect(path).toContain('test.txt');
      expect(path).toMatch(/^[\/\\]/); // Starts with / or \ (absolute path)
    });

    test('throws error for non-existent file', async () => {
      await expect(
        fileService.getFilePath(projectSlug, 'nonexistent.txt')
      ).rejects.toThrow('File not found: nonexistent.txt');
    });
  });

  describe('getFileContent', () => {
    test('returns content for text files', async () => {
      const content = 'Hello, world!';
      const buffer = Buffer.from(content);
      await fileService.addFile(projectSlug, 'test.txt', buffer);

      const result = await fileService.getFileContent(projectSlug, 'test.txt');
      expect(result.content).toBe(content);
      expect(result.mimeType).toBe('text/plain');
    });

    test('returns content for JSON files', async () => {
      const content = '{"key": "value"}';
      const buffer = Buffer.from(content);
      await fileService.addFile(projectSlug, 'data.json', buffer);

      const result = await fileService.getFileContent(projectSlug, 'data.json');
      expect(result.content).toBe(content);
      expect(result.mimeType).toBe('application/json');
    });

    test('returns content for Markdown files', async () => {
      const content = '# Header\n\nParagraph text.';
      const buffer = Buffer.from(content);
      await fileService.addFile(projectSlug, 'readme.md', buffer);

      const result = await fileService.getFileContent(projectSlug, 'readme.md');
      expect(result.content).toBe(content);
      expect(result.mimeType).toBe('text/markdown');
    });

    test('throws error for binary files', async () => {
      const buffer = Buffer.from('binary content');
      await fileService.addFile(projectSlug, 'document.pdf', buffer);

      await expect(
        fileService.getFileContent(projectSlug, 'document.pdf')
      ).rejects.toThrow('File is binary (application/pdf). Cannot read as text.');
    });

    test('throws error for image files', async () => {
      const buffer = Buffer.from('image data');
      await fileService.addFile(projectSlug, 'image.png', buffer);

      await expect(
        fileService.getFileContent(projectSlug, 'image.png')
      ).rejects.toThrow('File is binary (image/png). Cannot read as text.');
    });

    test('throws error for non-existent file', async () => {
      await expect(
        fileService.getFileContent(projectSlug, 'nonexistent.txt')
      ).rejects.toThrow('File not found: nonexistent.txt');
    });
  });
});
