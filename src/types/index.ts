// Project types
export interface ProjectConfig {
  name: string;
  description?: string;
  created: string; // ISO 8601
  updated: string; // ISO 8601
  archived: boolean;
  lanes: Record<string, LaneConfig>;
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
}

export interface Card {
  slug: string; // Filename without .md extension
  filename: string; // Full filename (e.g., "user-auth.md")
  lane: string; // Lane folder name (e.g., "02-in-progress")
  frontmatter: CardFrontmatter;
  content: string; // Markdown body (everything below frontmatter)
  tasks: TaskItem[]; // Parsed checklist items
}

export interface CardSummary {
  slug: string;
  filename: string;
  lane: string;
  frontmatter: CardFrontmatter;
  taskProgress: {
    total: number;
    checked: number;
  };
}

// Task types
export interface TaskItem {
  index: number; // 0-based position in the checklist
  text: string; // Task description text
  checked: boolean; // true = [x], false = [ ]
}

// API types
export interface ApiError {
  error: string; // Machine-readable error code
  message: string; // Human/AI-readable description of what went wrong
  expected?: string; // What the correct format should be (for validation errors)
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

export interface UpdateCardInput {
  title?: string;
  status?: 'in-progress' | 'blocked' | 'review' | 'testing' | null;
  priority?: 'low' | 'medium' | 'high' | null;
  assignee?: 'user' | 'agent' | null;
  tags?: string[] | null;
  content?: string;
}

// Preferences types
export interface Preferences {
  lastSelectedProject: string | null;
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
  | 'history:event';

export interface WebSocketEvent {
  type: WebSocketEventType;
  projectSlug: string;
  timestamp: string; // ISO 8601
  data: unknown; // Event-specific payload
}

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'event' | 'error' | 'ping' | 'pong' | 'subscribed' | 'unsubscribed';
  projectSlug?: string;
  event?: WebSocketEvent;
  error?: string;
}

export interface SubscribeMessage {
  type: 'subscribe';
  projectSlug: string;
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  projectSlug: string;
}

export interface PingMessage {
  type: 'ping';
}

// WebSocket event payload types
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
