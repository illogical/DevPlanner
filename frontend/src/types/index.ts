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
