---
title: Agent Board Updates — Keeping DevPlanner in Sync with Dispatched Agents
type: spec
created: 2026-03-28
updated: 2026-03-28
tags: [spec, devplanner, feature, dispatch, mcp, ai-agent, board-updates]
status: draft
---

# Agent Board Updates — Keeping DevPlanner in Sync with Dispatched Agents

> **Companion to:** [card-dispatch.md](./card-dispatch.md)
> The board update mechanism is part of card-dispatch Phase 1 — not a separate implementation phase. This document explains the rationale, tradeoffs, and design decisions behind the approach described there.

## The Problem

When work is handed off to a coding agent running in the background, DevPlanner needs to stay accurate. The agent may complete some tasks but not others, get blocked, or finish everything successfully. Without a sync mechanism, the board falls out of sync with reality the moment the agent starts working.

There are three tiers of solution, from simplest to most capable:

| Tier | Name | When agent updates board | Accuracy | Complexity |
|------|------|--------------------------|----------|------------|
| **1** | Post-completion sweep | After agent exits (all-or-nothing) | Low | Minimal |
| **2** | REST API via DevPlanner skill | During execution via HTTP `curl` | High (per-task) | Low–Medium |
| **3** | Live MCP integration | During execution via native MCP tools | High (per-task, real-time) | Medium |

