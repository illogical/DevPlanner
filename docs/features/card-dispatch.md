---
title: Card Dispatch — AI Coding Agent Integration
type: spec
created: 2026-03-27
updated: 2026-03-27
tags: [spec, devplanner, feature, dispatch, ai-agent, git-worktree]
status: draft
---

# Card Dispatch — AI Coding Agent Integration

## Overview

Card Dispatch lets a user hand off a Kanban card to an AI coding assistant for implementation. The card's description, tasks, markdown content, and linked vault artifacts are assembled into a prompt and sent to an agent CLI (Claude Code, Gemini CLI, or a raw LLM endpoint). The agent works in an isolated git worktree, uses DevPlanner's MCP server to toggle tasks as it completes them, and when it finishes the card is automatically moved to the complete lane (if all tasks pass).

### Why This Matters

DevPlanner currently tracks work — this feature makes it *dispatch* work. A user plans a feature on the board (description, tasks, specs), clicks "Dispatch", and an AI agent implements it while the board updates in real time. The human stays in the loop via the Kanban UI and can intervene at any point.

---

## Agent Comparison

Research into non-interactive invocation of AI coding CLIs. The columns that matter for dispatch: headless invocation, MCP server support (for live board updates), reliable exit codes (for completion detection), and per-invocation configuration (custom prompts per card).

| Agent | Invoke Command | MCP Support | Exit Codes | Per-Invocation Config | Verdict |
|-------|---------------|-------------|------------|----------------------|---------|
| **Claude Code CLI** | `claude -p "prompt" --mcp-config file.json --output-format json` | Native | Reliable + JSON output | Yes: `--system-prompt`, `--allowedTools`, `--mcp-config` | **Phase 1 primary** |
| **Gemini CLI** | `gemini -p "prompt"` | Native via `settings.json` | Documented: 0=ok, 1=error, 42=bad input, 53=turn limit | Yes: MCP via config, model selection | **Phase 1 secondary** |
| Claude Agent SDK | `query({ prompt, options })` TypeScript | Per-invocation via `mcpServers` option | Programmatic (exceptions) | Full: system prompt, tools, hooks, permissions | Phase 2 — best deep integration |
| Aider | `aider -m "prompt" --yes --model X` | No native MCP | Standard shell (0/1) | Via flags + config file + `--message-file` | Phase 2 |
| OpenCode | `opencode run "prompt"` | Global config only | **Unreliable** (exits 0 on errors, hangs on 429s) | **No** per-invocation config | **Not recommended** — see notes below |

### OpenCode Limitations (Why It's Not Recommended)

Research found critical issues that make OpenCode unsuitable for non-interactive automation:

