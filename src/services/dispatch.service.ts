import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import type {
  DispatchRecord,
  DispatchRequest,
  DispatchResult,
  CardDispatchedData,
  CardDispatchOutputData,
  CardDispatchCompletedData,
  CardDispatchFailedData,
} from '../types/dispatch';
import { getAdapter, isValidAdapterName } from './adapters/adapter.interface';
import { WorktreeService } from './worktree.service';
import { PromptService } from './prompt.service';
import { CardService } from './card.service';
import { TaskService } from './task.service';
import { WebSocketService } from './websocket.service';
import { recordAndBroadcastHistory } from '../utils/history-helper';
import { GeminiCliAdapter } from './adapters/gemini-cli.adapter';
import { ClaudeCliAdapter } from './adapters/claude-cli.adapter';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_OUTPUT_BUFFER = 500; // ring buffer size per dispatch

// ─── DispatchService ─────────────────────────────────────────────────────────

/**
 * Singleton orchestrator for card dispatch.
 *
 * Manages the full lifecycle:
 *   1. Validate project + card
 *   2. Create git worktree
 *   3. Build prompts
 *   4. Spawn agent CLI via adapter
 *   5. Stream output to WebSocket
 *   6. Handle completion / failure
 *   7. Cleanup worktree
 */
export class DispatchService {
  private static instance: DispatchService;

  /** Active dispatches keyed by dispatch ID */
  private activeDispatches = new Map<string, DispatchRecord>();

  /** Timeout handles keyed by dispatch ID */
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  /** Ring buffer of output events per dispatch (for late-joining clients) */
  private outputBuffers = new Map<string, CardDispatchOutputData[]>();

  private readonly worktreeService: WorktreeService;
  private readonly promptService: PromptService;

  private constructor() {
    this.worktreeService = new WorktreeService(process.env.DISPATCH_WORKTREE_BASE);
    this.promptService = new PromptService();
  }

  public static getInstance(): DispatchService {
    if (!DispatchService.instance) {
      DispatchService.instance = new DispatchService();
    }
    return DispatchService.instance;
  }

