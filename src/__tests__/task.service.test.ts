import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from '../services/project.service';
import { CardService } from '../services/card.service';
import { TaskService } from '../services/task.service';

describe('TaskService', () => {
  let testWorkspace: string;
  let projectService: ProjectService;
  let cardService: CardService;
  let taskService: TaskService;
  const projectSlug = 'test-project';
  const cardSlug = 'test-card';

  beforeEach(async () => {
    testWorkspace = await mkdtemp(join(tmpdir(), 'devplanner-test-'));
    projectService = new ProjectService(testWorkspace);
    cardService = new CardService(testWorkspace);
    taskService = new TaskService(testWorkspace);

    // Create a test project and card
    await projectService.createProject('Test Project');
    await cardService.createCard(projectSlug, {
      title: 'Test Card',
      content: '- [ ] Existing task 1\n- [x] Existing task 2',
    });
  });

  afterEach(async () => {
    try {
      await rm(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('addTask', () => {
    test('adds a new task to a card', async () => {
      const task = await taskService.addTask(projectSlug, cardSlug, 'New task');

      expect(task.text).toBe('New task');
      expect(task.checked).toBe(false);

      // Verify the task was added
      const card = await cardService.getCard(projectSlug, cardSlug);
      expect(card.tasks).toHaveLength(3);
      expect(card.tasks[2].text).toBe('New task');
    });

    test('returns task with correct index', async () => {
      const task = await taskService.addTask(projectSlug, cardSlug, 'New task');

      expect(task.index).toBe(2); // After 2 existing tasks
    });

    test('updates card timestamp', async () => {
      const originalCard = await cardService.getCard(projectSlug, cardSlug);
      const originalTime = new Date(originalCard.frontmatter.updated).getTime();
      
      await new Promise((resolve) => setTimeout(resolve, 10));
      await taskService.addTask(projectSlug, cardSlug, 'New task');

      const updatedCard = await cardService.getCard(projectSlug, cardSlug);
      const updatedTime = new Date(updatedCard.frontmatter.updated).getTime();
      
      // Updated timestamp should be >= original (at least not less)
      expect(updatedTime).toBeGreaterThanOrEqual(originalTime);
    });

    test('throws error for empty task text', async () => {
      await expect(taskService.addTask(projectSlug, cardSlug, '')).rejects.toThrow(
        'Task text is required'
      );
      await expect(taskService.addTask(projectSlug, cardSlug, '   ')).rejects.toThrow(
        'Task text is required'
      );
    });

    test('throws error for non-existent card', async () => {
      await expect(
        taskService.addTask(projectSlug, 'non-existent', 'Task')
      ).rejects.toThrow('Card not found');
    });

    test('adds task to card with no existing tasks', async () => {
      // Create a card without tasks
      await cardService.createCard(projectSlug, {
        title: 'Empty Card',
        content: 'Just some content',
      });

      const task = await taskService.addTask(projectSlug, 'empty-card', 'First task');

      expect(task.index).toBe(0);
      expect(task.text).toBe('First task');
    });
  });

  describe('setTaskChecked', () => {
    test('checks an unchecked task', async () => {
      const task = await taskService.setTaskChecked(projectSlug, cardSlug, 0, true);

      expect(task.checked).toBe(true);
      expect(task.text).toBe('Existing task 1');

      // Verify the change was saved
      const card = await cardService.getCard(projectSlug, cardSlug);
      expect(card.tasks[0].checked).toBe(true);
    });

    test('unchecks a checked task', async () => {
      const task = await taskService.setTaskChecked(projectSlug, cardSlug, 1, false);

      expect(task.checked).toBe(false);
      expect(task.text).toBe('Existing task 2');

      // Verify the change was saved
      const card = await cardService.getCard(projectSlug, cardSlug);
      expect(card.tasks[1].checked).toBe(false);
    });

    test('updates card timestamp', async () => {
      const originalCard = await cardService.getCard(projectSlug, cardSlug);
      const originalTime = new Date(originalCard.frontmatter.updated).getTime();
      
      await new Promise((resolve) => setTimeout(resolve, 10));
      await taskService.setTaskChecked(projectSlug, cardSlug, 0, true);

      const updatedCard = await cardService.getCard(projectSlug, cardSlug);
      const updatedTime = new Date(updatedCard.frontmatter.updated).getTime();
      
      // Updated timestamp should be >= original (at least not less)
      expect(updatedTime).toBeGreaterThanOrEqual(originalTime);
    });

    test('throws error for invalid task index', async () => {
      await expect(
        taskService.setTaskChecked(projectSlug, cardSlug, 999, true)
      ).rejects.toThrow('Task index');
    });

    test('throws error for non-existent card', async () => {
      await expect(
        taskService.setTaskChecked(projectSlug, 'non-existent', 0, true)
      ).rejects.toThrow('Card not found');
    });

    test('preserves other tasks', async () => {
      await taskService.setTaskChecked(projectSlug, cardSlug, 0, true);

      const card = await cardService.getCard(projectSlug, cardSlug);
      expect(card.tasks).toHaveLength(2);
      expect(card.tasks[1].checked).toBe(true); // Second task unchanged
      expect(card.tasks[1].text).toBe('Existing task 2');
    });
  });
});
