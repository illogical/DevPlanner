// Project types
export interface ProjectConfig {
  name: string;
  description?: string;
  created: string; // ISO 8601
  updated: string; // ISO 8601
  archived: boolean;
  lanes: Record<string, LaneConfig>;
  prefix?: string; // 2-4 uppercase chars, unique across projects
  nextCardNumber?: number; // Auto-incrementing counter, starts at 1
}

export interface LaneConfig {
  displayName: string;
  color: string; // Hex color
  collapsed: boolean;
}

export interface ProjectSummary extends ProjectConfig {
  slug: string;
  cardCounts: Record<string, number>;
}

// Card types
export interface CardFrontmatter {
  title: string;
  status?: 'in-progress' | 'blocked' | 'review' | 'testing';
  priority?: 'low' | 'medium' | 'high';
  assignee?: 'user' | 'agent';
  created: string; // ISO 8601
  updated: string; // ISO 8601
  tags?: string[];
  cardNumber?: number; // Sequential within project
}

export interface Card {
  slug: string;
  filename: string;
  lane: string;
  frontmatter: CardFrontmatter;
  content: string;
  tasks: TaskItem[];
}

export interface CardSummary {
  slug: string;
  filename: string;
  lane: string;
  frontmatter: CardFrontmatter;
  taskProgress: TaskProgress;
}

export interface TaskProgress {
  total: number;
  checked: number;
}

// Task types
export interface TaskItem {
  index: number;
  text: string;
  checked: boolean;
}

// API types
export interface ApiError {
  error: string;
  message: string;
  expected?: string;
}

export interface CreateCardInput {
  title: string;
  lane?: string;
  priority?: 'low' | 'medium' | 'high';
  assignee?: 'user' | 'agent';
  tags?: string[];
  content?: string;
  status?: 'in-progress' | 'blocked' | 'review' | 'testing';
}

// API Response types
export interface ProjectsResponse {
  projects: ProjectSummary[];
}

export interface CardsResponse {
  cards: CardSummary[];
}

export interface TaskToggleResponse extends TaskItem {
  taskProgress: TaskProgress;
}

export interface ReorderResponse {
  lane: string;
  order: string[];
}

export interface ArchiveResponse {
  slug: string;
  archived?: boolean;
  lane?: string;
}

// Preferences types
export interface Preferences {
  lastSelectedProject: string | null;
}

// History types
export type HistoryActionType =
  | 'task:completed'
  | 'task:uncompleted'
  | 'card:created'
  | 'card:moved'
  | 'card:updated'
  | 'card:archived';

export interface HistoryEventMetadata {
  cardSlug: string;
  cardTitle: string;
  lane?: string;
  sourceLane?: string;
  targetLane?: string;
  taskIndex?: number;
  taskText?: string;
  changedFields?: string[];
}

export interface HistoryEvent {
  id: string;
  projectSlug: string;
  timestamp: string; // ISO 8601
  action: HistoryActionType;
  description: string;
  metadata: HistoryEventMetadata;
}

export interface HistoryResponse {
  events: HistoryEvent[];
  total: number;
}

// WebSocket types
export type WebSocketEventType =
  | 'card:created'
  | 'card:updated'
  | 'card:moved'
  | 'card:deleted'
  | 'task:toggled'
  | 'lane:reordered'
  | 'project:updated'
  | 'project:deleted'
  | 'history:event';

export interface WebSocketEvent {
  type: WebSocketEventType;
  projectSlug: string;
  timestamp: string;
  data: unknown;
}

export interface WebSocketMessage {
  type: 'event' | 'error' | 'ping' | 'subscribed' | 'unsubscribed';
  projectSlug?: string;
  event?: WebSocketEvent;
  error?: string;
}

// Typed event data payloads
export interface CardCreatedData {
  card: CardSummary;
}

export interface CardUpdatedData {
  card: CardSummary;
}

export interface CardMovedData {
  slug: string;
  sourceLane: string;
  targetLane: string;
  position?: number;
}

export interface CardDeletedData {
  slug: string;
  lane: string;
}

export interface TaskToggledData {
  cardSlug: string;
  taskIndex: number;
  checked: boolean;
  taskProgress: {
    total: number;
    checked: number;
  };
}

export interface LaneReorderedData {
  lane: string;
  order: string[];
}

export interface ProjectUpdatedData {
  slug: string;
  config: ProjectConfig;
}

export interface ProjectDeletedData {
  slug: string;
}
