/**
 * MCP Type Definitions for DevPlanner
 * 
 * These types define the input/output interfaces for MCP tools and resources.
 * They extend the core DevPlanner types to provide MCP-specific structures.
 */

import type { Card, CardSummary, ProjectSummary, TaskItem } from '../types/index.js';

// ============================================================================
// MCP Tool Input Types (17 tools)
// ============================================================================

// Core CRUD Tools (1-10)

export interface ListProjectsInput {
  includeArchived?: boolean;
}

export interface GetProjectInput {
  projectSlug: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface ListCardsInput {
  projectSlug: string;
  lane?: string;
  priority?: 'low' | 'medium' | 'high';
  assignee?: 'user' | 'agent';
  tags?: string[];
  status?: 'in-progress' | 'blocked' | 'review' | 'testing';
}

export interface GetCardInput {
  projectSlug: string;
  cardSlug: string;
}

export interface CreateCardInput {
  projectSlug: string;
  title: string;
  lane?: string;
  priority?: 'low' | 'medium' | 'high';
  assignee?: 'user' | 'agent';
  tags?: string[];
  content?: string;
  status?: 'in-progress' | 'blocked' | 'review' | 'testing';
}

export interface UpdateCardInput {
  projectSlug: string;
  cardSlug: string;
  title?: string;
  status?: 'in-progress' | 'blocked' | 'review' | 'testing' | null;
  priority?: 'low' | 'medium' | 'high' | null;
  assignee?: 'user' | 'agent' | null;
  tags?: string[] | null;
}

export interface MoveCardInput {
  projectSlug: string;
  cardSlug: string;
  targetLane: string;
  position?: number;
}

export interface AddTaskInput {
  projectSlug: string;
  cardSlug: string;
  text: string;
}

export interface ToggleTaskInput {
  projectSlug: string;
  cardSlug: string;
  taskIndex: number;
  checked?: boolean;
}

// Smart/Workflow Tools (11-17)

export interface GetBoardOverviewInput {
  projectSlug: string;
}

export interface GetNextTasksInput {
  projectSlug: string;
  assignee?: 'user' | 'agent';
  lane?: string;
  limit?: number;
}

export interface BatchUpdateTasksInput {
  projectSlug: string;
  cardSlug: string;
  updates: Array<{
    taskIndex: number;
    checked: boolean;
  }>;
}

export interface SearchCardsInput {
  projectSlug: string;
  query: string;
  searchIn?: ('title' | 'content' | 'tags')[];
}

export interface UpdateCardContentInput {
  projectSlug: string;
  cardSlug: string;
  content: string;
}

export interface GetProjectProgressInput {
  projectSlug: string;
}

export interface ArchiveCardInput {
  projectSlug: string;
  cardSlug: string;
}

// ============================================================================
// MCP Tool Output Types
// ============================================================================

export interface ListProjectsOutput {
  projects: ProjectSummary[];
  total: number;
}

export interface GetProjectOutput {
  project: ProjectSummary;
}

export interface CreateProjectOutput {
  project: ProjectSummary;
}

export interface ListCardsOutput {
  cards: CardSummary[];
  total: number;
}

export interface GetCardOutput {
  card: Card;
  files: FileMetadata[];
}

export interface CreateCardOutput {
  card: Card;
}

export interface UpdateCardOutput {
  card: Card;
}

export interface MoveCardOutput {
  card: Card;
}

export interface AddTaskOutput {
  task: TaskItem;
  card: {
    slug: string;
    taskProgress: {
      total: number;
      checked: number;
    };
  };
}

export interface ToggleTaskOutput {
  task: TaskItem;
  card: {
    slug: string;
    taskProgress: {
      total: number;
      checked: number;
    };
  };
}

export interface LaneOverview {
  laneSlug: string;
  displayName: string;
  cardCount: number;
  taskStats: {
    total: number;
    checked: number;
    unchecked: number;
  };
  priorityBreakdown: {
    high: number;
    medium: number;
    low: number;
    none: number;
  };
}

export interface GetBoardOverviewOutput {
  projectSlug: string;
  projectName: string;
  lanes: LaneOverview[];
  summary: {
    totalCards: number;
    totalTasks: number;
    completedTasks: number;
    completionRate: number; // Percentage
  };
}

export interface NextTask {
  cardSlug: string;
  cardTitle: string;
  lane: string;
  priority?: 'low' | 'medium' | 'high';
  taskIndex: number;
  taskText: string;
}

export interface GetNextTasksOutput {
  tasks: NextTask[];
  total: number;
}

export interface BatchUpdateTasksOutput {
  updated: TaskItem[];
  card: {
    slug: string;
    taskProgress: {
      total: number;
      checked: number;
    };
  };
}

export interface SearchCardsOutput {
  cards: CardSummary[];
  total: number;
}

export interface UpdateCardContentOutput {
  card: Card;
}

export interface ProjectProgress {
  totalCards: number;
  cardsByLane: Record<string, number>;
  totalTasks: number;
  completedTasks: number;
  completionRate: number; // Percentage
  priorityStats: {
    high: number;
    medium: number;
    low: number;
    none: number;
  };
  assigneeStats: {
    user: number;
    agent: number;
    unassigned: number;
  };
}

export interface GetProjectProgressOutput {
  projectSlug: string;
  projectName: string;
  progress: ProjectProgress;
}

export interface ArchiveCardOutput {
  card: Card;
}

// File Management Tools (18-20)

export interface ListProjectFilesInput {
  projectSlug: string;
}

export interface ListCardFilesInput {
  projectSlug: string;
  cardSlug: string;
}

export interface ReadFileContentInput {
  projectSlug: string;
  filename: string;
}

// ============================================================================
// MCP Tool Output Types (20 tools)
// ============================================================================

// File Tool Outputs

export interface FileMetadata {
  filename: string;
  originalName: string;
  description: string;
  mimeType: string;
  size: number;
}

export interface ListProjectFilesOutput {
  files: Array<FileMetadata & {
    associatedCards: string[];
    created: string;
  }>;
  total: number;
}

export interface ListCardFilesOutput {
  files: FileMetadata[];
  total: number;
}

export interface ReadFileContentOutput {
  filename: string;
  mimeType: string;
  size: number;
  content: string;
}

// ============================================================================
// MCP Resource Types
// ============================================================================

export interface ProjectResourceContent {
  project: ProjectSummary;
  recentCards: CardSummary[];
}

export interface CardResourceContent {
  card: Card;
}

// ============================================================================
// MCP Error Types
// ============================================================================

export interface MCPErrorSuggestion {
  action: string;
  reason: string;
}

export interface MCPErrorResponse {
  error: string; // Machine-readable error code
  message: string; // LLM-friendly description
  suggestions?: MCPErrorSuggestion[]; // What the AI should try instead
}
