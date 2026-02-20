import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from '../services/project.service';
import { CardService } from '../services/card.service';
import { TaskService } from '../services/task.service';

describe('API improvements', () => {
  let testWorkspace: string;
  let projectService: ProjectService;
  let cardService: CardService;
  let taskService: TaskService;
  const projectSlug = 'test-project';

  beforeEach(async () => {
    testWorkspace = await mkdtemp(join(tmpdir(), 'devplanner-improvements-test-'));
    projectService = new ProjectService(testWorkspace);
    cardService = new CardService(testWorkspace);
    taskService = new TaskService(testWorkspace);
    await projectService.createProject('Test Project');
  });

  afterEach(async () => {
    try {
      await rm(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Card blockedReason and dueDate', () => {
    test('createCard stores blockedReason in frontmatter', async () => {
      const card = await cardService.createCard(projectSlug, {
        title: 'Blocked Card',
        status: 'blocked',
        blockedReason: 'Waiting for external dependency',
      });

      expect(card.frontmatter.blockedReason).toBe('Waiting for external dependency');

      // Verify persisted to disk
      const reloaded = await cardService.getCard(projectSlug, card.slug);
      expect(reloaded.frontmatter.blockedReason).toBe('Waiting for external dependency');
    });

    test('createCard stores dueDate in frontmatter', async () => {
      const card = await cardService.createCard(projectSlug, {
        title: 'Due Soon Card',
        dueDate: '2026-03-01',
      });

      expect(card.frontmatter.dueDate).toBe('2026-03-01');

      const reloaded = await cardService.getCard(projectSlug, card.slug);
      expect(reloaded.frontmatter.dueDate).toBe('2026-03-01');
    });

    test('updateCard sets blockedReason', async () => {
      const card = await cardService.createCard(projectSlug, { title: 'Card' });
      const updated = await cardService.updateCard(projectSlug, card.slug, {
        status: 'blocked',
        blockedReason: 'Dependency on other team',
      });

      expect(updated.frontmatter.blockedReason).toBe('Dependency on other team');
    });

    test('updateCard clears blockedReason when set to null', async () => {
      const card = await cardService.createCard(projectSlug, {
        title: 'Card',
        blockedReason: 'Initial reason',
      });
      const updated = await cardService.updateCard(projectSlug, card.slug, {
        blockedReason: null,
      });

      expect(updated.frontmatter.blockedReason).toBeUndefined();
    });

    test('updateCard sets dueDate', async () => {
      const card = await cardService.createCard(projectSlug, { title: 'Card' });
      const updated = await cardService.updateCard(projectSlug, card.slug, {
        dueDate: '2026-04-15',
      });

      expect(updated.frontmatter.dueDate).toBe('2026-04-15');
    });

    test('updateCard clears dueDate when set to null', async () => {
      const card = await cardService.createCard(projectSlug, {
        title: 'Card',
        dueDate: '2026-03-01',
      });
      const updated = await cardService.updateCard(projectSlug, card.slug, {
        dueDate: null,
      });

      expect(updated.frontmatter.dueDate).toBeUndefined();
    });
  });

  describe('Card listCards with since filter', () => {
    test('returns all cards when no since filter', async () => {
      await cardService.createCard(projectSlug, { title: 'Card A' });
      await cardService.createCard(projectSlug, { title: 'Card B' });

      const cards = await cardService.listCards(projectSlug);
      expect(cards.length).toBe(2);
    });

    test('returns only cards updated at or after since timestamp', async () => {
      await cardService.createCard(projectSlug, { title: 'Card A' });

      // Use a future since so no cards match
      const future = new Date(Date.now() + 60_000).toISOString();
      const cards = await cardService.listCards(projectSlug, undefined, future);
      expect(cards.length).toBe(0);
    });

    test('returns cards updated on or after since timestamp', async () => {
      const before = new Date(Date.now() - 60_000).toISOString();
      await cardService.createCard(projectSlug, { title: 'Card A' });

      const cards = await cardService.listCards(projectSlug, undefined, before);
      expect(cards.length).toBe(1);
    });
  });

  describe('Card listCards with staleDays filter', () => {
    test('excludes freshly created cards when staleDays=1', async () => {
      await cardService.createCard(projectSlug, { title: 'Fresh Card' });

      // staleDays=1 means only cards not updated in the past 1 day — a fresh card won't match
      const cards = await cardService.listCards(projectSlug, undefined, undefined, 1);
      expect(cards.length).toBe(0);
    });

    test('returns stale cards when their updated timestamp is older than threshold', async () => {
      await cardService.createCard(projectSlug, { title: 'Card' });
      // With staleDays=1000, all cards created more than 1000 days ago match — none here
      const stale = await cardService.listCards(projectSlug, undefined, undefined, 1000);
      expect(stale.length).toBe(0);
    });
  });

  describe('Task timestamps', () => {
    test('addTask records addedAt timestamp', async () => {
      const card = await cardService.createCard(projectSlug, { title: 'Card' });
      const before = new Date().toISOString();
      const task = await taskService.addTask(projectSlug, card.slug, 'New task');

      expect(task.addedAt).toBeDefined();
      expect(new Date(task.addedAt!).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime() - 100
      );
      expect(task.completedAt).toBeNull();
    });

    test('addTask persists taskMeta in frontmatter', async () => {
      const card = await cardService.createCard(projectSlug, { title: 'Card' });
      await taskService.addTask(projectSlug, card.slug, 'Task 1');

      const reloaded = await cardService.getCard(projectSlug, card.slug);
      expect(reloaded.frontmatter.taskMeta).toBeDefined();
      expect(reloaded.frontmatter.taskMeta!.length).toBe(1);
      expect(reloaded.frontmatter.taskMeta![0].addedAt).toBeDefined();
      expect(reloaded.frontmatter.taskMeta![0].completedAt).toBeNull();
    });

    test('getCard returns tasks with addedAt from taskMeta', async () => {
      const card = await cardService.createCard(projectSlug, { title: 'Card' });
      await taskService.addTask(projectSlug, card.slug, 'Task 1');

      const reloaded = await cardService.getCard(projectSlug, card.slug);
      expect(reloaded.tasks[0].addedAt).toBeDefined();
      expect(reloaded.tasks[0].completedAt).toBeNull();
    });

    test('setTaskChecked records completedAt when checked', async () => {
      const card = await cardService.createCard(projectSlug, { title: 'Card' });
      await taskService.addTask(projectSlug, card.slug, 'Task 1');

      const before = new Date().toISOString();
      const task = await taskService.setTaskChecked(projectSlug, card.slug, 0, true);

      expect(task.completedAt).toBeDefined();
      expect(new Date(task.completedAt!).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime() - 100
      );
    });

    test('setTaskChecked clears completedAt when unchecked', async () => {
      const card = await cardService.createCard(projectSlug, { title: 'Card' });
      await taskService.addTask(projectSlug, card.slug, 'Task 1');
      await taskService.setTaskChecked(projectSlug, card.slug, 0, true);

      const task = await taskService.setTaskChecked(projectSlug, card.slug, 0, false);
      expect(task.completedAt).toBeNull();
    });

    test('multiple tasks each get their own taskMeta entry', async () => {
      const card = await cardService.createCard(projectSlug, { title: 'Card' });
      await taskService.addTask(projectSlug, card.slug, 'Task 1');
      await taskService.addTask(projectSlug, card.slug, 'Task 2');

      const reloaded = await cardService.getCard(projectSlug, card.slug);
      expect(reloaded.frontmatter.taskMeta!.length).toBe(2);
      expect(reloaded.tasks[0].addedAt).toBeDefined();
      expect(reloaded.tasks[1].addedAt).toBeDefined();
    });
  });
});
