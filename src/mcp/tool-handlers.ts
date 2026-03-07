/**
 * MCP Tool Handler Implementations
 *
 * Each handler function implements one MCP tool by calling the appropriate
 * DevPlanner service and returning formatted results.
 */

import { ProjectService } from '../services/project.service.js';
import { CardService } from '../services/card.service.js';
import { TaskService } from '../services/task.service.js';
import { VaultService } from '../services/vault.service.js';
import { ConfigService } from '../services/config.service.js';

import type {
  ListProjectsInput,
  ListProjectsOutput,
  GetProjectInput,
  GetProjectOutput,
  CreateProjectInput,
  CreateProjectOutput,
  ListCardsInput,
  ListCardsOutput,
  GetCardInput,
  GetCardOutput,
  CreateCardInput,
  CreateCardOutput,
  UpdateCardInput,
  UpdateCardOutput,
  MoveCardInput,
  MoveCardOutput,
  AddTaskInput,
  AddTaskOutput,
  ToggleTaskInput,
  ToggleTaskOutput,
  GetBoardOverviewInput,
  GetBoardOverviewOutput,
  GetNextTasksInput,
  GetNextTasksOutput,
  BatchUpdateTasksInput,
  BatchUpdateTasksOutput,
  SearchCardsInput,
  SearchCardsOutput,
  UpdateCardContentInput,
  UpdateCardContentOutput,
  GetProjectProgressInput,
  GetProjectProgressOutput,
  ArchiveCardInput,
  ArchiveCardOutput,
  CreateVaultArtifactInput,
  CreateVaultArtifactOutput,
  LaneOverview,
  NextTask,
  ProjectProgress,
} from './types.js';

import {
  projectNotFoundError,
  cardNotFoundError,
  invalidLaneError,
  taskIndexOutOfRangeError,
  emptyTaskTextError,
  taskTextTooLongError,
  MCPError,
} from './errors.js';

import type { CardSummary } from '../types/index.js';

// ============================================================================
// Service Initialization Helpers
// ============================================================================

// Services are cached per workspace path for efficiency
const servicesCache = new Map<string, {
  projectService: ProjectService;
  cardService: CardService;
  taskService: TaskService;
}>();

function getServices(workspacePath?: string) {
  const wsPath = workspacePath || ConfigService.getInstance().workspacePath;

  let services = servicesCache.get(wsPath);
  if (!services) {
    services = {
      projectService: new ProjectService(wsPath),
      cardService: new CardService(wsPath),
      taskService: new TaskService(wsPath),
    };
    servicesCache.set(wsPath, services);
  }

  return services;
}

// Export for testing
export function _resetServicesCache() {
  servicesCache.clear();
}

// ============================================================================
// Core CRUD Tool Handlers
// ============================================================================

async function handleListProjects(input: ListProjectsInput): Promise<ListProjectsOutput> {
  const projects = await getServices().projectService.listProjects(input.includeArchived || false);

  return {
    projects,
    total: projects.length,
  };
}

async function handleGetProject(input: GetProjectInput): Promise<GetProjectOutput> {
  try {
    await getServices().projectService.getProject(input.projectSlug);

    const allProjects = await getServices().projectService.listProjects();
    const project = allProjects.find(p => p.slug === input.projectSlug);

    if (!project) {
      throw new Error(`Project not found: ${input.projectSlug}`);
    }

    return { project };
  } catch (error) {
    const projects = await getServices().projectService.listProjects();
    throw projectNotFoundError(
      input.projectSlug,
      projects.map(p => p.slug)
    );
  }
}

async function handleCreateProject(input: CreateProjectInput): Promise<CreateProjectOutput> {
  await getServices().projectService.createProject(input.name, input.description);

  const allProjects = await getServices().projectService.listProjects();
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const project = allProjects.find(p => p.slug === slug);

  if (!project) {
    throw new Error(`Failed to create project: ${input.name}`);
  }

  return { project };
}

