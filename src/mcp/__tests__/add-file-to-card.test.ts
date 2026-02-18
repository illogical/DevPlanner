import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from '../../services/project.service.js';
import { CardService } from '../../services/card.service.js';
import { FileService } from '../../services/file.service.js';
import { ConfigService } from '../../services/config.service.js';
import { toolHandlers, _resetServicesCache } from '../tool-handlers.js';
import type { AddFileToCardInput } from '../types.js';

describe('MCP Tool: add_file_to_card', () => {
  let testWorkspace: string;
  let projectService: ProjectService;
  let cardService: CardService;
  let fileService: FileService;
  const projectSlug = 'test-project';
  let cardSlug: string;

  beforeEach(async () => {
    testWorkspace = await mkdtemp(join(tmpdir(), 'devplanner-mcp-test-'));
    process.env.DEVPLANNER_WORKSPACE = testWorkspace;
    
    // Reset singletons to force fresh instances with test workspace
    ConfigService._resetInstance();
    _resetServicesCache();
    
    projectService = new ProjectService(testWorkspace);
    cardService = new CardService(testWorkspace);
    fileService = new FileService(testWorkspace);

    // Create a test project with a card
    await projectService.createProject('Test Project', 'A test project');
    const card = await cardService.createCard(projectSlug, {
      title: 'Test Card',
      lane: '01-upcoming',
      content: 'Test card content',
    });
    cardSlug = card.slug;
  });

  afterEach(async () => {
    try {
      await rm(testWorkspace, { recursive: true, force: true });
      delete process.env.DEVPLANNER_WORKSPACE;
    } catch {
      // Ignore cleanup errors
    }
  });

  test('creates file and associates with card', async () => {
    const input: AddFileToCardInput = {
      projectSlug,
      cardSlug,
      filename: 'technical-spec.md',
      content: '# Technical Specification\n\n## Overview\n\nTest content',
      description: 'Technical spec for test card',
    };

    const result = await toolHandlers.add_file_to_card(input);

    // Verify response structure
    expect(result.filename).toBe('technical-spec.md');
    expect(result.originalName).toBe('technical-spec.md');
    expect(result.description).toBe('Technical spec for test card');
    expect(result.mimeType).toBe('text/markdown');
    expect(result.size).toBeGreaterThan(0);
    expect(result.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.associatedCards).toContain(cardSlug);
    expect(result.message).toContain('Successfully created');
    expect(result.message).toContain('technical-spec.md');
    expect(result.message).toContain(cardSlug);

    // Verify file exists in project
    const files = await fileService.listFiles(projectSlug);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('technical-spec.md');

    // Verify file is associated with card
    const cardFiles = await fileService.listCardFiles(projectSlug, cardSlug);
    expect(cardFiles).toHaveLength(1);
    expect(cardFiles[0].filename).toBe('technical-spec.md');
  });

  test('throws error if project not found', async () => {
    const input: AddFileToCardInput = {
      projectSlug: 'nonexistent-project',
      cardSlug,
      filename: 'test.md',
      content: 'Test content',
    };

    try {
      await toolHandlers.add_file_to_card(input);
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.code).toBe('PROJECT_NOT_FOUND');
      expect(error.message).toContain('nonexistent-project');
      expect(error.suggestions).toBeDefined();
      expect(error.suggestions.length).toBeGreaterThan(0);
    }
  });

  test('throws error if card not found', async () => {
    const input: AddFileToCardInput = {
      projectSlug,
      cardSlug: 'nonexistent-card',
      filename: 'test.md',
      content: 'Test content',
    };

    try {
      await toolHandlers.add_file_to_card(input);
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.code).toBe('CARD_NOT_FOUND');
      expect(error.message).toContain('nonexistent-card');
      expect(error.suggestions).toBeDefined();
      expect(error.suggestions.length).toBeGreaterThan(0);
    }
  });

  test('rejects empty content', async () => {
    const input: AddFileToCardInput = {
      projectSlug,
      cardSlug,
      filename: 'empty.md',
      content: '',
    };

    try {
      await toolHandlers.add_file_to_card(input);
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.message).toContain('cannot be empty');
      expect(error.suggestions).toBeDefined();
      expect(error.suggestions.length).toBeGreaterThan(0);
    }
  });

  test('handles filename deduplication', async () => {
    // Create first file
    const input1: AddFileToCardInput = {
      projectSlug,
      cardSlug,
      filename: 'spec.md',
      content: 'First spec',
    };
    const result1 = await toolHandlers.add_file_to_card(input1);
    expect(result1.filename).toBe('spec.md');
    expect(result1.message).not.toContain('deduplicated');

    // Create second file with same name
    const input2: AddFileToCardInput = {
      projectSlug,
      cardSlug,
      filename: 'spec.md',
      content: 'Second spec',
    };
    const result2 = await toolHandlers.add_file_to_card(input2);
    expect(result2.filename).toBe('spec-2.md');
    expect(result2.originalName).toBe('spec.md');
    expect(result2.message).toContain('deduplicated');
    
    // Both files should be associated with the card
    const cardFiles = await fileService.listCardFiles(projectSlug, cardSlug);
    expect(cardFiles).toHaveLength(2);
  });

  test('description is optional and defaults to empty string', async () => {
    const inputWithoutDesc: AddFileToCardInput = {
      projectSlug,
      cardSlug,
      filename: 'no-desc.md',
      content: 'Content without description',
    };

    const result1 = await toolHandlers.add_file_to_card(inputWithoutDesc);
    expect(result1.description).toBe('');

    const inputWithDesc: AddFileToCardInput = {
      projectSlug,
      cardSlug,
      filename: 'with-desc.md',
      content: 'Content with description',
      description: 'Custom description',
    };

    const result2 = await toolHandlers.add_file_to_card(inputWithDesc);
    expect(result2.description).toBe('Custom description');
  });
});
