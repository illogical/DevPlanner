import { join } from 'path';
import { mkdir, appendFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';

/**
 * File-based logger for a single dispatch run.
 *
 * Writes append-only to `{logDir}/dispatch-{dispatchId}.log`.
 * Each line: `[ISO timestamp] [LABEL] message`
 *
 * The log file is created on first write and is preserved on both success
 * and failure so it can be retrieved for debugging.
 */
export class DispatchLogger {
  readonly logPath: string;
  private ready: Promise<void>;

  constructor(logDir: string, dispatchId: string) {
    this.logPath = join(logDir, `dispatch-${dispatchId}.log`);
    this.ready = mkdir(logDir, { recursive: true }).then(() => {});
  }

  /** Log a lifecycle step message (adapter name, card slug, exit code, etc.) */
  async log(label: string, message: string): Promise<void> {
    await this.ready;
    const line = `[${new Date().toISOString()}] [${label.toUpperCase()}] ${message}\n`;
    await appendFile(this.logPath, line, 'utf-8');
  }

  /** Log the system and user prompts being sent to the agent. */
  async logPrompts(systemPrompt: string, userPrompt: string): Promise<void> {
    await this.ready;
    const sep = '─'.repeat(60);
    const lines = [
      `[${new Date().toISOString()}] [SYSTEM-PROMPT]\n${sep}\n${systemPrompt}\n${sep}`,
      `[${new Date().toISOString()}] [USER-PROMPT]\n${sep}\n${userPrompt}\n${sep}`,
    ];
    await appendFile(this.logPath, lines.join('\n') + '\n', 'utf-8');
  }

  /** Log a raw stdout/stderr chunk from the agent. Kept on a single prefixed line. */
  async logOutput(chunk: string): Promise<void> {
    await this.ready;
    // Prefix every line in the chunk so the log stays grep-friendly
    const prefixed = chunk
      .split('\n')
      .map((line) => `[${new Date().toISOString()}] [OUTPUT] ${line}`)
      .join('\n');
    await appendFile(this.logPath, prefixed + '\n', 'utf-8');
  }

  /** Log the full completion result including the complete stderr. */
  async logCompletion(result: {
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
  }): Promise<void> {
    await this.ready;
    const lines = [
      `[${new Date().toISOString()}] [COMPLETE] exit=${result.exitCode} duration=${result.durationMs}ms`,
    ];
    if (result.stderr) {
      lines.push(`[${new Date().toISOString()}] [STDERR] ${result.stderr}`);
    }
    await appendFile(this.logPath, lines.join('\n') + '\n', 'utf-8');
  }

  /** Read the full log content. Returns null if the log file does not exist. */
  static async read(logPath: string): Promise<string | null> {
    if (!existsSync(logPath)) return null;
    return readFile(logPath, 'utf-8');
  }

  /**
   * Derive the log path for a dispatch from the log directory and dispatch ID.
   * Useful when the in-memory DispatchRecord is gone (e.g. after server restart).
   */
  static logPath(logDir: string, dispatchId: string): string {
    return join(logDir, `dispatch-${dispatchId}.log`);
  }
}