  /** Reset singleton — for testing only */
  public static _resetInstance(): void {
    DispatchService.instance = undefined as unknown as DispatchService;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Start a dispatch for the given card.
   */
  async dispatch(
    projectSlug: string,
    cardSlug: string,
    request: DispatchRequest,
    workspacePath: string
  ): Promise<DispatchRecord> {
    const cardService = new CardService(workspacePath);
    const wsService = WebSocketService.getInstance();

    // ── 1. Validate adapter ─────────────────────────────────────────────────
    if (!isValidAdapterName(request.adapter)) {
      throw Object.assign(new Error(`Invalid adapter: "${request.adapter}"`), {
        code: 'INVALID_ADAPTER',
      });
    }

    // ── 2. Load + validate project ──────────────────────────────────────────
    const { ProjectService } = await import('./project.service');
    const projectService = new ProjectService(workspacePath);
    const project = await projectService.getProject(projectSlug);

    if (!project.repoPath) {
      throw Object.assign(
        new Error(
          'Project has no repository path configured. Set it in project settings.'
        ),
        { code: 'REPO_NOT_CONFIGURED' }
      );
    }

    if (!this.worktreeService.validateRepo(project.repoPath)) {
      throw Object.assign(
        new Error(
          `Repository path is not a valid git repository: ${project.repoPath}`
        ),
        { code: 'REPO_NOT_FOUND' }
      );
    }

    // ── 3. Load + validate card ─────────────────────────────────────────────
    const card = await cardService.getCard(projectSlug, cardSlug);
    // Use the canonical slug (card.slug) for all subsequent operations.
    // If cardSlug was a card ID (e.g. DEV-42), card.slug is the resolved filename slug.
    const resolvedSlug = card.slug;

    if (card.frontmatter.dispatchStatus === 'running') {
      throw Object.assign(
        new Error('Card already has a running dispatch. Cancel it first.'),
        { code: 'DISPATCH_ACTIVE' }
      );
    }

    if (card.lane === '04-archive') {
      throw Object.assign(
        new Error('Cannot dispatch an archived card.'),
        { code: 'CARD_ARCHIVED' }
      );
    }

    // ── 4. Check branch availability ────────────────────────────────────────
    const branch = `card/${resolvedSlug}`;
    const branchAlreadyExists = await this.worktreeService.branchExists(
      project.repoPath,
      branch
    );
    if (branchAlreadyExists) {
      throw Object.assign(
        new Error(
          `Branch "${branch}" already exists in the repository. Delete it or re-dispatch from the existing branch.`
        ),
        { code: 'BRANCH_EXISTS' }
      );
    }

    // ── 5. Create worktree ──────────────────────────────────────────────────
    const { worktreePath } = await this.worktreeService.create(
      project.repoPath,
      projectSlug,
      resolvedSlug
    );

    // ── 6. Build prompts ────────────────────────────────────────────────────
    const { systemPrompt, userPrompt } = await this.promptService.buildPrompts(
      card,
      projectSlug,
      branch,
      project.repoPath
    );

    // ── 7. Write adapter config files ───────────────────────────────────────
    const mcpServerPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'mcp-server.ts'
    );
    const mcpConfigPath = join(worktreePath, '.mcp.json');
    const mcpConfig = ClaudeCliAdapter.buildMcpConfig(mcpServerPath, workspacePath);
    await writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

    // ── 8. Spawn the agent ──────────────────────────────────────────────────
    const dispatchId = crypto.randomUUID();
    const adapter = getAdapter(request.adapter);

    const process_ = await adapter.spawn({
      workingDirectory: worktreePath,
      systemPrompt,
      userPrompt,
      mcpConfigPath,
      model: request.model,
      env: {
        DEVPLANNER_WORKSPACE: workspacePath,
        DEVPLANNER_PROJECT: projectSlug,
        DEVPLANNER_CARD: resolvedSlug,
      },
      onOutput: (chunk: string) => {
        this.handleOutputChunk(dispatchId, projectSlug, resolvedSlug, chunk);
      },
    });

    // ── 9. Update card frontmatter ──────────────────────────────────────────
    await cardService.updateCard(projectSlug, resolvedSlug, {
      assignee: 'agent',
      status: 'in-progress',
    });

    // Write dispatch-specific frontmatter directly (updateCard doesn't support these fields)
    await this.writeDispatchFrontmatter(workspacePath, projectSlug, resolvedSlug, {
      dispatchStatus: 'running',
      dispatchedAt: new Date().toISOString(),
      dispatchAgent: request.adapter,
      dispatchBranch: branch,
    });

    // Move to in-progress if not already there
    if (card.lane === '01-upcoming') {
      await cardService.moveCard(projectSlug, resolvedSlug, '02-in-progress');
    }

    // ── 10. Store record ────────────────────────────────────────────────────
    const record: DispatchRecord = {
      id: dispatchId,
      projectSlug,
      cardSlug: resolvedSlug,
      adapter: request.adapter,
      model: request.model,
      branch,
      worktreePath,
      status: 'running',
      startedAt: new Date().toISOString(),
      autoCreatePR: request.autoCreatePR,
    };

    this.activeDispatches.set(dispatchId, record);
    this.outputBuffers.set(dispatchId, []);

    // ── 11. Record history + broadcast ─────────────────────────────────────
    recordAndBroadcastHistory(projectSlug, 'card:dispatched', `Card dispatched to ${request.adapter}`, {
      cardSlug: resolvedSlug,
      cardTitle: card.frontmatter.title,
      dispatchId,
      dispatchAdapter: request.adapter,
      dispatchBranch: branch,
    });

    const dispatchedData: CardDispatchedData = {
      cardSlug: resolvedSlug,
      dispatchId,
      adapter: request.adapter,
      branch,
    };
    wsService.broadcast(projectSlug, {
      type: 'event',
      event: {
        type: 'card:dispatched',
        projectSlug,
        timestamp: new Date().toISOString(),
        data: dispatchedData,
      },
    });

    // ── 12. Set timeout ─────────────────────────────────────────────────────
    const timeoutMs = parseInt(process.env.DISPATCH_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10);
    this.setupTimeout(dispatchId, timeoutMs, process_, workspacePath, request);

    // ── 13. Wire completion handler ─────────────────────────────────────────
    process_.onComplete
      .then((result) => this.handleCompletion(dispatchId, result, workspacePath, request))
      .catch((err) => {
        console.error(`[DispatchService] Unhandled error in dispatch ${dispatchId}:`, err);
        this.handleCompletion(
          dispatchId,
          { exitCode: -1, stdout: '', stderr: String(err), durationMs: 0 },
          workspacePath,
          request
        );
      });

    return record;
  }