async function handleListCards(input: ListCardsInput): Promise<ListCardsOutput> {
  try {
    await getServices().projectService.getProject(input.projectSlug);
  } catch (error) {
    const projects = await getServices().projectService.listProjects();
    throw projectNotFoundError(
      input.projectSlug,
      projects.map(p => p.slug)
    );
  }

  let cards = await getServices().cardService.listCards(input.projectSlug);

  if (input.lane) {
    cards = cards.filter(c => c.lane === input.lane);
  }
  if (input.priority) {
    cards = cards.filter(c => c.frontmatter.priority === input.priority);
  }
  if (input.assignee) {
    cards = cards.filter(c => c.frontmatter.assignee === input.assignee);
  }
  if (input.status) {
    cards = cards.filter(c => c.frontmatter.status === input.status);
  }
  if (input.tags && input.tags.length > 0) {
    cards = cards.filter(c => {
      const cardTags = c.frontmatter.tags || [];
      return input.tags!.every(tag => cardTags.includes(tag));
    });
  }

  return {
    cards,
    total: cards.length,
  };
}

async function handleGetCard(input: GetCardInput): Promise<GetCardOutput> {
  try {
    const card = await getServices().cardService.getCard(input.projectSlug, input.cardSlug);
    return { card };
  } catch (error) {
    const allCards = await getServices().cardService.listCards(input.projectSlug);
    throw cardNotFoundError(
      input.cardSlug,
      input.projectSlug,
      allCards.map(c => c.slug)
    );
  }
}

async function handleCreateCard(input: CreateCardInput): Promise<CreateCardOutput> {
  try {
    await getServices().projectService.getProject(input.projectSlug);
  } catch (error) {
    const projects = await getServices().projectService.listProjects();
    throw projectNotFoundError(
      input.projectSlug,
      projects.map(p => p.slug)
    );
  }

  const card = await getServices().cardService.createCard(input.projectSlug, {
    title: input.title,
    lane: input.lane || '01-upcoming',
    priority: input.priority,
    assignee: input.assignee,
    tags: input.tags,
    content: input.content,
    status: input.status,
  });

  return { card };
}

async function handleUpdateCard(input: UpdateCardInput): Promise<UpdateCardOutput> {
  try {
    await getServices().cardService.getCard(input.projectSlug, input.cardSlug);
  } catch (error) {
    const allCards = await getServices().cardService.listCards(input.projectSlug);
    throw cardNotFoundError(
      input.cardSlug,
      input.projectSlug,
      allCards.map(c => c.slug)
    );
  }

  const card = await getServices().cardService.updateCard(input.projectSlug, input.cardSlug, {
    title: input.title,
    status: input.status,
    priority: input.priority,
    assignee: input.assignee,
    tags: input.tags,
  });

  return { card };
}

async function handleMoveCard(input: MoveCardInput): Promise<MoveCardOutput> {
  const project = await getServices().projectService.getProject(input.projectSlug);
  const validLanes = Object.keys(project.lanes);

  if (!validLanes.includes(input.targetLane)) {
    throw invalidLaneError(input.targetLane, validLanes);
  }

  try {
    await getServices().cardService.getCard(input.projectSlug, input.cardSlug);
  } catch (error) {
    const allCards = await getServices().cardService.listCards(input.projectSlug);
    throw cardNotFoundError(
      input.cardSlug,
      input.projectSlug,
      allCards.map(c => c.slug)
    );
  }

  const card = await getServices().cardService.moveCard(
    input.projectSlug,
    input.cardSlug,
    input.targetLane,
    input.position
  );

  return { card };
}

async function handleAddTask(input: AddTaskInput): Promise<AddTaskOutput> {
  const trimmedText = input.text.trim();
  if (!trimmedText) {
    throw emptyTaskTextError();
  }
  if (trimmedText.length > 500) {
    throw taskTextTooLongError(500);
  }

  try {
    await getServices().cardService.getCard(input.projectSlug, input.cardSlug);
  } catch (error) {
    const allCards = await getServices().cardService.listCards(input.projectSlug);
    throw cardNotFoundError(
      input.cardSlug,
      input.projectSlug,
      allCards.map(c => c.slug)
    );
  }

  const task = await getServices().taskService.addTask(
    input.projectSlug,
    input.cardSlug,
    trimmedText
  );

  const updatedCard = await getServices().cardService.getCard(input.projectSlug, input.cardSlug);

  return {
    task,
    card: {
      slug: input.cardSlug,
      taskProgress: {
        total: updatedCard.tasks.length,
        checked: updatedCard.tasks.filter(t => t.checked).length,
      },
    },
  };
}

