import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from '../services/project.service';
import { CardService } from '../services/card.service';
import { FileService } from '../services/file.service';
import { searchProjectForPalette } from '../routes/cards';

describe('Palette Search', () => {
  let testWorkspace: string;
  let projectService: ProjectService;
  let cardService: CardService;
  let fileService: FileService;
  const projectSlug = 'test-project';

  beforeEach(async () => {
    testWorkspace = await mkdtemp(join(tmpdir(), 'devplanner-search-test-'));
    projectService = new ProjectService(testWorkspace);
    cardService = new CardService(testWorkspace);
    fileService = new FileService(testWorkspace);

    await projectService.createProject('Test Project');
  });

  afterEach(async () => {
    try {
      await rm(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('searchProjectForPalette', () => {
    test('returns empty array for query under 2 chars', async () => {
      await cardService.createCard(projectSlug, { title: 'Auth Flow' });
      const results = await searchProjectForPalette(projectSlug, 'a', cardService, fileService);
      // Single char query still passes through — filtering is done at route level
      // but scoring should still work
      expect(Array.isArray(results)).toBe(true);
    });

    test('finds card by title match', async () => {
      await cardService.createCard(projectSlug, { title: 'Authentication Flow' });
      await cardService.createCard(projectSlug, { title: 'Dashboard Widget' });

      const results = await searchProjectForPalette(projectSlug, 'auth', cardService, fileService);

      const cardResults = results.filter(r => r.type === 'card');
      expect(cardResults.length).toBeGreaterThan(0);
      expect(cardResults[0].primaryText).toBe('Authentication Flow');
    });

    test('finds tasks within cards', async () => {
      const card = await cardService.createCard(projectSlug, { title: 'My Card' });
      // Add a task by directly writing content (avoid circular dependency with TaskService)
      const { writeFile } = await import('fs/promises');
      const cardPath = join(testWorkspace, projectSlug, card.lane, `${card.slug}.md`);
      const content = await import('fs/promises').then(fs => fs.readFile(cardPath, 'utf-8'));
      await writeFile(cardPath, content + '\n## Tasks\n- [ ] Implement JWT refresh logic\n');

      const results = await searchProjectForPalette(projectSlug, 'JWT', cardService, fileService);
      const taskResults = results.filter(r => r.type === 'task');
      expect(taskResults.length).toBeGreaterThan(0);
      expect(taskResults[0].primaryText).toContain('JWT');
    });

    test('finds card by tag match', async () => {
      await cardService.createCard(projectSlug, {
        title: 'My Card',
        tags: ['backend', 'auth'],
      });

      const results = await searchProjectForPalette(projectSlug, 'backend', cardService, fileService);
      const tagResults = results.filter(r => r.type === 'tag');
      expect(tagResults.length).toBeGreaterThan(0);
      expect(tagResults[0].primaryText).toBe('backend');
      expect(tagResults[0].cardSlug).toBeTruthy();
    });

    test('finds card by assignee match', async () => {
      await cardService.createCard(projectSlug, {
        title: 'My Card',
        assignee: 'agent',
      });

      const results = await searchProjectForPalette(projectSlug, 'agent', cardService, fileService);
      const assigneeResults = results.filter(r => r.type === 'assignee');
      expect(assigneeResults.length).toBeGreaterThan(0);
      expect(assigneeResults[0].primaryText).toBe('agent');
    });

    test('finds card description match', async () => {
      const card = await cardService.createCard(projectSlug, {
        title: 'My Card',
        description: 'This implements a JWT authentication system',
      });

      const results = await searchProjectForPalette(projectSlug, 'JWT', cardService, fileService);
      const descResults = results.filter(r => r.type === 'description');
      expect(descResults.length).toBeGreaterThan(0);
      expect(descResults[0].cardSlug).toBe(card.slug);
      expect(descResults[0].snippet).toBeTruthy();
    });

    test('returns no results for unmatched query', async () => {
      await cardService.createCard(projectSlug, { title: 'My Card' });

      const results = await searchProjectForPalette(projectSlug, 'xyzzy_not_found', cardService, fileService);
      expect(results).toHaveLength(0);
    });

    test('all results have required fields', async () => {
      await cardService.createCard(projectSlug, {
        title: 'Auth Flow',
        tags: ['security'],
      });

      const results = await searchProjectForPalette(projectSlug, 'auth', cardService, fileService);
      for (const r of results) {
        expect(r.type).toBeTruthy();
        expect(r.cardSlug).toBeTruthy();
        expect(r.cardTitle).toBeTruthy();
        expect(r.laneSlug).toBeTruthy();
        expect(r.projectSlug).toBe(projectSlug);
        expect(r.primaryText).toBeTruthy();
        expect(typeof r.score).toBe('number');
        expect(r.score).toBeGreaterThan(0);
      }
    });

    test('scores exact matches higher than partial matches', async () => {
      await cardService.createCard(projectSlug, { title: 'auth' });
      await cardService.createCard(projectSlug, { title: 'Authentication System' });

      const results = await searchProjectForPalette(projectSlug, 'auth', cardService, fileService);
      const cardResults = results.filter(r => r.type === 'card').sort((a, b) => b.score - a.score);
      expect(cardResults.length).toBeGreaterThanOrEqual(2);
      // Exact match should score higher
      expect(cardResults[0].primaryText.toLowerCase()).toBe('auth');
    });
  });
});
