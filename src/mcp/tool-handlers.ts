/**
 * MCP Tool Handler Implementations
 * 
 * Each handler function implements one MCP tool by calling the appropriate
 * DevPlanner service and returning formatted results.
 */

import { ProjectService } from '../services/project.service.js';
import { CardService } from '../services/card.service.js';
import { TaskService } from '../services/task.service.js';
import { FileService } from '../services/file.service.js';
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
  ListProjectFilesInput,
  ListProjectFilesOutput,
  ListCardFilesInput,
  ListCardFilesOutput,
  ReadFileContentInput,
  ReadFileContentOutput,
  AddFileToCardInput,
  AddFileToCardOutput,
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
  fileNotFoundError,
  binaryFileError,
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
  fileService: FileService;
}>();

function getServices(workspacePath?: string) {
  const wsPath = workspacePath || ConfigService.getInstance().workspacePath;
  
  let services = servicesCache.get(wsPath);
  if (!services) {
    services = {
      projectService: new ProjectService(wsPath),
      cardService: new CardService(wsPath),
      taskService: new TaskService(wsPath),
      fileService: new FileService(wsPath),
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
  // Pass includeArchived to the service so it doesn't filter them out
  const projects = await getServices().projectService.listProjects(input.includeArchived || false);
  
  return {
    projects,
    total: projects.length,
  };
}

async function handleGetProject(input: GetProjectInput): Promise<GetProjectOutput> {
  try {
    // Get project config from service
    const config = await getServices().projectService.getProject(input.projectSlug);
    
    // Convert to ProjectSummary by listing all projects and finding the matching one
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
  // Create the project
  await getServices().projectService.createProject(input.name, input.description);
  
  // Get the created project as a ProjectSummary
  const allProjects = await getServices().projectService.listProjects();
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const project = allProjects.find(p => p.slug === slug);
  
  if (!project) {
    throw new Error(`Failed to create project: ${input.name}`);
  }
  
  return { project };
}

async function handleListCards(input: ListCardsInput): Promise<ListCardsOutput> {
  // Verify project exists
  try {
    await getServices().projectService.getProject(input.projectSlug);
  } catch (error) {
    const projects = await getServices().projectService.listProjects();
    throw projectNotFoundError(
      input.projectSlug,
      projects.map(p => p.slug)
    );
  }

  // Get all cards for the project
  let cards = await getServices().cardService.listCards(input.projectSlug);

  // Apply filters
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
    
    // Get associated files
    const files = await getServices().fileService.listCardFiles(input.projectSlug, input.cardSlug);
    
    return { 
      card,
      files: files.map(f => ({
        filename: f.filename,
        originalName: f.originalName,
        description: f.description,
        mimeType: f.mimeType,
        size: f.size,
      })),
    };
  } catch (error) {
    // Get all cards to provide suggestions
    const allCards = await getServices().cardService.listCards(input.projectSlug);
    throw cardNotFoundError(
      input.cardSlug,
      input.projectSlug,
      allCards.map(c => c.slug)
    );
  }
}

async function handleCreateCard(input: CreateCardInput): Promise<CreateCardOutput> {
  // Verify project exists
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
  // Verify card exists
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
  // Verify project and get valid lanes
  const project = await getServices().projectService.getProject(input.projectSlug);
  const validLanes = Object.keys(project.lanes);

  if (!validLanes.includes(input.targetLane)) {
    throw invalidLaneError(input.targetLane, validLanes);
  }

  // Verify card exists
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
  // Validate task text
  const trimmedText = input.text.trim();
  if (!trimmedText) {
    throw emptyTaskTextError();
  }

  if (trimmedText.length > 500) {
    throw taskTextTooLongError(500);
  }

  // Verify card exists
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

  // Get updated card to get task progress
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
  // Verify card exists and get task count
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

  // Validate task index
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

  // Get updated card to get task progress
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
  // Verify project exists
  const project = await getServices().projectService.getProject(input.projectSlug);
  const allCards = await getServices().cardService.listCards(input.projectSlug);

  // Build lane overviews
  const lanes: LaneOverview[] = [];
  let totalTasks = 0;
  let completedTasks = 0;

  for (const [laneSlug, laneConfig] of Object.entries(project.lanes)) {
    const laneCards = allCards.filter(c => c.lane === laneSlug);
    
    const laneTaskStats = {
      total: 0,
      checked: 0,
      unchecked: 0,
    };

    const priorityBreakdown = {
      high: 0,
      medium: 0,
      low: 0,
      none: 0,
    };

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
  // Verify project exists
  await getServices().projectService.getProject(input.projectSlug);
  let cards = await getServices().cardService.listCards(input.projectSlug);

  // Apply filters
  if (input.assignee) {
    cards = cards.filter(c => c.frontmatter.assignee === input.assignee);
  }

  if (input.lane) {
    cards = cards.filter(c => c.lane === input.lane);
  }

  // Extract uncompleted tasks
  const tasks: NextTask[] = [];

  for (const card of cards) {
    // Get full card to access tasks
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

  // Sort by priority (high > medium > low > none), then by lane (in-progress first)
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
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    const aLane = laneOrder[a.lane] ?? 999;
    const bLane = laneOrder[b.lane] ?? 999;
    return aLane - bLane;
  });

  // Apply limit
  const limit = Math.min(input.limit || 20, 100);
  const limitedTasks = tasks.slice(0, limit);

  return {
    tasks: limitedTasks,
    total: limitedTasks.length,
  };
}

async function handleBatchUpdateTasks(input: BatchUpdateTasksInput): Promise<BatchUpdateTasksOutput> {
  // Verify card exists
  const card = await getServices().cardService.getCard(input.projectSlug, input.cardSlug);

  // Validate all task indices first
  for (const update of input.updates) {
    if (update.taskIndex < 0 || update.taskIndex >= card.tasks.length) {
      throw taskIndexOutOfRangeError(
        update.taskIndex,
        card.tasks.length - 1,
        input.cardSlug
      );
    }
  }

  // Apply updates
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

  // Get final task progress
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
  // Verify project exists
  await getServices().projectService.getProject(input.projectSlug);
  const cards = await getServices().cardService.listCards(input.projectSlug);

  const searchIn = input.searchIn || ['title', 'content', 'tags'];
  const query = input.query.toLowerCase();

  const matchedCards: CardSummary[] = [];

  for (const card of cards) {
    let matches = false;

    if (searchIn.includes('title')) {
      if (card.frontmatter.title.toLowerCase().includes(query)) {
        matches = true;
      }
    }

    if (searchIn.includes('tags') && card.frontmatter.tags) {
      if (card.frontmatter.tags.some(tag => tag.toLowerCase().includes(query))) {
        matches = true;
      }
    }

    if (searchIn.includes('content')) {
      // Need to get full card for content search
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
  // Verify card exists
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

  // Update the content field
  const card = await getServices().cardService.updateCard(input.projectSlug, input.cardSlug, {
    content: input.content,
  });

  return { card };
}

async function handleGetProjectProgress(input: GetProjectProgressInput): Promise<GetProjectProgressOutput> {
  // Verify project exists
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
    // Count by lane
    progress.cardsByLane[card.lane] = (progress.cardsByLane[card.lane] || 0) + 1;

    // Task stats
    progress.totalTasks += card.taskProgress.total;
    progress.completedTasks += card.taskProgress.checked;

    // Priority stats
    const priority = card.frontmatter.priority || 'none';
    progress.priorityStats[priority as keyof typeof progress.priorityStats]++;

    // Assignee stats
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
  // Verify card exists
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

  // Archive the card (returns void)
  await getServices().cardService.archiveCard(input.projectSlug, input.cardSlug);
  
  // Get the archived card
  const card = await getServices().cardService.getCard(input.projectSlug, input.cardSlug);
  
  return { card };
}

// ============================================================================
// File Management Tool Handlers
// ============================================================================

async function handleListProjectFiles(input: ListProjectFilesInput): Promise<ListProjectFilesOutput> {
  // Verify project exists
  try {
    await getServices().projectService.getProject(input.projectSlug);
  } catch (error) {
    const projects = await getServices().projectService.listProjects();
    throw projectNotFoundError(
      input.projectSlug,
      projects.map(p => p.slug)
    );
  }

  const files = await getServices().fileService.listFiles(input.projectSlug);
  
  return {
    files: files.map(f => ({
      filename: f.filename,
      originalName: f.originalName,
      description: f.description,
      mimeType: f.mimeType,
      size: f.size,
      associatedCards: f.cardSlugs,
      created: f.created,
    })),
    total: files.length,
  };
}

async function handleListCardFiles(input: ListCardFilesInput): Promise<ListCardFilesOutput> {
  // Verify card exists
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

  const files = await getServices().fileService.listCardFiles(input.projectSlug, input.cardSlug);
  
  return {
    files: files.map(f => ({
      filename: f.filename,
      originalName: f.originalName,
      description: f.description,
      mimeType: f.mimeType,
      size: f.size,
    })),
    total: files.length,
  };
}

async function handleReadFileContent(input: ReadFileContentInput): Promise<ReadFileContentOutput> {
  // Verify project exists
  try {
    await getServices().projectService.getProject(input.projectSlug);
  } catch (error) {
    const projects = await getServices().projectService.listProjects();
    throw projectNotFoundError(
      input.projectSlug,
      projects.map(p => p.slug)
    );
  }

  // Get file metadata and content
  try {
    const file = await getServices().fileService.getFile(input.projectSlug, input.filename);
    const { content, mimeType } = await getServices().fileService.getFileContent(
      input.projectSlug,
      input.filename
    );
    
    return {
      filename: file.filename,
      mimeType,
      size: file.size,
      content,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Check if this is a binary file error
      if (error.message.includes('File is binary')) {
        const file = await getServices().fileService.getFile(input.projectSlug, input.filename);
        throw binaryFileError(input.filename, file.mimeType, file.size);
      }
      
      // Check if this is a file not found error
      if (error.message.includes('not found')) {
        const allFiles = await getServices().fileService.listFiles(input.projectSlug);
        throw fileNotFoundError(
          input.filename,
          input.projectSlug,
          allFiles.map(f => f.filename)
        );
      }
    }
    throw error;
  }
}

async function handleAddFileToCard(input: AddFileToCardInput): Promise<AddFileToCardOutput> {
  // Verify project exists and get project details
  let project;
  try {
    project = await getServices().projectService.getProject(input.projectSlug);
  } catch (error) {
    const projects = await getServices().projectService.listProjects();
    throw projectNotFoundError(
      input.projectSlug,
      projects.map(p => p.slug)
    );
  }

  // Verify card exists and get card details
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

  // Validate content
  if (!input.content || input.content.trim() === '') {
    throw new MCPError(
      'INVALID_INPUT',
      'File content cannot be empty.',
      [
        {
          action: 'Provide text content for the file',
          reason: 'Minimum 1 character required',
        },
      ]
    );
  }

  // Process filename: add .md extension if no extension provided
  let filename = input.filename;
  if (!filename.includes('.')) {
    filename = `${filename}.md`;
  }

  // Prepend card ID to filename (format: {PREFIX}-{cardNumber}_{filename})
  if (project.prefix && card.frontmatter.cardNumber) {
    const cardId = `${project.prefix}-${card.frontmatter.cardNumber}`;
    filename = `${cardId}_${filename}`;
  }

  // Create file and associate with card
  try {
    const fileEntry = await getServices().fileService.addFileToCard(
      input.projectSlug,
      input.cardSlug,
      filename,
      input.content,
      input.description || ''
    );

    // Format file size for message
    const sizeKB = (fileEntry.size / 1024).toFixed(1);
    const sizeStr = fileEntry.size < 1024 
      ? `${fileEntry.size} bytes` 
      : `${sizeKB} KB`;

    // Build message based on whether filename was deduplicated
    let message = `Successfully created '${fileEntry.filename}' (${sizeStr})`;
    if (fileEntry.filename !== fileEntry.originalName) {
      message += ' (filename was deduplicated)';
    }
    message += ` and linked to card '${input.cardSlug}'`;

    return {
      filename: fileEntry.filename,
      originalName: fileEntry.originalName,
      description: fileEntry.description,
      mimeType: fileEntry.mimeType,
      size: fileEntry.size,
      created: fileEntry.created,
      associatedCards: fileEntry.cardSlugs,
      message,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw validation errors from service
      if (error.message.includes('cannot be empty') || 
          error.message.includes('path separator')) {
        throw new MCPError(
          'INVALID_INPUT',
          error.message,
          [
            {
              action: 'Provide a valid filename without path separators and non-empty content',
              reason: 'Filename and content must meet basic validation requirements',
            },
          ]
        );
      }
    }
    throw error;
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
  list_project_files: handleListProjectFiles,
  list_card_files: handleListCardFiles,
  read_file_content: handleReadFileContent,
  add_file_to_card: handleAddFileToCard,
};
