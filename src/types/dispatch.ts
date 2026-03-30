/**
 * Dispatch-specific type definitions.
 *
 * Card Dispatch lets a user hand off a Kanban card to an AI coding assistant.
 * The card's description, tasks, and linked artifacts are assembled into a
 * prompt and sent to an agent CLI (Claude Code or Gemini CLI). The agent
 * works in an isolated git worktree and updates the board via DevPlanner MCP.
 */

export type DispatchAdapterName = 'claude-cli' | 'gemini-cli';

// ─── Adapter types ────────────────────────────────────────────────────────────

export interface DispatchConfig {
  workingDirectory: string;
  systemPrompt: string;
  userPrompt: string;
  mcpConfigPath?: string;
  model?: string;
  env?: Record<string, string>;
  onOutput?: (chunk: string) => void;
}

export interface DispatchProcess {
  id: string;
  pid?: number;
  kill?: () => void;
  onComplete: Promise<DispatchResult>;
}

export interface DispatchResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface DispatchAdapter {
  name: DispatchAdapterName;
  spawn(config: DispatchConfig): Promise<DispatchProcess>;
}

// ─── Request / Record types ───────────────────────────────────────────────────

export interface DispatchRequest {
  adapter: DispatchAdapterName;
  model?: string;
  autoCreatePR: boolean;
}

export interface DispatchRecord {
  id: string;
  projectSlug: string;
  cardSlug: string;
  adapter: DispatchAdapterName;
  model?: string;
  branch: string;
  worktreePath: string;
  status: 'running' | 'completed' | 'failed' | 'review';
  startedAt: string;
  completedAt?: string;
  exitCode?: number;
  autoCreatePR: boolean;
  prUrl?: string;
  error?: string;
  logPath?: string; // Absolute path to the dispatch log file
}

// ─── WebSocket event payload types ────────────────────────────────────────────

export interface CardDispatchedData {
  cardSlug: string;
  dispatchId: string;
  adapter: string;
  branch: string;
}

export interface CardDispatchOutputData {
  cardSlug: string;
  dispatchId: string;
  chunk: string;
  structured?: {
    type: 'tool_use' | 'text' | 'result';
    toolName?: string;
    content?: string;
  };
  timestamp: string;
}

export interface CardDispatchCompletedData {
  cardSlug: string;
  dispatchId: string;
  exitCode: number;
  allTasksComplete: boolean;
  prUrl?: string;
}

export interface CardDispatchFailedData {
  cardSlug: string;
  dispatchId: string;
  exitCode: number;
  error: string;
}
