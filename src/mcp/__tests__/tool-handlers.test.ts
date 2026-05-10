import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from '../../services/project.service.js';
import { CardService } from '../../services/card.service.js';
import { TaskService } from '../../services/task.service.js';
import { ConfigService } from '../../services/config.service.js';
import { toolHandlers, _resetServicesCache } from '../tool-handlers.js';
import type {
  ListProjectsInput,
  GetProjectInput,
  CreateProjectInput,
  ListCardsInput,
  GetCardInput,
  CreateCardInput,
  UpdateCardInput,
  MoveCardInput,
  AddTaskInput,
  ToggleTaskInput,
  GetBoardOverviewInput,
  GetNextTasksInput,
} from '../types.js';

describe('MCP Tool Handlers', () => {
  let testWorkspace: string;
  let projectService: ProjectService;
  let cardService: CardService;
  let taskService: TaskService;
  const projectSlug = 'test-project';

  beforeEach(async () => {
    testWorkspace = await mkdtemp(join(tmpdir(), 'devplanner-mcp-test-'));
    process.env.DEVPLANNER_WORKSPACE = testWorkspace;
    
    // Reset singletons to force fresh instances with test workspace
    ConfigService._resetInstance();
    _resetServicesCache();
    
    projectService = new ProjectService(testWorkspace);
    cardService = new CardService(testWorkspace);
    taskService = new TaskService(testWorkspace);

    // Create a test project with sample cards
    await projectService.createProject('Test Project', 'A test project');
    await cardService.createCard(projectSlug, {
      title: 'Card 1',
      lane: '01-upcoming',
      priority: 'high',
      assignee: 'agent',
      content: 'Card 1 content',
    });
    await cardService.createCard(projectSlug, {
      title: 'Card 2',
      lane: '02-in-progress',
      priority: 'medium',
      assignee: 'user',
      content: 'Card 2 content',
    });
  });

  afterEach(async () => {
    try {
      await rm(testWorkspace, { recursive: true, force: true });
      delete process.env.DEVPLANNER_WORKSPACE;
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('list_projects', () => {
    test('lists all projects', async () => {
      const input: ListProjectsInput = {};
      const result = await toolHandlers.list_projects(input);

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].slug).toBe(projectSlug);
      expect(result.projects[0].name).toBe('Test Project');
      expect(result.total).toBe(1);
    });

    test('excludes archived projects by default', async () => {
      // Archive the project
      await projectService.archiveProject(projectSlug);

      const input: ListProjectsInput = {};
      const result = await toolHandlers.list_projects(input);

      expect(result.projects).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    test('includes archived projects when requested', async () => {
      // Archive the project
      await projectService.archiveProject(projectSlug);

      const input: ListProjectsInput = { includeArchived: true };
      const result = await toolHandlers.list_projects(input);

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].archived).toBe(true);
      expect(result.total).toBe(1);
    });
  });

  describe('get_project', () => {
    test('gets project details', async () => {
      const input: GetProjectInput = { projectSlug };
      const result = await toolHandlers.get_project(input);

      expect(result.project.slug).toBe(projectSlug);
      expect(result.project.name).toBe('Test Project');
      expect(result.project.description).toBe('A test project');
    });

    test('throws error for non-existent project', async () => {
      const input: GetProjectInput = { projectSlug: 'non-existent' };

      await expect(toolHandlers.get_project(input)).rejects.toThrow();
    });
  });

  describe('create_project', () => {
    test('creates a new project', async () => {
      const input: CreateProjectInput = {
        name: 'New Project',
        description: 'A new test project',
      };
      const result = await toolHandlers.create_project(input);

      expect(result.project.name).toBe('New Project');
      expect(result.project.description).toBe('A new test project');
      expect(result.project.slug).toBe('new-project');
    });
  });

  describe('list_cards', () => {
    test('lists all cards in a project', async () => {
      const input: ListCardsInput = { projectSlug };
      const result = await toolHandlers.list_cards(input);

      expect(result.cards).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    test('filters cards by lane', async () => {
      const input: ListCardsInput = {
        projectSlug,
        lane: '01-upcoming',
      };
      const result = await toolHandlers.list_cards(input);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].frontmatter.title).toBe('Card 1');
    });

    test('filters cards by priority', async () => {
      const input: ListCardsInput = {
        projectSlug,
        priority: 'high',
      };
      const result = await toolHandlers.list_cards(input);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].frontmatter.priority).toBe('high');
    });

    test('filters cards by assignee', async () => {
      const input: ListCardsInput = {
        projectSlug,
        assignee: 'agent',
      };
      const result = await toolHandlers.list_cards(input);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].frontmatter.assignee).toBe('agent');
    });

    test('throws error for non-existent project', async () => {
      const input: ListCardsInput = { projectSlug: 'non-existent' };

      await expect(toolHandlers.list_cards(input)).rejects.toThrow();
    });
  });

  describe('get_card', () => {
    test('gets full card details', async () => {
      const input: GetCardInput = {
        projectSlug,
        cardSlug: 'card-1',
      };
      const result = await toolHandlers.get_card(input);

      expect(result.card.slug).toBe('card-1');
      expect(result.card.frontmatter.title).toBe('Card 1');
      expect(result.card.content).toContain('Card 1 content');
    });

    test('throws error for non-existent card', async () => {
      const input: GetCardInput = {
        projectSlug,
        cardSlug: 'non-existent',
      };

      await expect(toolHandlers.get_card(input)).rejects.toThrow();
    });
  });

  describe('create_card', () => {
    test('creates a new card', async () => {
      const input: CreateCardInput = {
        projectSlug,
        title: 'New Card',
        priority: 'low',
        assignee: 'user',
        content: 'New card content',
      };
      const result = await toolHandlers.create_card(input);

      expect(result.card.frontmatter.title).toBe('New Card');
      expect(result.card.frontmatter.priority).toBe('low');
      expect(result.card.frontmatter.assignee).toBe('user');
      expect(result.card.content).toContain('New card content');
      expect(result.card.lane).toBe('01-upcoming'); // Default lane
    });

    test('creates card in specified lane', async () => {
      const input: CreateCardInput = {
        projectSlug,
        title: 'In Progress Card',
        lane: '02-in-progress',
      };
      const result = await toolHandlers.create_card(input);

      expect(result.card.lane).toBe('02-in-progress');
    });
  });

  describe('update_card', () => {
    test('updates card metadata', async () => {
      const input: UpdateCardInput = {
        projectSlug,
        cardSlug: 'card-1',
        priority: 'low',
        status: 'in-progress',
      };
      const result = await toolHandlers.update_card(input);

      expect(result.card.frontmatter.priority).toBe('low');
      expect(result.card.frontmatter.status).toBe('in-progress');
    });

    test('clears fields when set to null', async () => {
      const input: UpdateCardInput = {
        projectSlug,
        cardSlug: 'card-1',
        priority: null,
      };
      const result = await toolHandlers.update_card(input);

      expect(result.card.frontmatter.priority).toBeUndefined();
    });
  });

  describe('move_card', () => {
    test('moves card to different lane', async () => {
      const input: MoveCardInput = {
        projectSlug,
        cardSlug: 'card-1',
        targetLane: '02-in-progress',
      };
      const result = await toolHandlers.move_card(input);

      expect(result.card.lane).toBe('02-in-progress');
    });

    test('throws error for invalid lane', async () => {
      const input: MoveCardInput = {
        projectSlug,
        cardSlug: 'card-1',
        targetLane: 'invalid-lane',
      };

      await expect(toolHandlers.move_card(input)).rejects.toThrow();
    });
  });

  describe('add_task', () => {
    test('adds a task to a card', async () => {
      const input: AddTaskInput = {
        projectSlug,
        cardSlug: 'card-1',
        text: 'New task',
      };
      const result = await toolHandlers.add_task(input);

      expect(result.task.text).toBe('New task');
      expect(result.task.checked).toBe(false);
      expect(result.card.slug).toBe('card-1');
    });

    test('throws error for empty task text', async () => {
      const input: AddTaskInput = {
        projectSlug,
        cardSlug: 'card-1',
        text: '   ',
      };

      await expect(toolHandlers.add_task(input)).rejects.toThrow();
    });

    test('throws error for task text exceeding limit', async () => {
      const input: AddTaskInput = {
        projectSlug,
        cardSlug: 'card-1',
        text: 'x'.repeat(501),
      };

      await expect(toolHandlers.add_task(input)).rejects.toThrow();
    });
  });

  describe('toggle_task', () => {
    beforeEach(async () => {
      // Add a task to card-1
      await taskService.addTask(projectSlug, 'card-1', 'Test task');
    });

    test('toggles task checked state', async () => {
      const input: ToggleTaskInput = {
        projectSlug,
        cardSlug: 'card-1',
        taskIndex: 0,
        checked: true,
      };
      const result = await toolHandlers.toggle_task(input);

      expect(result.task.checked).toBe(true);
      expect(result.task.index).toBe(0);
    });

    test('throws error for invalid task index', async () => {
      const input: ToggleTaskInput = {
        projectSlug,
        cardSlug: 'card-1',
        taskIndex: 99,
      };

      await expect(toolHandlers.toggle_task(input)).rejects.toThrow();
    });
  });

  describe('get_board_overview', () => {
    test('returns comprehensive board overview', async () => {
      const input: GetBoardOverviewInput = { projectSlug };
      const result = await toolHandlers.get_board_overview(input);

      expect(result.projectSlug).toBe(projectSlug);
      expect(result.projectName).toBe('Test Project');
      expect(result.lanes).toBeInstanceOf(Array);
      expect(result.summary.totalCards).toBe(2);
    });

    test('includes lane statistics', async () => {
      const input: GetBoardOverviewInput = { projectSlug };
      const result = await toolHandlers.get_board_overview(input);

      const upcomingLane = result.lanes.find(l => l.laneSlug === '01-upcoming');
      expect(upcomingLane).toBeDefined();
      expect(upcomingLane!.cardCount).toBe(1);
      expect(upcomingLane!.priorityBreakdown.high).toBe(1);
    });
  });

  describe('get_next_tasks', () => {
    beforeEach(async () => {
      // Add tasks to both cards
      await taskService.addTask(projectSlug, 'card-1', 'Task 1');
      await taskService.addTask(projectSlug, 'card-2', 'Task 2');
    });

    test('returns uncompleted tasks', async () => {
      const input: GetNextTasksInput = { projectSlug };
      const result = await toolHandlers.get_next_tasks(input);

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].taskText).toBeDefined();
    });

    test('filters tasks by assignee', async () => {
      const input: GetNextTasksInput = {
        projectSlug,
        assignee: 'agent',
      };
      const result = await toolHandlers.get_next_tasks(input);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].cardSlug).toBe('card-1');
    });

    test('respects limit parameter', async () => {
      const input: GetNextTasksInput = {
        projectSlug,
        limit: 1,
      };
      const result = await toolHandlers.get_next_tasks(input);

      expect(result.tasks).toHaveLength(1);
    });

    test('sorts by priority', async () => {
      const input: GetNextTasksInput = { projectSlug };
      const result = await toolHandlers.get_next_tasks(input);

      // High priority (card-1) should come before medium (card-2)
      expect(result.tasks[0].cardSlug).toBe('card-1');
    });
  });

  describe('get_project_progress', () => {
    beforeEach(async () => {
      // Add tasks to cards
      await taskService.addTask(projectSlug, 'card-1', 'Task 1');
      await taskService.addTask(projectSlug, 'card-2', 'Task 2');
      await taskService.setTaskChecked(projectSlug, 'card-2', 0, true);
    });

    test('returns comprehensive progress statistics', async () => {
      const input: GetProjectProgressInput = { projectSlug };
      const result = await toolHandlers.get_project_progress(input);

      expect(result.projectSlug).toBe(projectSlug);
      expect(result.projectName).toBe('Test Project');
      expect(result.progress.totalCards).toBe(2);
      expect(result.progress.totalTasks).toBe(2);
      expect(result.progress.completedTasks).toBe(1);
      expect(result.progress.completionRate).toBe(50);
    });

    test('includes priority and assignee statistics', async () => {
      const input: GetProjectProgressInput = { projectSlug };
      const result = await toolHandlers.get_project_progress(input);

      expect(result.progress.priorityStats.high).toBe(1);
      expect(result.progress.priorityStats.medium).toBe(1);
      expect(result.progress.assigneeStats.agent).toBe(1);
      expect(result.progress.assigneeStats.user).toBe(1);
    });
  });

  describe('archive_card', () => {
    test('moves card to archive lane', async () => {
      const input: ArchiveCardInput = {
        projectSlug,
        cardSlug: 'card-1',
      };
      const result = await toolHandlers.archive_card(input);

      expect(result.card.lane).toBe('04-archive');
    });

    test('throws error for non-existent card', async () => {
      const input: ArchiveCardInput = {
        projectSlug,
        cardSlug: 'non-existent',
      };

      await expect(toolHandlers.archive_card(input)).rejects.toThrow();
    });
  });

  describe('search_cards', () => {
    test('searches cards by title', async () => {
      const input = {
        projectSlug,
        query: 'Card 1',
      };
      const result = await toolHandlers.search_cards(input);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].frontmatter.title).toBe('Card 1');
    });

    test('searches are case-insensitive', async () => {
      const input = {
        projectSlug,
        query: 'card 1',
      };
      const result = await toolHandlers.search_cards(input);

      expect(result.cards).toHaveLength(1);
    });

    test('searches card content', async () => {
      const input = {
        projectSlug,
        query: 'Card 2 content',
        searchIn: ['content'] as ('title' | 'content' | 'tags')[],
      };
      const result = await toolHandlers.search_cards(input);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].frontmatter.title).toBe('Card 2');
    });
  });

  describe('update_card_content', () => {
    test('updates card content', async () => {
      const input = {
        projectSlug,
        cardSlug: 'card-1',
        content: 'Updated content',
      };
      const result = await toolHandlers.update_card_content(input);

      expect(result.card.content).toContain('Updated content');
    });
  });

  describe('batch_update_tasks', () => {
    beforeEach(async () => {
      // Add multiple tasks
      await taskService.addTask(projectSlug, 'card-1', 'Task 1');
      await taskService.addTask(projectSlug, 'card-1', 'Task 2');
      await taskService.addTask(projectSlug, 'card-1', 'Task 3');
    });

    test('updates multiple tasks at once', async () => {
      const input = {
        projectSlug,
        cardSlug: 'card-1',
        updates: [
          { taskIndex: 0, checked: true },
          { taskIndex: 2, checked: true },
        ],
      };
      const result = await toolHandlers.batch_update_tasks(input);

      expect(result.updated).toHaveLength(2);
      expect(result.card.taskProgress.checked).toBe(2);
    });

    test('throws error for invalid task index', async () => {
      const input = {
        projectSlug,
        cardSlug: 'card-1',
        updates: [
          { taskIndex: 0, checked: true },
          { taskIndex: 99, checked: true },
        ],
      };

      await expect(toolHandlers.batch_update_tasks(input)).rejects.toThrow();
    });
  });
});

