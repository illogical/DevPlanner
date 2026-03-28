import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PromptService } from '../services/prompt.service';
import type { Card } from '../types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    slug: 'my-feature',
    filename: 'my-feature.md',
    lane: '01-upcoming',
    cardId: 'HX-42',
    frontmatter: {
      title: 'Implement Feature X',
      description: 'Add the feature X to the app.',
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-01T00:00:00Z',
    },
    content: '## Notes\n\nDo the thing.',
    tasks: [
      { index: 0, text: 'Design the schema', checked: false },
      { index: 1, text: 'Write migration', checked: true },
      { index: 2, text: 'Add tests', checked: false },
    ],
    ...overrides,
  };
}

describe('PromptService', () => {
  let service: PromptService;
  let tempDir: string;

  beforeEach(async () => {
    service = new PromptService();
    tempDir = await mkdtemp(join(tmpdir(), 'devplanner-prompt-test-'));
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('buildUserPrompt', () => {
    test('includes card ID and title', async () => {
      const card = makeCard();
      const result = await service.buildUserPrompt(card, 'hex');

      expect(result).toContain('HX-42');
      expect(result).toContain('Implement Feature X');
    });

    test('includes all tasks with indices and checked state', async () => {
      const card = makeCard();
      const result = await service.buildUserPrompt(card, 'hex');

      expect(result).toContain('- [ ] 0: Design the schema');
      expect(result).toContain('- [x] 1: Write migration');
      expect(result).toContain('- [ ] 2: Add tests');
    });

    test('includes card content', async () => {
      const card = makeCard();
      const result = await service.buildUserPrompt(card, 'hex');

      expect(result).toContain('Do the thing.');
    });

    test('includes description', async () => {
      const card = makeCard();
      const result = await service.buildUserPrompt(card, 'hex');

      expect(result).toContain('Add the feature X to the app.');
    });

    test('shows no tasks message when tasks array is empty', async () => {
      const card = makeCard({ tasks: [] });
      const result = await service.buildUserPrompt(card, 'hex');

      expect(result).toContain('_No tasks defined._');
    });
  });

  describe('buildSystemPrompt', () => {
    test('includes project and card slug', async () => {
      const card = makeCard();
      const result = await service.buildSystemPrompt(card, 'hex', 'card/my-feature', tempDir);

      expect(result).toContain('hex');
      expect(result).toContain('my-feature');
    });

    test('includes MCP tool names', async () => {
      const card = makeCard();
      const result = await service.buildSystemPrompt(card, 'hex', 'card/my-feature', tempDir);

      expect(result).toContain('mcp__devplanner__get_card');
      expect(result).toContain('mcp__devplanner__toggle_task');
      expect(result).toContain('mcp__devplanner__move_card');
    });

    test('includes branch name', async () => {
      const card = makeCard();
      const result = await service.buildSystemPrompt(card, 'hex', 'card/my-feature', tempDir);

      expect(result).toContain('card/my-feature');
    });

    test('includes REST fallback block', async () => {
      const card = makeCard();
      const result = await service.buildSystemPrompt(card, 'hex', 'card/my-feature', tempDir);

      expect(result).toContain('curl');
      expect(result).toContain('/api/projects/hex/cards/my-feature');
    });

    test('includes CLAUDE.md project context if present', async () => {
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Project Notes\n\nUse TypeScript.');
      const card = makeCard();
      const result = await service.buildSystemPrompt(card, 'hex', 'card/my-feature', tempDir);

      expect(result).toContain('Use TypeScript.');
    });

    test('works without CLAUDE.md', async () => {
      const card = makeCard();
      // tempDir has no CLAUDE.md
      const result = await service.buildSystemPrompt(card, 'hex', 'card/my-feature', tempDir);

      expect(result).toContain('Agent Instructions');
    });
  });

  describe('buildPrompts', () => {
    test('returns both system and user prompts', async () => {
      const card = makeCard();
      const result = await service.buildPrompts(card, 'hex', 'card/my-feature', tempDir);

      expect(result.systemPrompt).toBeTruthy();
      expect(result.userPrompt).toBeTruthy();
    });
  });
});