async function handleToggleTask(input: ToggleTaskInput): Promise<ToggleTaskOutput> {
  let card;
  try {
    card = await getServices().cardService.getCard(input.projectSlug, input.cardSlug);
  } catch (error) {
    const allCards = await getServices().cardService.listCards(input.projectSlug);
    throw cardNotFoundError(
      input.cardSlug,
      input.projectSlug,
      allCards.map(c => c.slug)
    );
  }

  if (input.taskIndex < 0 || input.taskIndex >= card.tasks.length) {
    throw taskIndexOutOfRangeError(
      input.taskIndex,
      card.tasks.length - 1,
      input.cardSlug
    );
  }

  const task = await getServices().taskService.setTaskChecked(
    input.projectSlug,
    input.cardSlug,
    input.taskIndex,
    input.checked
  );

  const updatedCard = await getServices().cardService.getCard(input.projectSlug, input.cardSlug);

  return {
    task,
    card: {
      slug: input.cardSlug,
      taskProgress: {
        total: updatedCard.tasks.length,
        checked: updatedCard.tasks.filter(t => t.checked).length,
      },
    },
  };
}

// ============================================================================
// Smart/Workflow Tool Handlers
// ============================================================================

async function handleGetBoardOverview(input: GetBoardOverviewInput): Promise<GetBoardOverviewOutput> {
  const project = await getServices().projectService.getProject(input.projectSlug);
  const allCards = await getServices().cardService.listCards(input.projectSlug);

  const lanes: LaneOverview[] = [];
  let totalTasks = 0;
  let completedTasks = 0;

  for (const [laneSlug, laneConfig] of Object.entries(project.lanes)) {
    const laneCards = allCards.filter(c => c.lane === laneSlug);

    const laneTaskStats = { total: 0, checked: 0, unchecked: 0 };
    const priorityBreakdown = { high: 0, medium: 0, low: 0, none: 0 };

    for (const card of laneCards) {
      laneTaskStats.total += card.taskProgress.total;
      laneTaskStats.checked += card.taskProgress.checked;
      laneTaskStats.unchecked += card.taskProgress.total - card.taskProgress.checked;

      const priority = card.frontmatter.priority || 'none';
      priorityBreakdown[priority as keyof typeof priorityBreakdown]++;
    }

    totalTasks += laneTaskStats.total;
    completedTasks += laneTaskStats.checked;

    lanes.push({
      laneSlug,
      displayName: laneConfig.displayName,
      cardCount: laneCards.length,
      taskStats: laneTaskStats,
      priorityBreakdown,
    });
  }

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    projectSlug: input.projectSlug,
    projectName: project.name,
    lanes,
    summary: {
      totalCards: allCards.length,
      totalTasks,
      completedTasks,
      completionRate,
    },
  };
}

async function handleGetNextTasks(input: GetNextTasksInput): Promise<GetNextTasksOutput> {
  await getServices().projectService.getProject(input.projectSlug);
  let cards = await getServices().cardService.listCards(input.projectSlug);

  if (input.assignee) {
    cards = cards.filter(c => c.frontmatter.assignee === input.assignee);
  }
  if (input.lane) {
    cards = cards.filter(c => c.lane === input.lane);
  }

  const tasks: NextTask[] = [];

  for (const card of cards) {
    const fullCard = await getServices().cardService.getCard(input.projectSlug, card.slug);
    for (const task of fullCard.tasks) {
      if (!task.checked) {
        tasks.push({
          cardSlug: card.slug,
          cardTitle: card.frontmatter.title,
          lane: card.lane,
          priority: card.frontmatter.priority,
          taskIndex: task.index,
          taskText: task.text,
        });
      }
    }
  }

  const priorityOrder = { high: 0, medium: 1, low: 2, none: 3 };
  const laneOrder: Record<string, number> = {
    '02-in-progress': 0,
    '01-upcoming': 1,
    '03-complete': 2,
    '04-archive': 3,
  };

  tasks.sort((a, b) => {
    const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3;
    const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (laneOrder[a.lane] ?? 999) - (laneOrder[b.lane] ?? 999);
  });

  const limit = Math.min(input.limit || 20, 100);
  const limitedTasks = tasks.slice(0, limit);

  return {
    tasks: limitedTasks,
    total: limitedTasks.length,
  };
}