**Decision: ship Tier 3 as primary + Tier 1 as automatic fallback.** See [Decision](#decision-which-tier-to-ship) below.

---

## Tier 1 — Post-Completion Sweep (Automatic Fallback)

**How it works:**

The dispatch system observes the agent process. When it exits with code 0 (success) and some tasks are still unchecked, the completion handler in `DispatchService.handleCompletion()`:

1. Calls `batch_update_tasks` internally (or `TaskService` directly) to mark all remaining unchecked tasks as complete
2. Calls `CardService.moveCard()` to move the card to `03-complete`
3. Broadcasts `card:dispatch-completed` via WebSocket

No cooperation from the agent is required. The agent doesn't need to know DevPlanner exists.

**When this fires:**

This is a fallback, not the primary mechanism. It triggers when:
- The agent exited cleanly (code 0) but didn't toggle all tasks via MCP
- MCP was unreachable from the agent's environment
- The agent simply didn't follow the MCP instructions

**Limitations:**

- All-or-nothing: skips the per-task real-time progress that MCP provides
- No partial state — if anything goes wrong mid-sweep, the board may show all tasks complete when only some were
- Provides no indication of *which* tasks the agent actually completed vs. which were auto-swept

**Implementation:** Entirely inside `DispatchService.handleCompletion()`. No agent changes required. A single call to `batch_update_tasks` with all unchecked indices.

---

## Tier 2 — REST API via the DevPlanner Skill (Non-MCP Agents)

**How it works:**

The DevPlanner skill (`.claude/skills/devplanner/SKILL.md`) teaches an AI agent how to interact with DevPlanner via the REST API over HTTP. The skill covers toggling tasks, updating card metadata, moving lanes, and attaching vault artifacts.

A dispatched coding agent that has `Bash` tool access can make HTTP requests directly against the live DevPlanner server using `curl`.

**How to wire it up:**

In `PromptService.buildSystemPrompt()`, include a REST fallback block:

```
## DevPlanner Board Updates (REST fallback — use MCP tools if available)

If MCP tools are not available, update the board via HTTP:

  # Toggle a task complete (0-based index):
  curl -X PATCH http://{DEVPLANNER_HOST}:{DEVPLANNER_PORT}/api/projects/{projectSlug}/cards/{cardSlug}/tasks/{index} \
    -H "Content-Type: application/json" \
    -d '{"checked": true}'

  # Mark yourself blocked:
  curl -X PATCH http://{DEVPLANNER_HOST}:{DEVPLANNER_PORT}/api/projects/{projectSlug}/cards/{cardSlug} \
    -H "Content-Type: application/json" \
    -d '{"status": "blocked", "blockedReason": "explanation"}'

  # Move to complete when all tasks are done:
  curl -X PATCH http://{DEVPLANNER_HOST}:{DEVPLANNER_PORT}/api/projects/{projectSlug}/cards/{cardSlug}/move \
    -H "Content-Type: application/json" \
    -d '{"lane": "03-complete"}'
```

**Requirements:**

- DevPlanner must be reachable from the agent's environment (localhost or LAN)
- `DEVPLANNER_HOST` and `DEVPLANNER_PORT` injected into the prompt at build time
- No changes to the DevPlanner server are needed
- The agent's `Bash` tool must not be restricted from making network calls

**Primary use case:** Phase 2 agents that don't support MCP natively (Aider, custom shell wrappers). The REST block is included in the system prompt alongside the MCP instructions — if MCP is available the agent will prefer structured tool calls; if not, it falls back to `curl`.

**Limitations:**

- HTTP calls add noise to the agent's tool-use log
- The agent may skip updates if it gets deep into a long edit chain
- Less reliable than MCP because the update depends on the agent following prose instructions

---

## Tier 3 — Live MCP Integration (Primary Mechanism)

**How it works:**

DevPlanner's MCP server (`src/mcp-server.ts`) exposes 18 tools. The relevant ones for board updates:

| MCP Tool | Purpose |
|----------|---------|
| `get_card` | Read full card: frontmatter, tasks (with 0-based indices), content |
| `toggle_task` | Set a single task checked/unchecked by 0-based index |
| `batch_update_tasks` | Toggle multiple tasks in one call |
| `update_card` | Update status, assignee, priority, blockedReason |
| `move_card` | Move card to a different lane |
| `create_vault_artifact` | Write a doc to the vault and link it to the card |

These are native MCP tool calls — the agent invokes them the same way it calls `Edit` or `Bash`. No HTTP, no curl, no bash scripting.

**How to wire it up (pre-spawn):**

Before spawning the agent, `DispatchService` writes a `.mcp.json` to the worktree root:

```json
{
  "mcpServers": {
    "devplanner": {
      "command": "bun",
      "args": ["/path/to/devplanner/src/mcp-server.ts"],
      "env": {
        "DEVPLANNER_WORKSPACE": "/path/to/devplanner/workspace"
      }
    }
  }
}
```

Claude Code CLI reads `.mcp.json` automatically from the working directory. Gemini CLI reads an equivalent `.gemini/settings.json` — the adapter writes both.

**System prompt MCP instruction block (in `CLAUDE.md`):**

```
## DevPlanner Board Updates

You have access to the DevPlanner MCP server. Use these tools as you work:

- `mcp__devplanner__get_card` — Read the card first to confirm task indices (0-based)
- `mcp__devplanner__toggle_task` — Check off each task immediately when you finish it
- `mcp__devplanner__update_card` — Set status: "blocked" if you get stuck (include blockedReason)
- `mcp__devplanner__move_card` — Move to lane "03-complete" when all tasks are done
- `mcp__devplanner__create_vault_artifact` — Attach a summary doc when you finish

Project: {projectSlug} | Card: {cardSlug}

Toggle tasks in real time — never batch them at the end.
```

**Why this is the right primary approach:**

- Zero HTTP overhead — MCP calls are local subprocess communication (stdio)
- Native to the agent's reasoning loop — same mechanics as calling `Edit` or `Read`
- The board updates in real time via WebSocket broadcasting (MCP tool handlers call `WebSocketService.broadcast()` after each state change — tasks visually check off in the UI as the agent works)
- The agent gets structured responses confirming each update succeeded or identifying the error
- Supports the full DevPlanner workflow: get_card → toggle_task → update_card → move_card → create_vault_artifact

**What exists today:**

All 18 MCP tools are implemented and tested. The MCP server handles `DEVPLANNER_WORKSPACE` env var configuration. The only missing pieces — writing `.mcp.json` to the worktree and including the MCP instruction block in `CLAUDE.md` — are covered in card-dispatch Phase 1 tasks 5–7.

---

## Decision: Which Tier to Ship

### Phase 1 (card-dispatch Phase 1): Tier 3 primary + Tier 1 fallback

**Tier 3 (MCP) is primary.** The incremental work beyond Tier 1 alone is minimal: write `.mcp.json` to the worktree (a few lines in `DispatchService`) and include the MCP instruction block in `PromptService.buildSystemPrompt()`. The payoff — real-time per-task updates visible to the user in the Kanban UI — is significant.

**Tier 1 (post-completion sweep) is the automatic fallback.** `handleCompletion()` always reads the card after the agent exits. If tasks are still unchecked and the exit code was 0, it sweeps them and moves the card. This ensures the board is never left stale even if the agent ignored the MCP instructions entirely.

### Phase 2: Add Tier 2 for non-MCP agents

When Aider or other non-MCP adapters are added, include the REST instruction block in the system prompt alongside the MCP block. The agent will use whichever is applicable. Tier 1 fallback still applies to all adapters.

---

## Relationship to the DevPlanner Agent Skill

The DevPlanner skill (`.claude/skills/devplanner/SKILL.md`) is designed for an interactive Copilot agent working with the user's board via HTTP. It is a **different use case** from dispatch:

| Scenario | Agent type | Protocol | Use case |
|----------|-----------|----------|----------|
| Copilot helping the user manage their board | Interactive Copilot | REST HTTP | `devplanner` skill |
| Dispatched coding agent implementing a card | Headless CLI (Claude Code, Gemini) | MCP stdio | `.mcp.json` wiring |
| Dispatched non-MCP agent | Headless CLI (Aider) | REST HTTP | Tier 2 curl block in prompt |

Both the skill and the MCP server talk to the same underlying `TaskService` — they are equivalent in what they can update. The difference is the transport and how the agent is configured to access DevPlanner.

**Long-term vision:** The MCP server is the canonical DevPlanner integration layer for any agent that supports MCP. The REST API remains available as a fallback. Both expose exactly the same capabilities.

---

## Implementation Mapping

All three tiers are implemented as part of **card-dispatch Phase 1** — no separate implementation phase is needed.

| Board update piece | Phase 1 task |
|-------------------|-------------|
| Write `.mcp.json` to worktree | Task 7 — adapter pre-spawn setup in `claude-cli.adapter.ts` / `gemini-cli.adapter.ts` |
| MCP instruction block in `CLAUDE.md` | Task 5 — `PromptService.buildSystemPrompt()` |
| Tier 1 fallback sweep | Task 9 — `DispatchService.handleCompletion()` |
| REST block for non-MCP agents | Task 5 — `PromptService` (Phase 2 adapters) |

---

## Concise MCP Instruction Block (Reference)

This is the canonical text for the DevPlanner integration section of `CLAUDE.md`. Keep it short — the agent needs to focus on implementation, not board management procedures:

```markdown
## DevPlanner Board Updates

You have access to the DevPlanner MCP server (`mcp__devplanner__*` tools).

1. Call `mcp__devplanner__get_card` first to read current task indices.
2. Call `mcp__devplanner__toggle_task` immediately after finishing each task.
3. Call `mcp__devplanner__update_card` with `status: "blocked"` and a `blockedReason` if you get stuck.
4. Call `mcp__devplanner__move_card` with `lane: "03-complete"` when all tasks are done.
5. Optionally call `mcp__devplanner__create_vault_artifact` to attach a summary.

Project: {projectSlug} | Card: {cardSlug}
Toggle tasks immediately — do not batch them at the session end.
```