- **Unreliable exit codes** ([sst/opencode#2489](https://github.com/sst/opencode/issues/2489)): Returns exit code 0 even when errors are printed to stderr
- **Process hanging** ([anomalyco/opencode#13851](https://github.com/anomalyco/opencode/issues/13851), [#10411](https://github.com/anomalyco/opencode/issues/10411)): When a permission question is asked in non-interactive mode and TTY is not detected, the process hangs indefinitely
- **Hangs on API errors** ([anomalyco/opencode#8203](https://github.com/anomalyco/opencode/issues/8203)): Rate limit (429) responses cause infinite hang — never exits
- **No per-invocation MCP** ([anomalyco/opencode#10527](https://github.com/anomalyco/opencode/issues/10527)): MCP servers can only be configured globally, not per-dispatch
- **No per-invocation instructions**: Custom system prompts must be in config files, not CLI flags

These issues are documented upstream and may be resolved in future releases. Re-evaluate if OpenCode addresses these.

### Claude Agent SDK (Phase 2 — Deep Integration)

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk` on npm, v0.2.86+) is the programmatic TypeScript/Python interface for building autonomous AI agents. Key advantages over shelling out to `claude -p`:

- **No subprocess overhead** — native TypeScript, runs in-process
- **Per-invocation MCP servers** — pass `mcpServers` config directly per dispatch
- **Hooks** — pre/post-tool-use callbacks for audit logging, blocking, transforming
- **Session management** — resume multi-turn workflows; session IDs persist
- **Streaming** — iterate over Claude's reasoning and tool calls in real-time
- **Permission modes** — `acceptEdits`, `dontAsk`, `bypassPermissions`, or custom callback

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: cardPrompt,
  options: {
    allowedTools: ["Read", "Edit", "Bash", "Glob", "Grep"],
    permissionMode: "acceptEdits",
    systemPrompt: systemPrompt,
    mcpServers: {
      devplanner: {
        command: "bun",
        args: ["path/to/mcp-server.ts"],
        env: { DEVPLANNER_WORKSPACE: workspacePath }
      }
    }
  }
})) {
  // Stream progress updates to WebSocket
}
```

Requires `ANTHROPIC_API_KEY`. Best long-term option for deep DevPlanner integration.

---

## Architecture

### Dispatch Pipeline

```
User clicks Dispatch → DispatchModal (config) → POST /api/.../dispatch
                                                        │
                                                        ▼
                                              ┌─────────────────────┐
                                              │  DispatchService     │
                                              │  (orchestrator)      │
                                              └────────┬────────────┘
                                                       │
                          ┌────────────────────────────┼────────────────────────────┐
                          ▼                            ▼                            ▼
                   Read full card              Create git worktree          Build prompts
                   + fetch artifacts           card/<slug> branch           system + user
                          │                            │                            │
                          └────────────────────────────┼────────────────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────────┐
                                              │  Adapter.spawn()     │
                                              │  (claude-cli /       │
                                              │   gemini-cli)        │
                                              └────────┬────────────┘
                                                       │
                                            ┌──────────┴──────────┐
                                            │ Agent runs in       │
                                            │ worktree, uses      │
                                            │ MCP to toggle tasks │
                                            │ on live board       │
                                            └──────────┬──────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────────┐
                                              │  Completion Handler  │
                                              │  • check exit code   │
                                              │  • verify all tasks  │
                                              │  • auto-move card    │
                                              │  • optional auto-PR  │
                                              │  • cleanup worktree  │
                                              └─────────────────────┘
```

### Adapter Pattern

A pluggable adapter interface lets new agent backends be added without touching the dispatch orchestrator.

```typescript
// src/services/adapters/adapter.interface.ts

export type DispatchAdapterName =
  | 'claude-cli'
  | 'gemini-cli'
  | 'claude-sdk'    // Phase 2
  | 'aider';        // Phase 2

export interface DispatchAdapter {
  name: DispatchAdapterName;
  spawn(config: DispatchConfig): Promise<DispatchProcess>;
}

export interface DispatchConfig {
  workingDirectory: string;     // Worktree path
  systemPrompt: string;         // Generated from card context
  userPrompt: string;           // Card-specific instructions
  mcpConfigPath?: string;       // Path to .mcp.json in worktree
  model?: string;               // e.g. "claude-sonnet-4-20250514"
  apiEndpoint?: string;         // Reserved for future custom endpoints
  env?: Record<string, string>; // Additional env vars
  onOutput?: (chunk: string) => void; // Callback for streaming stdout to WebSocket
}

export interface DispatchProcess {
  id: string;
  pid?: number;                 // OS process ID (for CLI adapters)
  kill?: () => void;            // Cancel function
  onComplete: Promise<DispatchResult>;
}

export interface DispatchResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}
```

### How Agents Keep the Board Updated

> **Full design rationale and tier tradeoffs:** [agent-board-updates.md](./agent-board-updates.md)

Three tiers of board sync are used together. Tier 3 is primary; Tier 1 is an automatic fallback that fires whenever the agent exits without having toggled all tasks:

| Tier | Mechanism | When it fires |
|------|-----------|---------------|
| **3 — Primary** | Native MCP tools via `.mcp.json` in worktree | Agent calls `mcp__devplanner__toggle_task` in real time as each task completes |
| **2 — Backup** | REST API via `curl` in `Bash` tool | Phase 2 non-MCP agents (Aider); REST block included in system prompt as fallback |
| **1 — Fallback** | Post-completion sweep in `handleCompletion()` | Agent exits cleanly but some tasks remain unchecked — all are swept and card is moved |

**MCP wiring (Tier 3):** Before spawning the agent, DevPlanner writes a `.mcp.json` file into the worktree root that points to DevPlanner's MCP server:

```json
{
  "mcpServers": {
    "devplanner": {
      "command": "bun",
      "args": ["<DEVPLANNER_PROJECT_DIR>/src/mcp-server.ts"],
      "env": {
        "DEVPLANNER_WORKSPACE": "<DEVPLANNER_WORKSPACE value>"
      }
    }
  }
}
```

Claude Code reads `.mcp.json` automatically. Gemini CLI reads from `.gemini/settings.json` — the adapter writes both.

The agent's `CLAUDE.md` instructs it to use DevPlanner MCP tools (prefixed `mcp__devplanner__`) as it works. Task toggles broadcast via WebSocket and appear in the Kanban UI in real time. The Tier 1 fallback in `handleCompletion()` catches anything the agent missed.

---

## Data Model Changes

### ProjectConfig (src/types/index.ts)

Add to `ProjectConfig`:

```typescript
repoPath?: string; // Absolute local path to git repository for dispatch
```

Stored in `_project.json`. Validated on save: path must exist, must be a git repo (`git rev-parse --is-inside-work-tree`).

### CardFrontmatter (src/types/index.ts)

Add optional dispatch tracking fields:

```typescript
dispatchStatus?: 'dispatched' | 'running' | 'completed' | 'failed';
dispatchedAt?: string;       // ISO 8601 — when dispatch started
dispatchAgent?: string;      // Adapter name used (e.g. "claude-cli")
dispatchBranch?: string;     // Git branch name (e.g. "card/my-feature")
```

These are written to card frontmatter so dispatch state persists across server restarts and is visible to the MCP server / file watcher.

### Preferences (src/types/index.ts)

Add dispatch preference persistence:

```typescript
lastDispatchAdapter?: string;       // e.g. "claude-cli"
lastDispatchModel?: string;         // e.g. "claude-sonnet-4-20250514"
lastDispatchAutoCreatePR?: boolean; // remembered toggle state
```

### Dispatch-Specific Types (src/types/dispatch.ts — NEW)

```typescript
export interface DispatchRequest {
  adapter: DispatchAdapterName;
  model?: string;
  autoCreatePR: boolean;
}

export interface DispatchRecord {
  id: string;                         // UUID
  projectSlug: string;
  cardSlug: string;
  adapter: DispatchAdapterName;
  model?: string;
  branch: string;                     // e.g. "card/my-feature"
  worktreePath: string;               // Absolute path to worktree
  status: 'running' | 'completed' | 'failed' | 'review';
  startedAt: string;                  // ISO 8601
  completedAt?: string;
  exitCode?: number;
  autoCreatePR: boolean;
  prUrl?: string;                     // If PR was created
  error?: string;                     // Error message on failure
}
```

### WebSocket Events (src/types/index.ts)

Add to `WebSocketEventType`:

```typescript
| 'card:dispatched'
| 'card:dispatch-output'
| 'card:dispatch-completed'
| 'card:dispatch-failed'
```

Event payloads:

```typescript
export interface CardDispatchedData {
  cardSlug: string;
  dispatchId: string;
  adapter: string;
  branch: string;
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
```

### History Events (src/types/index.ts)

Add to `HistoryActionType`:

```typescript
| 'card:dispatched'
| 'card:dispatch-completed'
| 'card:dispatch-failed'
```

Add to `HistoryEventMetadata`:

```typescript
dispatchId?: string;
dispatchAdapter?: string;
dispatchBranch?: string;
dispatchExitCode?: number;
```

---

## API Endpoints

### POST /api/projects/:projectSlug/cards/:cardSlug/dispatch

Start a dispatch for a card.

**Request:**

```json
{
  "adapter": "claude-cli",
  "model": "claude-sonnet-4-20250514",
  "autoCreatePR": false
}
```

**Validations:**
- Project must have `repoPath` configured
- `repoPath` must exist and be a git repo
- Card must not already have an active dispatch (`dispatchStatus` is not `running`)
- Card must be in `01-upcoming` or `02-in-progress` lane
- Adapter must be a recognized `DispatchAdapterName`

**Response 201:**

```json
{
  "dispatch": {
    "id": "uuid",
    "projectSlug": "hex",
    "cardSlug": "implement-auth",
    "adapter": "claude-cli",
    "branch": "card/implement-auth",
    "worktreePath": "/tmp/devplanner-dispatch/hex/implement-auth",
    "status": "running",
    "startedAt": "2026-03-27T14:00:00Z",
    "autoCreatePR": false
  }
}
```

**Error responses:**
- `400 REPO_NOT_CONFIGURED` — Project has no `repoPath`
- `400 REPO_NOT_FOUND` — `repoPath` does not exist or is not a git repo
- `400 INVALID_ADAPTER` — Unknown adapter name
- `409 DISPATCH_ACTIVE` — Card already has a running dispatch
- `409 BRANCH_EXISTS` — Branch `card/<slug>` already exists in the repo

### GET /api/projects/:projectSlug/cards/:cardSlug/dispatch

Get the active or most recent dispatch for a card.

**Response 200:**

```json
{
  "dispatch": { ... }
}
```

**Response 200 (no dispatch):**

```json
{
  "dispatch": null
}
```

### POST /api/projects/:projectSlug/cards/:cardSlug/dispatch/cancel

Cancel a running dispatch.

**Response 200:**

```json
{
  "success": true
}
```

**Error:**
- `404 NO_ACTIVE_DISPATCH` — No running dispatch to cancel

### GET /api/dispatches

List all active dispatches across all projects.

**Response 200:**

```json
{
  "dispatches": [ ... ]
}
```

---

## Prompt Construction

The `PromptService` assembles two prompts from card context:

### System Prompt

Template (written to `CLAUDE.md` in worktree for Claude CLI, or passed via flags for others):

```markdown
# Agent Instructions

You are a software development agent implementing a feature described below.
Work in the current directory — it is a git worktree checked out to a feature branch.

## DevPlanner Board Updates

You have access to the DevPlanner MCP server (`mcp__devplanner__*` tools).

1. Call `mcp__devplanner__get_card` first to read current task indices (0-based).
2. Call `mcp__devplanner__toggle_task` immediately after finishing each task.
3. Call `mcp__devplanner__update_card` with `status: "blocked"` and a `blockedReason` if you get stuck.
4. Call `mcp__devplanner__move_card` with `lane: "03-complete"` when all tasks are done.
5. Optionally call `mcp__devplanner__create_vault_artifact` to attach a summary.

Project: {projectSlug} | Card: {cardSlug}
Toggle tasks immediately — do not batch them at the session end.

## Git Instructions

- Commit changes with descriptive messages as you complete logical units of work
- Do not push — the dispatch system handles branch management
- Your branch: `{branchName}`

## Project Context

{CLAUDE.md content from the main repo, if present}
```

### User Prompt

```markdown
# Card: {cardId} — {title}

## Description

{description}

## Content

{full markdown body}

## Tasks

{numbered task list with current checked state}
- [ ] 0: Design the database schema
- [ ] 1: Write migration files
- [x] 2: Create the API endpoint (already done)
- [ ] 3: Add input validation
- [ ] 4: Write tests

## Reference Artifacts

{for each vault link, fetch and include the full artifact content}

### Implementation Spec (artifact)
{full content of the linked spec document}

### Research Notes (artifact)
{full content of the linked research document}
```

### Artifact Content Fetching

For each link on the card whose URL matches the `artifactBaseUrl` pattern:
1. Parse the URL to extract the relative path within the vault
2. Read the file from `{artifactBasePath}/{relativePath}`
3. Include the full text in the user prompt under the "Reference Artifacts" section

Links that don't match the vault URL pattern (external URLs) are listed as references but not fetched.

---

## Git Worktree Strategy

### Branch Naming

Convention: `card/{cardSlug}`

Example: Card slug `implement-user-auth` → branch `card/implement-user-auth`

### Worktree Location

Base path: `{DISPATCH_WORKTREE_BASE}` env var, defaulting to `{os.tmpdir()}/devplanner-dispatch/`

Full path: `{base}/{projectSlug}/{cardSlug}`

Example: `/tmp/devplanner-dispatch/hex/implement-user-auth`

### Lifecycle

```
1. Dispatch requested
   └─ git worktree add {path} -b card/{slug}   (from project's repoPath)
   └─ Write .mcp.json and CLAUDE.md to worktree

2. Agent runs in worktree
   └─ Makes edits, runs commands, commits to card/{slug} branch
   └─ Uses MCP to update DevPlanner board

3. Agent completes
   └─ If auto-PR: gh pr create from worktree
   └─ If all tasks done: move card to 03-complete
   └─ git worktree remove {path}

4. Cleanup on failure
   └─ Worktree kept if status is 'failed' (for debugging)
   └─ User can re-dispatch after fixing issues
   └─ Manual cleanup: git worktree remove {path} && git branch -d card/{slug}
```

### Parallel Dispatch

Each card gets its own worktree and branch. Multiple cards can be dispatched simultaneously since git worktrees are isolated. The only constraint: two worktrees cannot share the same branch name, so a card can only have one active dispatch at a time (enforced by the API's `409 DISPATCH_ACTIVE` check).

### WorktreeService (src/services/worktree.service.ts — NEW)

```typescript
export class WorktreeService {
  async create(repoPath: string, branchName: string, worktreeBase?: string): Promise<{
    worktreePath: string;
    branch: string;
  }>;

  async remove(repoPath: string, worktreePath: string): Promise<void>;

  async list(repoPath: string): Promise<Array<{
    path: string;
    branch: string;
    head: string;
  }>>;

  async branchExists(repoPath: string, branchName: string): Promise<boolean>;

  validateRepo(repoPath: string): boolean; // git rev-parse --is-inside-work-tree
}
```

Uses `Bun.spawnSync` for synchronous git operations (matching existing `GitService` patterns). Worktree creation and removal are fast enough to be synchronous.

---

## Dispatch Modal UI

The dispatch button appears in the card detail header action row (in `CardDetailHeader.tsx`) when:
- Card is not in `04-archive`
- Card does not have an active dispatch (`dispatchStatus !== 'running'`)
- Project has `repoPath` configured

Clicking it opens the **DispatchModal**.

### Modal Fields

```
┌─────────────────────────────────────────────────┐
│  Dispatch Card: DE-42 — Implement User Auth     │
│─────────────────────────────────────────────────│
│                                                 │
│  Agent         [Claude Code CLI     ▾]          │
│                                                 │
│  Model         [claude-sonnet-4-2025...]        │
│                                                 │
│  ☐ Auto-create Pull Request                     │
│                                                 │
│         [ Cancel ]    [ Dispatch ]              │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Field Behavior

| Field | Behavior |
|-------|----------|
| **Agent** | Dropdown: "Claude Code CLI", "Gemini CLI". Default: last used (from preferences) or "Claude Code CLI" |
| **Model** | Free text input. Pre-filled from preferences. Placeholder varies by adapter (e.g. "claude-sonnet-4-20250514" for Claude, "gemini-2.5-pro" for Gemini) |
| **Auto-create PR** | Checkbox. Remembered in preferences. Default: off |

On submit:
1. Save selections to preferences (`preferencesApi.update()`)
2. Call `POST /api/.../dispatch` with config
3. Close modal
4. Card UI updates via WebSocket event

### DispatchStatus Badge

A small status indicator shown on:
- `CardPreview.tsx` — inline badge next to assignee
- `CardDetailHeader.tsx` — replaces dispatch button while active

States:
- **Running** — pulsing dot + "Dispatched" label
- **Review** — yellow dot + "Needs Review" (agent finished but tasks incomplete)
- **Failed** — red dot + "Dispatch Failed"
- **Completed** — green checkmark (transient, card moves to complete lane)

### Live Agent Output Panel

While an agent is actively working on a card, the user can open a real-time output viewer to see what the agent is doing.

**How it works:**

1. **Backend streaming**: `Bun.spawn` returns `proc.stdout` as a `ReadableStream`. Instead of buffering until completion, the dispatch service reads chunks as they arrive and broadcasts them via WebSocket as `card:dispatch-output` events.

2. **Claude Code** with `--output-format stream-json` emits newline-delimited JSON events in real time — each event describes a tool call (file read, edit, bash command), the agent's reasoning, or a result. These can be parsed for rich rendering.

3. **Gemini CLI** outputs plain text streamed to stdout. Less structured but still useful as a live log.

**Frontend components:**

- **"View Output" button** — appears on dispatched cards (both in `CardPreview` and `CardDetailHeader`)
- **AgentOutputPanel** — a slide-out drawer or modal with:
  - Monospace terminal-style log view, auto-scrolling
  - For Claude Code stream-json: richer rendering showing tool names, file paths, and reasoning in distinct visual styles
  - Timestamp per line/event
  - "Pause auto-scroll" toggle for reviewing past output
  - Output buffer capped at last ~1000 lines to prevent memory issues
  - "Download full log" button for the complete output

**WebSocket event:**

```typescript
export interface CardDispatchOutputData {
  cardSlug: string;
  dispatchId: string;
  chunk: string;          // Raw text chunk
  structured?: {          // Parsed from stream-json (Claude Code only)
    type: 'tool_use' | 'text' | 'result';
    toolName?: string;    // e.g. "Edit", "Bash"
    content?: string;
  };
  timestamp: string;
}
```

**Backend buffering:**

The dispatch service maintains a ring buffer (last ~500 events) per active dispatch so that when a user opens the output panel mid-execution, they see recent history — not just new events from that point forward.

```typescript
// In DispatchService
private outputBuffers = new Map<string, Array<CardDispatchOutputData>>();
private readonly MAX_BUFFER_SIZE = 500;
```

The output panel is Phase 1 for Claude Code CLI (since `stream-json` provides structured events) and basic text streaming for Gemini CLI.

**New files for output panel:**

| File | Purpose |
|------|---------|
| `frontend/src/components/dispatch/AgentOutputPanel.tsx` | Terminal-style output viewer |

**Modified files:**

| File | Changes |
|------|---------|
| `src/services/dispatch.service.ts` | Add stdout streaming → WebSocket broadcasting + ring buffer |
| `src/services/adapters/claude-cli.adapter.ts` | Use `--output-format stream-json`, pipe stdout chunks to callback |
| `frontend/src/store/slices/dispatchSlice.ts` | Add output buffer state + WebSocket handler |
| `frontend/src/store/slices/wsSlice.ts` | Handle `card:dispatch-output` events |

### Subtle Active-State Animation

Even without opening the output panel, dispatched cards show activity:

- **Card border pulse** — a subtle CSS animation on `CardPreview` when `dispatchStatus === 'running'` (e.g., a slow glow or border pulse in the project's accent color)
- **Task progress updates** — tasks visually check off in real-time as the agent toggles them via MCP, providing natural "something is happening" feedback without any special animation

---

## Completion Logic

When the agent process exits:

```
Agent exits
    │
    ├─ exit code === 0?
    │   ├─ YES → Read card via CardService.getCard()
    │   │         ├─ All tasks checked?             ← agent may have toggled via MCP already
    │   │         │   ├─ YES → Move card to 03-complete
    │   │         │   │         Set dispatchStatus: 'completed'
    │   │         │   │         Record 'card:dispatch-completed' history
    │   │         │   │         Broadcast 'card:dispatch-completed'
    │   │         │   │         If autoCreatePR → run gh pr create
    │   │         │   │         Remove worktree
    │   │         │   │
    │   │         │   └─ NO  → Tier 1 fallback: batch_update_tasks (all unchecked → true)
    │   │         │            Move card to 03-complete
    │   │         │            Set dispatchStatus: 'completed'
    │   │         │            Record 'card:dispatch-completed' history
    │   │         │            Broadcast 'card:dispatch-completed'
    │   │         │            Remove worktree
    │   │         │
    │   │         │   Note: if exit code 0 but tasks were only partially done and
    │   │         │   the agent set status: 'blocked' via MCP, skip the sweep and
    │   │         │   set card to 'review' instead (agent's explicit signal wins)
    │
    └─ exit code !== 0?
        └─ Set status: 'blocked'
           Set blockedReason: 'Dispatch agent failed (exit code N): {stderr snippet}'
           Set dispatchStatus: 'failed'
           Record 'card:dispatch-failed' history
           Broadcast 'card:dispatch-failed'
           Keep worktree for debugging
```

> **Tier 1 fallback:** The post-completion sweep is intentional — it guarantees the board is never left in a permanently stale state even if the agent ignored the MCP instructions entirely. See [agent-board-updates.md](./agent-board-updates.md) for full rationale.

### Auto-PR Creation

When `autoCreatePR` is true and the agent succeeds:

```bash
cd {worktreePath}
gh pr create \
  --title "{cardId}: {cardTitle}" \
  --body "## Card\n\n{cardDescription}\n\n## Tasks\n\n{task checklist}\n\nDispatched via DevPlanner"
```

Requires `gh` CLI to be installed and authenticated on the host. If `gh` is not available or fails, the dispatch still succeeds — the PR creation failure is logged but does not affect card status.

### Timeout

A configurable timeout (`DISPATCH_TIMEOUT_MS`, default 30 minutes) guards against hung agents:

```typescript
const timeout = setTimeout(() => {
  process.kill?.();
  handleCompletion(dispatchId, { exitCode: -1, stdout: '', stderr: 'Timed out', durationMs: timeoutMs });
}, timeoutMs);
```

---

## Adapter Specifications

### Claude Code CLI Adapter (Phase 1 — Primary Agentic)

**File:** `src/services/adapters/claude-cli.adapter.ts`

**Pre-spawn setup:**
1. Write `CLAUDE.md` to worktree root (system prompt — Claude Code reads this automatically as project instructions)
2. Write `.mcp.json` to worktree root (MCP server config pointing to DevPlanner)

**Spawn command:**

```typescript
async spawn(config: DispatchConfig): Promise<DispatchProcess> {
  const id = crypto.randomUUID();
  const startTime = Date.now();

  // Write CLAUDE.md with system prompt
  await Bun.write(
    join(config.workingDirectory, 'CLAUDE.md'),
    config.systemPrompt
  );

  // Write .mcp.json
  await Bun.write(
    join(config.workingDirectory, '.mcp.json'),
    JSON.stringify({ mcpServers: { devplanner: { /* ... */ } } })
  );

  const args = [
    'claude',
    '-p', config.userPrompt,
    '--output-format', 'stream-json',
    '--allowedTools', 'Bash,Read,Edit,Write,Glob,Grep,mcp__devplanner__toggle_task,mcp__devplanner__update_card,mcp__devplanner__create_vault_artifact'
  ];

  if (config.model) {
    args.push('--model', config.model);
  }

  const proc = Bun.spawn(args, {
    cwd: config.workingDirectory,
    env: { ...process.env, ...config.env },
    stdout: 'pipe',
    stderr: 'pipe'
  });

  // Stream stdout chunks to the dispatch service for real-time WebSocket broadcasting
  // stream-json emits newline-delimited JSON events (tool calls, reasoning, results)
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  // Read stdout in background, forwarding chunks via onOutput callback
  const readStdout = (async () => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      stdoutChunks.push(text);
      config.onOutput?.(text);  // Forward to dispatch service for WebSocket broadcast
    }
  })();

  const readStderr = (async () => {
    const reader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      stderrChunks.push(decoder.decode(value));
    }
  })();

  const onComplete = proc.exited.then(async (exitCode) => {
    await Promise.all([readStdout, readStderr]);
    return {
      exitCode,
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join(''),
      durationMs: Date.now() - startTime
    };
  });

  return {
    id,
    pid: proc.pid,
    kill: () => proc.kill(),
    onComplete
  };
}
```

**Notes:**
- `--allowedTools` includes the standard file tools plus the DevPlanner MCP tools (prefixed with `mcp__devplanner__`)
- `--output-format stream-json` emits newline-delimited JSON events in real time — each line is a structured event (tool use, reasoning, result) that the dispatch service forwards via WebSocket for the live output panel
- The `CLAUDE.md` file is temporary — it lives in the worktree and is cleaned up with it
- If the user prompt exceeds CLI argument limits, write it to a temp file and use `cat file | claude -p -`
- `config.onOutput` is an optional callback passed by the dispatch service to receive stdout chunks for WebSocket broadcasting

### Gemini CLI Adapter (Phase 1 — Secondary Agentic)

**File:** `src/services/adapters/gemini-cli.adapter.ts`

**Pre-spawn setup:**
1. Write Gemini's `settings.json` to a temp location with MCP server config
2. Write the system prompt to a context file

**Spawn command:**

```typescript
async spawn(config: DispatchConfig): Promise<DispatchProcess> {
  const id = crypto.randomUUID();
  const startTime = Date.now();

  // Gemini CLI reads MCP config from settings.json
  // Write a temporary settings file with DevPlanner MCP server
  const settingsPath = join(config.workingDirectory, '.gemini', 'settings.json');
  await mkdir(dirname(settingsPath), { recursive: true });
  await Bun.write(settingsPath, JSON.stringify({
    mcpServers: {
      devplanner: {
        command: 'bun',
        args: [mcpServerPath],
        env: { DEVPLANNER_WORKSPACE: workspacePath }
      }
    }
  }));

  // Combine system + user prompt (Gemini CLI doesn't have a separate system prompt flag)
  const fullPrompt = `${config.systemPrompt}\n\n---\n\n${config.userPrompt}`;

  const proc = Bun.spawn(
    ['gemini', '-p', fullPrompt],
    {
      cwd: config.workingDirectory,
      env: { ...process.env, ...config.env },
      stdout: 'pipe',
      stderr: 'pipe'
    }
  );

  const onComplete = proc.exited.then(async (exitCode) => {
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    return { exitCode, stdout, stderr, durationMs: Date.now() - startTime };
  });

  return {
    id,
    pid: proc.pid,
    kill: () => proc.kill(),
    onComplete
  };
}
```

**Gemini-specific exit codes:**
- `0` — success
- `1` — general or API error
- `42` — invalid input
- `53` — turn limit exceeded (treat as partial success → set card to 'review')

---

## Dispatch Service (Orchestrator)

**File:** `src/services/dispatch.service.ts`

Singleton service managing the full dispatch lifecycle. Holds active dispatches in memory (`Map<string, DispatchRecord>`).

### Key Methods

```typescript
export class DispatchService {
  private static instance: DispatchService;
  private activeDispatches = new Map<string, DispatchRecord>();
  private timeouts = new Map<string, Timer>();

  async dispatch(
    projectSlug: string,
    cardSlug: string,
    request: DispatchRequest
  ): Promise<DispatchRecord>;

  async cancel(dispatchId: string): Promise<void>;

  getDispatch(dispatchId: string): DispatchRecord | undefined;

  getCardDispatch(projectSlug: string, cardSlug: string): DispatchRecord | undefined;

  listActive(): DispatchRecord[];

  // Private
  private async handleCompletion(dispatchId: string, result: DispatchResult): Promise<void>;
  private async buildMcpConfig(worktreePath: string): Promise<string>;
  private setupTimeout(dispatchId: string, timeoutMs: number): void;
}
```

### dispatch() Flow

```
1. Validate project has repoPath
2. Validate card exists and is not already dispatched
3. Fetch full card (content, tasks, links)
4. Fetch artifact contents from vault links
5. Create worktree: WorktreeService.create(repoPath, `card/${cardSlug}`)
6. Build prompts: PromptService.buildPrompts(card, artifacts, projectConfig)
7. Write adapter-specific config files to worktree (.mcp.json, CLAUDE.md, etc.)
8. Get adapter: getAdapter(request.adapter)
9. Spawn: adapter.spawn(dispatchConfig)
10. Update card frontmatter:
    - assignee: 'agent'
    - status: 'in-progress'
    - dispatchStatus: 'running'
    - dispatchedAt: new Date().toISOString()
    - dispatchAgent: request.adapter
    - dispatchBranch: `card/${cardSlug}`
11. Move card to 02-in-progress (if not already)
12. Record 'card:dispatched' history event
13. Broadcast 'card:dispatched' WebSocket event
14. Store DispatchRecord in activeDispatches map
15. Attach process.onComplete.then(handleCompletion)
16. Setup timeout
17. Return DispatchRecord
```

---

## Project Config UI

### Backend

The existing `PATCH /api/projects/:slug` endpoint already accepts partial updates to `ProjectConfig`. Adding `repoPath` to the type is sufficient — the update logic flows through `ProjectService.updateProject()`.

Add validation in the route handler or service: when `repoPath` is provided, verify:
1. Path exists: `existsSync(repoPath)`
2. Is a git repo: `Bun.spawnSync(['git', 'rev-parse', '--is-inside-work-tree'], { cwd: repoPath }).exitCode === 0`

### Frontend

Add a "Repository" section to the project settings UI (or create a project settings panel if one doesn't exist). Minimal implementation:

- Label: "Git Repository Path"
- Input: text field with absolute path
- Help text: "Local path to the git repository for this project. Required for card dispatch."
- Save: calls `projectsApi.update(slug, { repoPath })` on blur/submit
- Validation feedback: "Valid git repository" / "Path not found" / "Not a git repository"

---

## File Inventory

### Phase 1 — New Files

| File | Purpose |
|------|---------|
| `src/types/dispatch.ts` | Dispatch-specific type definitions |
| `src/services/worktree.service.ts` | Git worktree CRUD operations |
| `src/services/prompt.service.ts` | Card context → system prompt + user prompt |
| `src/services/dispatch.service.ts` | Orchestrator — manages dispatch lifecycle |
| `src/services/adapters/adapter.interface.ts` | Adapter interface + registry |
| `src/services/adapters/claude-cli.adapter.ts` | Claude Code CLI adapter (agentic) |
| `src/services/adapters/gemini-cli.adapter.ts` | Gemini CLI adapter (agentic) |
| `src/routes/dispatch.ts` | REST endpoints for dispatch |
| `frontend/src/components/dispatch/DispatchModal.tsx` | Config modal UI |
| `frontend/src/components/dispatch/DispatchStatus.tsx` | Status badge component |
| `frontend/src/components/dispatch/AgentOutputPanel.tsx` | Live terminal-style agent output viewer |
| `frontend/src/store/slices/dispatchSlice.ts` | Zustand dispatch state slice |

### Phase 1 — Modified Files

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `repoPath` to ProjectConfig, dispatch fields to CardFrontmatter, dispatch prefs to Preferences, new WebSocket/History event types |
| `frontend/src/types/index.ts` | Mirror backend type changes |
| `src/server.ts` | Register dispatch routes |
| `frontend/src/api/client.ts` | Add `dispatchApi` endpoint group |
| `frontend/src/store/types.ts` | Add DispatchSlice to store type |
| `frontend/src/store/index.ts` | Compose dispatchSlice into store |
| `frontend/src/components/card-detail/CardDetailHeader.tsx` | Add Dispatch button + status indicator |
| `frontend/src/components/kanban/CardPreview.tsx` | Add dispatch status badge |
| `frontend/src/store/slices/wsSlice.ts` | Handle new dispatch WebSocket events |
| `.env.example` | Document new env vars |

---

## Phased Implementation

### Phase 1 — Core Pipeline (This Spec)

**Goal:** User can dispatch a card to Claude Code CLI or Gemini CLI from the UI. Agent works in a worktree, updates board via MCP, card auto-completes on success.

Tasks:
1. Create `src/types/dispatch.ts` with all dispatch types
2. Extend `src/types/index.ts` — ProjectConfig.repoPath, CardFrontmatter dispatch fields, Preferences dispatch prefs, WebSocket + History event types
3. Mirror type changes to `frontend/src/types/index.ts`
4. Create `src/services/worktree.service.ts` — create, remove, list, branchExists, validateRepo
5. Create `src/services/prompt.service.ts` — `buildPrompts()` assembling card context into system + user prompts; system prompt must include the concise MCP instruction block with correct `mcp__devplanner__`-prefixed tool names, project/card slugs injected, and `move_card` at completion (see [agent-board-updates.md](./agent-board-updates.md) for canonical block text)
6. Create `src/services/adapters/adapter.interface.ts` — adapter interface + registry
7. Create `src/services/adapters/claude-cli.adapter.ts` — spawn `claude -p` with MCP config
8. Create `src/services/adapters/gemini-cli.adapter.ts` — spawn `gemini -p` with MCP config
9. Create `src/services/dispatch.service.ts` — orchestrator with dispatch(), cancel(), handleCompletion()
10. Create `src/routes/dispatch.ts` — POST dispatch, GET status, POST cancel, GET list
11. Register dispatch routes in `src/server.ts`
12. Add repoPath validation to project update flow
13. Add `dispatchApi` to `frontend/src/api/client.ts`
14. Create `frontend/src/store/slices/dispatchSlice.ts`
15. Register dispatch slice in store index + types
16. Create `frontend/src/components/dispatch/DispatchModal.tsx`
17. Create `frontend/src/components/dispatch/DispatchStatus.tsx`
18. Add Dispatch button to `CardDetailHeader.tsx`
19. Add dispatch status badge to `CardPreview.tsx`
20. Handle dispatch WebSocket events in `wsSlice.ts` (including `card:dispatch-output`)
21. Create `frontend/src/components/dispatch/AgentOutputPanel.tsx` — live terminal output viewer
22. Add "View Output" button to dispatched cards in `CardDetailHeader.tsx`
23. Add stdout streaming + ring buffer to `DispatchService` for WebSocket broadcast
24. Add project repo path UI to project settings
25. Update `.env.example` with new env vars
26. Manual end-to-end test: dispatch a card to Claude Code CLI in a test repo

### Phase 2 — Extended Adapters + Polish

- Claude Agent SDK adapter (`@anthropic-ai/claude-agent-sdk` — in-process TypeScript)
- Aider adapter (`aider -m --yes`)
- Agent output streaming to frontend (real-time logs panel)
- Dispatch history log (past dispatches per card)
- Cancel/retry UX improvements
- Dispatch dashboard (all active dispatches across projects)
- Cost tracking per dispatch (token counts from JSON output)

### Phase 3 — Advanced Features

- Remote repo URL cloning (`repoUrl` field, auto-clone on first dispatch)
- Multi-card orchestration (dispatch cards in dependency order)
- Branch protection (auto-merge, merge conflict detection)
- Agent feedback loop (if tasks fail, re-prompt agent with error context)
- Dispatch templates (pre-configured adapter + model + prompt presets)

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DISPATCH_WORKTREE_BASE` | `{os.tmpdir()}/devplanner-dispatch/` | Base directory for creating worktrees |
| `DISPATCH_TIMEOUT_MS` | `1800000` (30 min) | Max time for agent execution before kill |
| `ANTHROPIC_API_KEY` | — | For Claude Code CLI (must be set in host env) |
| `GEMINI_API_KEY` | — | For Gemini CLI (must be set in host env) |

API keys are **never** stored in `_project.json` or `_preferences.json`. They must be set as environment variables on the host where DevPlanner runs.

---

## Error Handling

| Failure Mode | Detection | Recovery |
|-------------|-----------|----------|
| Project has no `repoPath` | Validation on dispatch request | 400 error, prompt user to configure in project settings |
| `repoPath` not a git repo | `git rev-parse` check | 400 error with descriptive message |
| Branch already exists | `git branch --list` check | 409 error — user must delete stale branch or re-dispatch from existing |
| Worktree creation fails | `Bun.spawnSync` exit code | 500 error, no card state change |
| Agent CLI not installed | `Bun.spawn` throws ENOENT | Catch, return 500 with "Claude Code CLI not found — install with `npm i -g @anthropic-ai/claude-code`" |
| Agent process timeout | `setTimeout` fires | Kill process, set card to blocked with "Timed out after N minutes" |
| Agent process crash | Non-zero exit code | Set card to blocked, keep worktree for debugging |
| Agent exits 0 but tasks incomplete | Task check after completion | Set card to 'review' status — needs human attention |
| MCP server unreachable from agent | Agent reports MCP errors | Agent falls back to working without board updates; completion handler checks tasks |
| `gh` CLI not available for auto-PR | `Bun.spawnSync` exit code | Log warning, skip PR creation, dispatch still succeeds |
| Concurrent dispatch on same card | Check `activeDispatches` map | 409 error — one dispatch per card at a time |
| Server restart during active dispatch | In-memory map lost | On startup, scan cards with `dispatchStatus: 'running'` and set to 'failed' with "Server restarted" |

---

## Security Considerations

1. **API keys** — Never persisted in DevPlanner's data files. Always via host environment variables. The dispatch modal does not have fields for API keys.

2. **Path traversal** — `repoPath` is validated as an existing directory with a `.git` folder. Worktree paths are constructed deterministically from project/card slugs (which are already sanitized by `slugify()`). No user-supplied path segments in worktree paths.

3. **Process isolation** — Agent processes run with the same OS user as the DevPlanner server. They have full filesystem access within their worktree and can run arbitrary commands (this is inherent to coding agents). For production environments, consider running DevPlanner + agents in a container with limited filesystem access.

4. **Prompt injection** — Card content is user-authored and included in agent prompts. Since the card author is the same user dispatching the agent, this is not a cross-user trust boundary. However, if cards are created by external systems in the future, sanitization should be added.

5. **MCP server exposure** — The `.mcp.json` written to worktrees points to DevPlanner's MCP server. This gives the agent full read/write access to the DevPlanner workspace. This is intentional — the agent needs to toggle tasks and update cards. The MCP server is scoped to the configured `DEVPLANNER_WORKSPACE`.
