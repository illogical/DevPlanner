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