async function handleBatchUpdateTasks(input: BatchUpdateTasksInput): Promise<BatchUpdateTasksOutput> {
  const card = await getServices().cardService.getCard(input.projectSlug, input.cardSlug);

  for (const update of input.updates) {
    if (update.taskIndex < 0 || update.taskIndex >= card.tasks.length) {
      throw taskIndexOutOfRangeError(
        update.taskIndex,
        card.tasks.length - 1,
        input.cardSlug
      );
    }
  }

  const updated: any[] = [];
  for (const update of input.updates) {
    const result = await getServices().taskService.setTaskChecked(
      input.projectSlug,
      input.cardSlug,
      update.taskIndex,
      update.checked
    );
    updated.push(result.task);
  }

  const updatedCard = await getServices().cardService.getCard(input.projectSlug, input.cardSlug);

  return {
    updated,
    card: {
      slug: input.cardSlug,
      taskProgress: {
        total: updatedCard.tasks.length,
        checked: updatedCard.tasks.filter(t => t.checked).length,
      },
    },
  };
}

async function handleSearchCards(input: SearchCardsInput): Promise<SearchCardsOutput> {
  await getServices().projectService.getProject(input.projectSlug);
  const cards = await getServices().cardService.listCards(input.projectSlug);

  const searchIn = input.searchIn || ['title', 'content', 'tags'];
  const query = input.query.toLowerCase();

  const matchedCards: CardSummary[] = [];

  for (const card of cards) {
    let matches = false;

    if (searchIn.includes('title') && card.frontmatter.title.toLowerCase().includes(query)) {
      matches = true;
    }
    if (searchIn.includes('tags') && card.frontmatter.tags?.some(tag => tag.toLowerCase().includes(query))) {
      matches = true;
    }
    if (searchIn.includes('content')) {
      const fullCard = await getServices().cardService.getCard(input.projectSlug, card.slug);
      if (fullCard.content.toLowerCase().includes(query)) {
        matches = true;
      }
    }

    if (matches) {
      matchedCards.push(card);
    }
  }

  return {
    cards: matchedCards,
    total: matchedCards.length,
  };
}

async function handleUpdateCardContent(input: UpdateCardContentInput): Promise<UpdateCardContentOutput> {
  try {
    await getServices().cardService.getCard(input.projectSlug, input.cardSlug);
  } catch (error) {
    const allCards = await getServices().cardService.listCards(input.projectSlug);
    throw cardNotFoundError(
      input.cardSlug,
      input.projectSlug,
      allCards.map(c => c.slug)
    );
  }

  const card = await getServices().cardService.updateCard(input.projectSlug, input.cardSlug, {
    content: input.content,
  });

  return { card };
}

async function handleGetProjectProgress(input: GetProjectProgressInput): Promise<GetProjectProgressOutput> {
  const project = await getServices().projectService.getProject(input.projectSlug);
  const allCards = await getServices().cardService.listCards(input.projectSlug);

  const progress: ProjectProgress = {
    totalCards: allCards.length,
    cardsByLane: {},
    totalTasks: 0,
    completedTasks: 0,
    completionRate: 0,
    priorityStats: { high: 0, medium: 0, low: 0, none: 0 },
    assigneeStats: { user: 0, agent: 0, unassigned: 0 },
  };

  for (const card of allCards) {
    progress.cardsByLane[card.lane] = (progress.cardsByLane[card.lane] || 0) + 1;
    progress.totalTasks += card.taskProgress.total;
    progress.completedTasks += card.taskProgress.checked;

    const priority = card.frontmatter.priority || 'none';
    progress.priorityStats[priority as keyof typeof progress.priorityStats]++;

    if (card.frontmatter.assignee === 'user') {
      progress.assigneeStats.user++;
    } else if (card.frontmatter.assignee === 'agent') {
      progress.assigneeStats.agent++;
    } else {
      progress.assigneeStats.unassigned++;
    }
  }

  progress.completionRate = progress.totalTasks > 0
    ? Math.round((progress.completedTasks / progress.totalTasks) * 100)
    : 0;

  return {
    projectSlug: input.projectSlug,
    projectName: project.name,
    progress,
  };
}