// ============================================================================
// Card Artifact Tool Tests
// ============================================================================

describe('Card Artifact MCP Tools', () => {
  let testWorkspace: string;
  let vaultDir: string;
  let projectService: ProjectService;
  let cardService: CardService;
  const projectSlug = 'artifact-project';
  const BASE_URL = 'http://tiny-tower:5173/viewer?path=';

  beforeEach(async () => {
    testWorkspace = await mkdtemp(join(tmpdir(), 'devplanner-artifact-test-'));
    vaultDir = join(testWorkspace, '_vault');

    process.env.DEVPLANNER_WORKSPACE = testWorkspace;
    process.env.ARTIFACT_BASE_URL = BASE_URL;
    process.env.ARTIFACT_BASE_PATH = vaultDir;
    process.env.FILE_BROWSER_BASE_PATH = testWorkspace;

    ConfigService._resetInstance();
    _resetServicesCache();

    projectService = new ProjectService(testWorkspace);
    cardService = new CardService(testWorkspace);

    await projectService.createProject('Artifact Project', 'Tests for artifact tools');
    await cardService.createCard(projectSlug, {
      title: 'My Card',
      lane: '01-upcoming',
    });
  });

  afterEach(async () => {
    try {
      await rm(testWorkspace, { recursive: true, force: true });
      delete process.env.DEVPLANNER_WORKSPACE;
      delete process.env.ARTIFACT_BASE_URL;
      delete process.env.ARTIFACT_BASE_PATH;
      delete process.env.FILE_BROWSER_BASE_PATH;
    } catch {
      // Ignore cleanup errors
    }
  });

  // Helper: create an artifact via the MCP create_card_artifact tool
  async function createArtifact(label: string, content: string): Promise<{ linkId: string; url: string }> {
    const result = await toolHandlers.create_card_artifact({
      projectSlug,
      cardSlug: 'my-card',
      label,
      content,
      kind: 'doc',
    });
    return { linkId: result.link.id, url: result.link.url };
  }

  test('create_card_artifact creates an artifact and returns a link', async () => {
    const result = await toolHandlers.create_card_artifact({
      projectSlug,
      cardSlug: 'my-card',
      label: 'Spec Doc',
      content: '# Spec\nLine 1\nLine 2',
      kind: 'spec',
    });

    expect(result.link.id).toBeTruthy();
    expect(result.link.label).toBe('Spec Doc');
    expect(result.link.url).toContain(BASE_URL);
    expect(result.filePath).toBeTruthy();
  });

  test('resolve_card_artifact resolves by cardId + label', async () => {
    // Get the card's cardId
    const card = await cardService.getCard(projectSlug, 'my-card');
    await createArtifact('Design Doc', '# Design');

    const result = await toolHandlers.resolve_card_artifact({
      cardId: card.cardId,
      artifactRef: 'Design Doc',
    });

    expect(result.card.cardId).toBe(card.cardId);
    expect(result.link.label).toBe('Design Doc');
    expect(result.artifact.path).toBeTruthy();
    expect(result.artifact.hash).toMatch(/^sha256:/);
    expect(result.artifact.lineCount).toBeGreaterThan(0);
  });

  test('resolve_card_artifact resolves by URL', async () => {
    const { url } = await createArtifact('Plan', '# Plan\nContent');

    const result = await toolHandlers.resolve_card_artifact({ url });

    expect(result.link.url).toBe(url);
    expect(result.card.projectSlug).toBe(projectSlug);
  });

  test('read_card_artifact returns content', async () => {
    const { linkId } = await createArtifact('Impl Notes', '# Notes\nLine A\nLine B');

    const result = await toolHandlers.read_card_artifact({
      projectSlug,
      cardSlug: 'my-card',
      artifactRef: linkId,
    });

    expect(result.artifact.content).toContain('# Notes');
    expect(result.artifact.hash).toMatch(/^sha256:/);
    expect(result.artifact.lineCount).toBe(3);
  });

  test('read_card_artifact resolves by link ID (UUID)', async () => {
    const { linkId } = await createArtifact('Lookup By ID', 'Some content');

    const result = await toolHandlers.read_card_artifact({ artifactRef: linkId, projectSlug, cardSlug: 'my-card' });
    expect(result.link.id).toBe(linkId);
    expect(result.artifact.content).toBe('Some content');
  });

  test('resolve_card_artifact throws AMBIGUOUS_ARTIFACT_REF when multiple artifacts share a label', async () => {
    // Create two artifacts with the same label (not possible via normal flow, simulate with two distinct labels then use projectSlug+cardSlug with no ref)
    await createArtifact('Artifact A', 'Content A');
    await createArtifact('Artifact B', 'Content B');

    await expect(toolHandlers.resolve_card_artifact({
      projectSlug,
      cardSlug: 'my-card',
      // No artifactRef — card has 2 artifacts, should be ambiguous
    })).rejects.toMatchObject({ code: 'AMBIGUOUS_ARTIFACT_REF' });
  });

  test('update_card_artifact updates content and preserves URL', async () => {
    const { linkId, url } = await createArtifact('Living Doc', '# v1');

    const result = await toolHandlers.update_card_artifact({
      projectSlug,
      cardSlug: 'my-card',
      artifactRef: linkId,
      content: '# v2\nUpdated content',
    });

    expect(result.ok).toBe(true);
    expect(result.link.url).toBe(url); // URL preserved
    expect(result.artifact.hash).toMatch(/^sha256:/);
  });

  test('update_card_artifact updates label and kind', async () => {
    const { linkId } = await createArtifact('Old Label', '# content');

    const result = await toolHandlers.update_card_artifact({
      projectSlug,
      cardSlug: 'my-card',
      artifactRef: linkId,
      label: 'New Label',
      kind: 'spec',
    });

    expect(result.link.label).toBe('New Label');
    expect(result.link.kind).toBe('spec');
  });

  test('update_card_artifact with correct expectedHash succeeds', async () => {
    const { linkId } = await createArtifact('Hash Test', '# v1');
    const readResult = await toolHandlers.read_card_artifact({
      projectSlug, cardSlug: 'my-card', artifactRef: linkId,
    });
    const hash = readResult.artifact.hash;

    const result = await toolHandlers.update_card_artifact({
      projectSlug,
      cardSlug: 'my-card',
      artifactRef: linkId,
      content: '# v2',
      expectedHash: hash,
    });

    expect(result.ok).toBe(true);
  });

  test('update_card_artifact with stale expectedHash throws ARTIFACT_CONFLICT', async () => {
    const { linkId } = await createArtifact('Conflict Test', '# v1');
    const staleHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

    await expect(toolHandlers.update_card_artifact({
      projectSlug,
      cardSlug: 'my-card',
      artifactRef: linkId,
      content: '# v2',
      expectedHash: staleHash,
    })).rejects.toMatchObject({ code: 'ARTIFACT_CONFLICT' });
  });

  test('read_card_artifact after update returns new content', async () => {
    const { linkId } = await createArtifact('Evolving Doc', '# v1\nInitial');

    await toolHandlers.update_card_artifact({
      projectSlug, cardSlug: 'my-card', artifactRef: linkId, content: '# v2\nRevised',
    });

    const result = await toolHandlers.read_card_artifact({
      projectSlug, cardSlug: 'my-card', artifactRef: linkId,
    });

    expect(result.artifact.content).toContain('# v2');
    expect(result.artifact.content).toContain('Revised');
  });
});
