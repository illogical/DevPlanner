import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from '../services/project.service';
import { CardService } from '../services/card.service';
import { TaskService } from '../services/task.service';

describe('CardService', () => {
  let testWorkspace: string;
  let projectService: ProjectService;
  let cardService: CardService;
  const projectSlug = 'test-project';

  beforeEach(async () => {
    testWorkspace = await mkdtemp(join(tmpdir(), 'devplanner-test-'));
    projectService = new ProjectService(testWorkspace);
    cardService = new CardService(testWorkspace);

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

  describe('createCard', () => {
    test('creates a card with required fields', async () => {
      const card = await cardService.createCard(projectSlug, {
        title: 'Test Card',
      });

      expect(card.slug).toBe('test-card');
      expect(card.filename).toBe('test-card.md');
      expect(card.lane).toBe('01-upcoming'); // default lane
      expect(card.frontmatter.title).toBe('Test Card');
      expect(card.frontmatter.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(card.frontmatter.updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(card.content).toBe('');
      expect(card.tasks).toHaveLength(0);
    });

    test('creates a card with all optional fields', async () => {
      const card = await cardService.createCard(projectSlug, {
        title: 'Full Card',
        lane: '02-in-progress',
        priority: 'high',
        assignee: 'user',
        tags: ['feature', 'urgent'],
        content: 'Card content\n\n- [ ] Task 1',
        status: 'in-progress',
      });

      expect(card.lane).toBe('02-in-progress');
      expect(card.frontmatter.priority).toBe('high');
      expect(card.frontmatter.assignee).toBe('user');
      expect(card.frontmatter.tags).toEqual(['feature', 'urgent']);
      expect(card.frontmatter.status).toBe('in-progress');
      expect(card.content).toContain('Card content');
      expect(card.tasks).toHaveLength(1);
    });

    test('slugifies card title', async () => {
      const card = await cardService.createCard(projectSlug, {
        title: 'My Test Card!',
      });

      expect(card.slug).toBe('my-test-card');
    });

    test('generates unique slug if duplicate exists', async () => {
      await cardService.createCard(projectSlug, { title: 'Test Card' });
      const card2 = await cardService.createCard(projectSlug, { title: 'Test Card' });

      expect(card2.slug).toBe('test-card-2');
    });

    test('handles multiple duplicates', async () => {
      await cardService.createCard(projectSlug, { title: 'Card' });
      await cardService.createCard(projectSlug, { title: 'Card' });
      const card3 = await cardService.createCard(projectSlug, { title: 'Card' });

      expect(card3.slug).toBe('card-3');
    });

    test('throws error if title is empty', async () => {
      await expect(cardService.createCard(projectSlug, { title: '' })).rejects.toThrow(
        'Card title is required'
      );
    });

    test('adds card to lane order file', async () => {
      await cardService.createCard(projectSlug, { title: 'Card 1' });
      await cardService.createCard(projectSlug, { title: 'Card 2' });

      const cards = await cardService.listCards(projectSlug, '01-upcoming');

      expect(cards).toHaveLength(2);
      expect(cards[0].slug).toBe('card-1');
      expect(cards[1].slug).toBe('card-2');
    });
  });

  describe('listCards', () => {
    test('returns empty array for project with no cards', async () => {
      const cards = await cardService.listCards(projectSlug);

      expect(cards).toHaveLength(0);
    });

    test('lists all cards across all lanes', async () => {
      await cardService.createCard(projectSlug, {
        title: 'Card 1',
        lane: '01-upcoming',
      });
      await cardService.createCard(projectSlug, {
        title: 'Card 2',
        lane: '02-in-progress',
      });
      await cardService.createCard(projectSlug, {
        title: 'Card 3',
        lane: '03-complete',
      });

      const cards = await cardService.listCards(projectSlug);

      expect(cards).toHaveLength(3);
    });

    test('filters cards by lane', async () => {
      await cardService.createCard(projectSlug, {
        title: 'Card 1',
        lane: '01-upcoming',
      });
      await cardService.createCard(projectSlug, {
        title: 'Card 2',
        lane: '02-in-progress',
      });

      const cards = await cardService.listCards(projectSlug, '01-upcoming');

      expect(cards).toHaveLength(1);
      expect(cards[0].slug).toBe('card-1');
    });

    test('includes task progress', async () => {
      await cardService.createCard(projectSlug, {
        title: 'Card',
        content: '- [ ] Task 1\n- [x] Task 2\n- [ ] Task 3',
      });

      const cards = await cardService.listCards(projectSlug);

      expect(cards[0].taskProgress.total).toBe(3);
      expect(cards[0].taskProgress.checked).toBe(1);
    });

    test('respects lane order', async () => {
      await cardService.createCard(projectSlug, { title: 'Card B' });
      await cardService.createCard(projectSlug, { title: 'Card A' });
      await cardService.createCard(projectSlug, { title: 'Card C' });

      const cards = await cardService.listCards(projectSlug, '01-upcoming');

      // Should be in creation order, not alphabetical
      expect(cards[0].slug).toBe('card-b');
      expect(cards[1].slug).toBe('card-a');
      expect(cards[2].slug).toBe('card-c');
    });
  });

  describe('getCard', () => {
    test('retrieves a card with full content', async () => {
      await cardService.createCard(projectSlug, {
        title: 'Test Card',
        content: 'Card body\n\n- [ ] Task 1',
        priority: 'high',
      });

      const card = await cardService.getCard(projectSlug, 'test-card');

      expect(card.slug).toBe('test-card');
      expect(card.frontmatter.title).toBe('Test Card');
      expect(card.frontmatter.priority).toBe('high');
      expect(card.content).toContain('Card body');
      expect(card.tasks).toHaveLength(1);
    });

    test('finds card in any lane', async () => {
      await cardService.createCard(projectSlug, {
        title: 'Card',
        lane: '02-in-progress',
      });

      const card = await cardService.getCard(projectSlug, 'card');

      expect(card.lane).toBe('02-in-progress');
    });

    test('throws error for non-existent card', async () => {
      await expect(cardService.getCard(projectSlug, 'non-existent')).rejects.toThrow(
        'Card not found'
      );
    });
  });

  describe('moveCard', () => {
    test('moves card between lanes', async () => {
      await cardService.createCard(projectSlug, {
        title: 'Card',
        lane: '01-upcoming',
      });

      const moved = await cardService.moveCard(projectSlug, 'card', '02-in-progress');

      expect(moved.lane).toBe('02-in-progress');

      // Verify it's no longer in the source lane
      const upcomingCards = await cardService.listCards(projectSlug, '01-upcoming');
      expect(upcomingCards).toHaveLength(0);

      // Verify it's in the target lane
      const inProgressCards = await cardService.listCards(projectSlug, '02-in-progress');
      expect(inProgressCards).toHaveLength(1);
    });

    test('updates card timestamp when moved', async () => {
      const original = await cardService.createCard(projectSlug, { title: 'Card' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const moved = await cardService.moveCard(projectSlug, 'card', '02-in-progress');

      expect(new Date(moved.frontmatter.updated).getTime()).toBeGreaterThan(
        new Date(original.frontmatter.updated).getTime()
      );
    });

    test('moves card to specific position', async () => {
      // Create three cards in target lane
      await cardService.createCard(projectSlug, {
        title: 'Card A',
        lane: '02-in-progress',
      });
      await cardService.createCard(projectSlug, {
        title: 'Card B',
        lane: '02-in-progress',
      });
      await cardService.createCard(projectSlug, {
        title: 'Card C',
        lane: '02-in-progress',
      });

      // Create a card to move
      await cardService.createCard(projectSlug, {
        title: 'New Card',
        lane: '01-upcoming',
      });

      // Move to position 1 (between A and B)
      await cardService.moveCard(projectSlug, 'new-card', '02-in-progress', 1);

      const cards = await cardService.listCards(projectSlug, '02-in-progress');

      expect(cards[0].slug).toBe('card-a');
      expect(cards[1].slug).toBe('new-card');
      expect(cards[2].slug).toBe('card-b');
      expect(cards[3].slug).toBe('card-c');
    });

    test('throws error for non-existent card', async () => {
      await expect(
        cardService.moveCard(projectSlug, 'non-existent', '02-in-progress')
      ).rejects.toThrow('Card not found');
    });
  });

  describe('archiveCard', () => {
    test('moves card to archive lane', async () => {
      await cardService.createCard(projectSlug, { title: 'Card' });

      await cardService.archiveCard(projectSlug, 'card');

      const card = await cardService.getCard(projectSlug, 'card');
      expect(card.lane).toBe('04-archive');
    });
  });

  describe('reorderCards', () => {
    test('reorders cards in a lane', async () => {
      await cardService.createCard(projectSlug, { title: 'Card A' });
      await cardService.createCard(projectSlug, { title: 'Card B' });
      await cardService.createCard(projectSlug, { title: 'Card C' });

      await cardService.reorderCards(projectSlug, '01-upcoming', [
        'card-c.md',
        'card-a.md',
        'card-b.md',
      ]);

      const cards = await cardService.listCards(projectSlug, '01-upcoming');

      expect(cards[0].slug).toBe('card-c');
      expect(cards[1].slug).toBe('card-a');
      expect(cards[2].slug).toBe('card-b');
    });

    test('appends unordered files alphabetically', async () => {
      await cardService.createCard(projectSlug, { title: 'Card A' });
      await cardService.createCard(projectSlug, { title: 'Card B' });
      await cardService.createCard(projectSlug, { title: 'Card C' });

      // Only specify order for some cards
      await cardService.reorderCards(projectSlug, '01-upcoming', ['card-c.md']);

      const cards = await cardService.listCards(projectSlug, '01-upcoming');

      expect(cards[0].slug).toBe('card-c');
      // Card A and B should be alphabetically sorted
      expect(cards[1].slug).toBe('card-a');
      expect(cards[2].slug).toBe('card-b');
    });

    test('throws error if file not in lane', async () => {
      await cardService.createCard(projectSlug, { title: 'Card A' });

      await expect(
        cardService.reorderCards(projectSlug, '01-upcoming', [
          'card-a.md',
          'non-existent.md',
        ])
      ).rejects.toThrow('Card not found in lane');
    });
  });

  describe('updateCard', () => {
    test('updates card title', async () => {
      await cardService.createCard(projectSlug, { title: 'Original Title' });

      const updated = await cardService.updateCard(projectSlug, 'original-title', {
        title: 'New Title',
      });

      expect(updated.frontmatter.title).toBe('New Title');
      expect(updated.slug).toBe('original-title'); // slug doesn't change
    });

    test('updates card status', async () => {
      await cardService.createCard(projectSlug, { title: 'Test Card' });

      const updated = await cardService.updateCard(projectSlug, 'test-card', {
        status: 'in-progress',
      });

      expect(updated.frontmatter.status).toBe('in-progress');
    });

    test('updates card priority', async () => {
      await cardService.createCard(projectSlug, { title: 'Test Card' });

      const updated = await cardService.updateCard(projectSlug, 'test-card', {
        priority: 'high',
      });

      expect(updated.frontmatter.priority).toBe('high');
    });

    test('updates card assignee', async () => {
      await cardService.createCard(projectSlug, { title: 'Test Card' });

      const updated = await cardService.updateCard(projectSlug, 'test-card', {
        assignee: 'agent',
      });

      expect(updated.frontmatter.assignee).toBe('agent');
    });

    test('updates card tags', async () => {
      await cardService.createCard(projectSlug, { title: 'Test Card' });

      const updated = await cardService.updateCard(projectSlug, 'test-card', {
        tags: ['feature', 'urgent'],
      });

      expect(updated.frontmatter.tags).toEqual(['feature', 'urgent']);
    });

    test('updates card content', async () => {
      await cardService.createCard(projectSlug, {
        title: 'Test Card',
        content: 'Original content',
      });

      const updated = await cardService.updateCard(projectSlug, 'test-card', {
        content: 'Updated content\n\n- [ ] New task',
      });

      expect(updated.content).toBe('Updated content\n\n- [ ] New task');
      expect(updated.tasks).toHaveLength(1);
      expect(updated.tasks[0].text).toBe('New task');
    });

    test('updates multiple fields at once', async () => {
      await cardService.createCard(projectSlug, { title: 'Test Card' });

      const updated = await cardService.updateCard(projectSlug, 'test-card', {
        title: 'New Title',
        priority: 'high',
        assignee: 'user',
        status: 'review',
        tags: ['enhancement'],
      });

      expect(updated.frontmatter.title).toBe('New Title');
      expect(updated.frontmatter.priority).toBe('high');
      expect(updated.frontmatter.assignee).toBe('user');
      expect(updated.frontmatter.status).toBe('review');
      expect(updated.frontmatter.tags).toEqual(['enhancement']);
    });

    test('removes optional field when set to null', async () => {
      await cardService.createCard(projectSlug, {
        title: 'Test Card',
        priority: 'high',
        assignee: 'user',
        status: 'in-progress',
        tags: ['feature'],
      });

      const updated = await cardService.updateCard(projectSlug, 'test-card', {
        priority: null,
        assignee: null,
        status: null,
        tags: null,
      });

      expect(updated.frontmatter.priority).toBeUndefined();
      expect(updated.frontmatter.assignee).toBeUndefined();
      expect(updated.frontmatter.status).toBeUndefined();
      expect(updated.frontmatter.tags).toBeUndefined();
    });

    test('preserves fields not included in update', async () => {
      await cardService.createCard(projectSlug, {
        title: 'Test Card',
        priority: 'high',
        assignee: 'user',
        tags: ['feature'],
      });

      const updated = await cardService.updateCard(projectSlug, 'test-card', {
        title: 'New Title',
      });

      expect(updated.frontmatter.title).toBe('New Title');
      expect(updated.frontmatter.priority).toBe('high'); // preserved
      expect(updated.frontmatter.assignee).toBe('user'); // preserved
      expect(updated.frontmatter.tags).toEqual(['feature']); // preserved
    });

    test('updates timestamp on modification', async () => {
      const created = await cardService.createCard(projectSlug, { title: 'Test Card' });
      const originalUpdated = created.frontmatter.updated;

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await cardService.updateCard(projectSlug, 'test-card', {
        title: 'New Title',
      });

      expect(updated.frontmatter.updated).not.toBe(originalUpdated);
      expect(new Date(updated.frontmatter.updated).getTime()).toBeGreaterThan(
        new Date(originalUpdated).getTime()
      );
    });

    test('throws error if card not found', async () => {
      await expect(
        cardService.updateCard(projectSlug, 'non-existent', { title: 'Test' })
      ).rejects.toThrow('Card not found');
    });
  });

  describe('updateCard — task preservation', () => {
    let taskService: TaskService;
    const testCardSlug = 'task-preservation-card';

    beforeEach(async () => {
      // Initialize TaskService with test workspace
      taskService = new TaskService(testWorkspace);
      
      // Create a card with tasks using the full service stack
      await cardService.createCard(projectSlug, {
        title: 'Task Preservation Card',
      });
      // Add tasks
      await taskService.addTask(projectSlug, testCardSlug, 'Task A');
      await taskService.addTask(projectSlug, testCardSlug, 'Task B');
      // Check the second task
      await taskService.setTaskChecked(projectSlug, testCardSlug, 1, true);
    });

    test('updating title only: task count unchanged', async () => {
      const result = await cardService.updateCard(projectSlug, testCardSlug, {
        title: 'New Title',
      });

      expect(result.tasks.length).toBe(2);
    });

    test('updating title only: task completion states unchanged', async () => {
      const result = await cardService.updateCard(projectSlug, testCardSlug, {
        title: 'New Title',
      });

      expect(result.tasks[0].checked).toBe(false);
      expect(result.tasks[1].checked).toBe(true);
    });

    test('updating content with description only (no ## Tasks section): tasks preserved', async () => {
      const result = await cardService.updateCard(projectSlug, testCardSlug, {
        content: 'New description text only',
      });

      expect(result.tasks.length).toBe(2);
      expect(result.tasks[0].text).toBe('Task A');
      expect(result.tasks[1].text).toBe('Task B');
    });

    test('updating content with description only: task completion states preserved', async () => {
      const result = await cardService.updateCard(projectSlug, testCardSlug, {
        content: 'New description text only',
      });

      expect(result.tasks[0].checked).toBe(false);
      expect(result.tasks[1].checked).toBe(true);
    });

    test('updating content AND title simultaneously: tasks preserved', async () => {
      // Create a card with 3 tasks (2 unchecked, 1 checked)
      const card3Slug = 'three-task-card';
      await cardService.createCard(projectSlug, {
        title: 'Three Task Card',
      });
      await taskService.addTask(projectSlug, card3Slug, 'Task One');
      await taskService.addTask(projectSlug, card3Slug, 'Task Two');
      await taskService.addTask(projectSlug, card3Slug, 'Task Three');
      await taskService.setTaskChecked(projectSlug, card3Slug, 2, true);

      const result = await cardService.updateCard(projectSlug, card3Slug, {
        title: 'New Title',
        content: 'Combined update description',
      });

      expect(result.tasks.length).toBe(3);
      expect(result.tasks[2].checked).toBe(true);
    });

    test('re-reading card from disk after title update confirms tasks persisted', async () => {
      await cardService.updateCard(projectSlug, testCardSlug, {
        title: 'Disk Verify Title',
      });

      // Fresh read from disk
      const card = await cardService.getCard(projectSlug, testCardSlug);

      expect(card.tasks.length).toBe(2);
    });

    test('re-reading card from disk after description update confirms tasks persisted', async () => {
      await cardService.updateCard(projectSlug, testCardSlug, {
        content: 'Disk verify description',
      });

      // Fresh read from disk
      const card = await cardService.getCard(projectSlug, testCardSlug);

      expect(card.tasks.length).toBe(2);
      expect(card.tasks[1].checked).toBe(true);
    });
  });
});