  /**
   * Cancel a running dispatch.
   */
  async cancel(dispatchId: string): Promise<void> {
    const record = this.activeDispatches.get(dispatchId);
    if (!record || record.status !== 'running') {
      throw Object.assign(new Error('No active dispatch found'), {
        code: 'NO_ACTIVE_DISPATCH',
      });
    }

    // The kill handle is stored on the process — look it up via our adapter tracking
    // For now, signal via the timeout mechanism by clearing and marking failed
    const timeout = this.timeouts.get(dispatchId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(dispatchId);
    }

    record.status = 'failed';
    record.completedAt = new Date().toISOString();
    record.error = 'Cancelled by user';
    this.activeDispatches.delete(dispatchId);
  }

  getDispatch(dispatchId: string): DispatchRecord | undefined {
    return this.activeDispatches.get(dispatchId);
  }

  getCardDispatch(projectSlug: string, cardSlug: string): DispatchRecord | undefined {
    for (const record of this.activeDispatches.values()) {
      if (record.projectSlug === projectSlug && record.cardSlug === cardSlug) {
        return record;
      }
    }
    return undefined;
  }

  listActive(): DispatchRecord[] {
    return Array.from(this.activeDispatches.values());
  }

  /**
   * Get buffered output events for an active dispatch (for late-joining clients).
   */
  getOutputBuffer(dispatchId: string): CardDispatchOutputData[] {
    return this.outputBuffers.get(dispatchId) ?? [];
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private handleOutputChunk(
    dispatchId: string,
    projectSlug: string,
    cardSlug: string,
    chunk: string
  ): void {
    const wsService = WebSocketService.getInstance();
    const timestamp = new Date().toISOString();

    // Try to parse as stream-json (Claude Code --output-format stream-json)
    let structured: CardDispatchOutputData['structured'] | undefined;
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed);
        if (json.type === 'tool_use') {
          structured = { type: 'tool_use', toolName: json.name, content: json.input };
        } else if (json.type === 'text') {
          structured = { type: 'text', content: json.text };
        } else if (json.type === 'result') {
          structured = { type: 'result', content: String(json.output ?? '') };
        }
      } catch {
        // Not JSON — raw text line, no structured parsing
      }
    }

    const event: CardDispatchOutputData = {
      cardSlug,
      dispatchId,
      chunk,
      structured,
      timestamp,
    };

    // Append to ring buffer, capped at MAX_OUTPUT_BUFFER
    const buffer = this.outputBuffers.get(dispatchId) ?? [];
    buffer.push(event);
    if (buffer.length > MAX_OUTPUT_BUFFER) {
      buffer.shift();
    }
    this.outputBuffers.set(dispatchId, buffer);

    // Broadcast to WebSocket subscribers
    wsService.broadcast(projectSlug, {
      type: 'event',
      event: {
        type: 'card:dispatch-output',
        projectSlug,
        timestamp,
        data: event,
      },
    });
  }

  private async handleCompletion(
    dispatchId: string,
    result: DispatchResult,
    workspacePath: string,
    request: DispatchRequest
  ): Promise<void> {
    const timeout = this.timeouts.get(dispatchId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(dispatchId);
    }

    const record = this.activeDispatches.get(dispatchId);
    if (!record) return; // Already cancelled

    const { projectSlug, cardSlug, worktreePath, branch } = record;
    const wsService = WebSocketService.getInstance();
    const cardService = new CardService(workspacePath);

    record.exitCode = result.exitCode;
    record.completedAt = new Date().toISOString();

    // ── Handle Gemini turn-limit (exit 53) as 'review' ─────────────────────
    const isTurnLimit =
      request.adapter === 'gemini-cli' && GeminiCliAdapter.isTurnLimitExceeded(result.exitCode);

    if (result.exitCode !== 0 && !isTurnLimit) {
      // ── FAILURE ──────────────────────────────────────────────────────────
      const stderrSnippet = result.stderr.slice(0, 300);
      const errorMsg = `Dispatch agent failed (exit code ${result.exitCode}): ${stderrSnippet}`;

      record.status = 'failed';
      record.error = errorMsg;

      await this.writeDispatchFrontmatter(workspacePath, projectSlug, cardSlug, {
        dispatchStatus: 'failed',
      });
      await cardService.updateCard(projectSlug, cardSlug, {
        status: 'blocked',
        blockedReason: errorMsg,
      });

      recordAndBroadcastHistory(projectSlug, 'card:dispatch-failed', `Dispatch failed: exit code ${result.exitCode}`, {
        cardSlug,
        dispatchId,
        dispatchAdapter: request.adapter,
        dispatchBranch: branch,
        dispatchExitCode: result.exitCode,
      });

      const failedData: CardDispatchFailedData = {
        cardSlug,
        dispatchId,
        exitCode: result.exitCode,
        error: errorMsg,
      };
      wsService.broadcast(projectSlug, {
        type: 'event',
        event: {
          type: 'card:dispatch-failed',
          projectSlug,
          timestamp: new Date().toISOString(),
          data: failedData,
        },
      });

      // Keep worktree for debugging on failure
      this.activeDispatches.delete(dispatchId);
      this.outputBuffers.delete(dispatchId);
      return;
    }

    // ── SUCCESS (exit 0 or Gemini turn-limit) ─────────────────────────────
    // Read the card to check task status after agent ran
    let card;
    try {
      card = await cardService.getCard(projectSlug, cardSlug);
    } catch {
      // Card may have been moved — best-effort
      card = null;
    }

    const tasks = card?.tasks ?? [];
    const uncheckedTasks = tasks.filter((t) => !t.checked);
    const allTasksComplete = uncheckedTasks.length === 0;
    const agentMarkedBlocked = card?.frontmatter.status === 'blocked';

    if (isTurnLimit || (agentMarkedBlocked && !allTasksComplete)) {
      // ── REVIEW — agent ran out of turns or explicitly blocked ───────────
      record.status = 'review';

      await this.writeDispatchFrontmatter(workspacePath, projectSlug, cardSlug, {
        dispatchStatus: 'completed', // completed but needs review
      });
    } else {
      // ── Tier 1 fallback: sweep any remaining unchecked tasks ─────────────
      if (!allTasksComplete) {
        const taskService = new TaskService(workspacePath);
        for (const task of uncheckedTasks) {
          try {
            await taskService.setTaskChecked(projectSlug, cardSlug, task.index, true);
          } catch {
            // Best-effort — don't fail the whole completion
          }
        }
      }

      record.status = 'completed';

      await this.writeDispatchFrontmatter(workspacePath, projectSlug, cardSlug, {
        dispatchStatus: 'completed',
      });

      // Move to complete lane
      try {
        await cardService.moveCard(projectSlug, cardSlug, '03-complete');
      } catch {
        // Card might already be moved
      }

      // Auto-create PR if requested
      let prUrl: string | undefined;
      if (request.autoCreatePR) {
        prUrl = await this.createPR(worktreePath, card);
        if (prUrl) record.prUrl = prUrl;
      }
    }

    recordAndBroadcastHistory(projectSlug, 'card:dispatch-completed', `Dispatch completed (exit ${result.exitCode})`, {
      cardSlug,
      dispatchId,
      dispatchAdapter: request.adapter,
      dispatchBranch: branch,
      dispatchExitCode: result.exitCode,
    });

    const completedData: CardDispatchCompletedData = {
      cardSlug,
      dispatchId,
      exitCode: result.exitCode,
      allTasksComplete,
      prUrl: record.prUrl,
    };
    wsService.broadcast(projectSlug, {
      type: 'event',
      event: {
        type: 'card:dispatch-completed',
        projectSlug,
        timestamp: new Date().toISOString(),
        data: completedData,
      },
    });

    // Cleanup worktree on success
    try {
      const { ProjectService } = await import('./project.service');
      const projectService = new ProjectService(workspacePath);
      const project = await projectService.getProject(projectSlug);
      if (project.repoPath) {
        await this.worktreeService.remove(project.repoPath, worktreePath);
      }
    } catch {
      // Best-effort cleanup
    }

    this.activeDispatches.delete(dispatchId);
    this.outputBuffers.delete(dispatchId);
  }

  private setupTimeout(
    dispatchId: string,
    timeoutMs: number,
    process_: { kill?: () => void },
    workspacePath: string,
    request: DispatchRequest
  ): void {
    const handle = setTimeout(() => {
      console.warn(`[DispatchService] Dispatch ${dispatchId} timed out after ${timeoutMs}ms`);
      process_.kill?.();
      this.handleCompletion(
        dispatchId,
        {
          exitCode: -1,
          stdout: '',
          stderr: `Timed out after ${Math.round(timeoutMs / 60000)} minutes`,
          durationMs: timeoutMs,
        },
        workspacePath,
        request
      ).catch(console.error);
    }, timeoutMs);

    this.timeouts.set(dispatchId, handle);
  }

  /**
   * Write dispatch-specific frontmatter fields to the card file.
   * CardService.updateCard() doesn't expose these fields, so we write
   * them directly via MarkdownService.
   */
  private async writeDispatchFrontmatter(
    workspacePath: string,
    projectSlug: string,
    cardSlug: string,
    fields: Partial<{
      dispatchStatus: string;
      dispatchedAt: string;
      dispatchAgent: string;
      dispatchBranch: string;
    }>
  ): Promise<void> {
    const { MarkdownService } = await import('./markdown.service');
    const { readFile, writeFile: wf } = await import('fs/promises');
    const { ALL_LANES } = await import('../constants');

    for (const lane of ALL_LANES) {
      const cardPath = join(workspacePath, projectSlug, lane, `${cardSlug}.md`);
      if (existsSync(cardPath)) {
        try {
          const content = await readFile(cardPath, 'utf-8');
          const parsed = MarkdownService.parse(content);
          const updatedFrontmatter = { ...parsed.frontmatter, ...fields };
          const newContent = MarkdownService.serialize(
            updatedFrontmatter as import('../types').CardFrontmatter,
            parsed.content
          );
          await wf(cardPath, newContent, 'utf-8');
        } catch {
          // Best-effort
        }
        return;
      }
    }
  }

  /**
   * Attempt to create a GitHub PR via the `gh` CLI.
   * Returns the PR URL on success, or undefined on failure.
   */
  private async createPR(
    worktreePath: string,
    card: { frontmatter: { title: string; description?: string }; cardId?: string | null; tasks: Array<{ text: string; checked: boolean }> } | null
  ): Promise<string | undefined> {
    if (!card) return undefined;

    const cardId = card.cardId ? `${card.cardId}: ` : '';
    const title = `${cardId}${card.frontmatter.title}`;
    const taskList = card.tasks
      .map((t) => `- [${t.checked ? 'x' : ' '}] ${t.text}`)
      .join('\n');
    const body = `## Card\n\n${card.frontmatter.description ?? ''}\n\n## Tasks\n\n${taskList}\n\nDispatched via DevPlanner`;

    const proc = Bun.spawnSync(
      ['gh', 'pr', 'create', '--title', title, '--body', body],
      { cwd: worktreePath, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    if (proc.exitCode === 0) {
      const stdout = new TextDecoder().decode(proc.stdout ?? '').trim();
      // gh pr create outputs the PR URL on success
      return stdout.startsWith('http') ? stdout : undefined;
    }

    const stderr = new TextDecoder().decode(proc.stderr ?? '').trim();
    console.warn(`[DispatchService] gh pr create failed: ${stderr}`);
    return undefined;
  }
}