async function handleArchiveCard(input: ArchiveCardInput): Promise<ArchiveCardOutput> {
  try {
    await getServices().cardService.getCard(input.projectSlug, input.cardSlug);
  } catch (error) {
    const allCards = await getServices().cardService.listCards(input.projectSlug);
    throw cardNotFoundError(
      input.cardSlug,
      input.projectSlug,
      allCards.map(c => c.slug)
    );
  }

  await getServices().cardService.archiveCard(input.projectSlug, input.cardSlug);
  const card = await getServices().cardService.getCard(input.projectSlug, input.cardSlug);

  return { card };
}

// ============================================================================
// Vault Artifact Tool Handler
// ============================================================================

async function handleCreateVaultArtifact(input: CreateVaultArtifactInput): Promise<CreateVaultArtifactOutput> {
  const config = ConfigService.getInstance();
  const { obsidianBaseUrl, obsidianVaultPath, workspacePath } = config;

  if (!obsidianBaseUrl || !obsidianVaultPath) {
    throw new MCPError(
      'OBSIDIAN_NOT_CONFIGURED',
      'Set OBSIDIAN_BASE_URL and OBSIDIAN_VAULT_PATH in .env to enable vault artifact creation.',
      [
        {
          action: 'Add OBSIDIAN_BASE_URL and OBSIDIAN_VAULT_PATH to your .env file',
          reason: 'Both env vars are required for vault artifact creation',
        },
      ]
    );
  }

  try {
    await getServices().cardService.getCard(input.projectSlug, input.cardSlug);
  } catch (error) {
    const allCards = await getServices().cardService.listCards(input.projectSlug);
    throw cardNotFoundError(input.cardSlug, input.projectSlug, allCards.map(c => c.slug));
  }

  const vaultService = new VaultService(workspacePath, obsidianVaultPath, obsidianBaseUrl);

  try {
    const { link, filePath } = await vaultService.createArtifact(
      input.projectSlug,
      input.cardSlug,
      input.label,
      input.kind ?? 'doc',
      input.content
    );
    return { link, filePath };
  } catch (err: any) {
    if (err?.error === 'INVALID_LABEL') {
      throw new MCPError('INVALID_LABEL', err.message, [
        { action: 'Provide a non-empty label', reason: 'Label is required' },
      ]);
    }
    if (err?.error === 'DUPLICATE_LINK') {
      throw new MCPError('DUPLICATE_LINK', err.message, [
        { action: 'Use a different label or update the existing link', reason: 'A link with this URL already exists on the card' },
      ]);
    }
    throw err;
  }
}

// ============================================================================
// Export tool handlers map
// ============================================================================

export const toolHandlers: Record<string, (input: any) => Promise<any>> = {
  list_projects: handleListProjects,
  get_project: handleGetProject,
  create_project: handleCreateProject,
  list_cards: handleListCards,
  get_card: handleGetCard,
  create_card: handleCreateCard,
  update_card: handleUpdateCard,
  move_card: handleMoveCard,
  add_task: handleAddTask,
  toggle_task: handleToggleTask,
  get_board_overview: handleGetBoardOverview,
  get_next_tasks: handleGetNextTasks,
  batch_update_tasks: handleBatchUpdateTasks,
  search_cards: handleSearchCards,
  update_card_content: handleUpdateCardContent,
  get_project_progress: handleGetProjectProgress,
  archive_card: handleArchiveCard,
  create_vault_artifact: handleCreateVaultArtifact,
};
