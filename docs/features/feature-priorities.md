---
title: Feature priorities for human-AI collaboration
type: roadmap
created: 2026-02-28
updated: 2026-02-28
tags: [roadmap, devplanner, multi-agent, collaboration, priorities]
project: devplanner
status: active
---

## Context

DevPlanner works well with a single AI agent today. To scale to multiple agents working concurrently — and to keep the human-agent collaboration loop tight — we need targeted improvements that don't overcomplicate the system.

This document prioritizes features across three tiers based on impact, urgency, and implementation complexity. Each tier builds on the previous one.

## Tier 1 — Immediate Value

High-impact features that address current gaps. Each is a focused effort.

### 1. Operation Queue / Concurrency Guard

**Problem**: Only `TaskService` has per-card locks. `CardService`, `ProjectService`, and lane reorder have no locking. Two agents (or an agent and a human) can corrupt `_order.json` or silently overwrite each other's card updates.

**Solution**: Extract the existing `TaskService` lock pattern into a shared `resource-lock.ts` utility. Add per-resource FIFO locks to all write operations across all services. Add `version` field to cards for optimistic locking via `If-Match` header.

**Why now**: This is the single biggest blocker for multi-agent use. Without it, scaling to two agents is unsafe.

**Spec**: [concurrency-operation-queue.md](concurrency-operation-queue.md)

---

### 2. Agent Identity (`X-DevPlanner-Actor` header)

**Problem**: Activity history tracks *what* happened but not *who* did it. When multiple agents or a mix of human and agent are making changes, the activity log can't distinguish between actors.

**Solution**: Accept an optional `X-DevPlanner-Actor` header (or `actor` body field) on all API requests. Persist the value into `HistoryEvent.actor`. The MCP server passes a configured agent name automatically. No authentication system needed — just a voluntary identity string.

**Why now**: Cheap to implement, immediately useful with a single agent ("was this change mine or the agent's?"), and prerequisite for multi-agent visibility.

**Implementation sketch**:
- Add `actor?: string` to `HistoryEvent` type
- Extract actor from request header in route handlers, pass to service methods
- Pass actor through to `HistoryService.record()`
- Display actor in the activity log UI (badge or label next to event description)
- MCP server: read agent name from env var `DEVPLANNER_AGENT_NAME` (default: `"agent"`)

---

### 3. WebSocket Smart Merge

**Problem**: When an agent updates a card that the human has open for editing, the WebSocket `card:updated` event replaces the entire card in the store. The edit form resets and the human's in-progress work is lost.

**Solution**: Track which fields are actively being edited in the Zustand store (`isEditingTitle`, `isEditingContent`, `isEditingMetadata`). When a WebSocket `card:updated` event arrives, merge only non-edited fields. When the user saves, their version takes precedence.

**Why now**: This is a direct pain point in the current single-agent workflow. Every time the agent updates a card you're looking at, you lose your place.

**Spec**: [websocket-smart-merge.md](websocket-smart-merge.md)

---

### 4. History Persistence

**Problem**: Activity history is in-memory only (50 events per project, lost on server restart). There's no durable audit trail.

**Solution**: Persist history events to `_history.json` per project using a write queue (batch writes to avoid file lock contention during rapid successive updates). Implement rolling rotation to keep the file manageable (last 200 events, archive older).

**Why now**: Essential for any serious use. Server restarts lose all context about what happened. Agents that reconnect after a restart have no history to work with.

**Related tasks**: Already outlined in [TASKS.md](../TASKS.md) under "History Persistence & Performance".

---

## Tier 2 — Near-Term

Features that extend existing patterns. Build these once Tier 1 is stable.

### 5. Optimistic Locking (ETag/version)

**Problem**: Even with mutex locks, the "two agents read the same card, think about it, both try to update" pattern isn't handled. The second write silently overwrites the first.

**Solution**: The `version` field from the concurrency guard (Tier 1, feature 1) enables this. Agents include `If-Match: <version>` on updates. On mismatch, the API returns 409 with the current card state so the caller can re-read and retry.

**Why now**: Natural extension of the concurrency guard. Most of the infrastructure (version field, If-Match parsing) is built in feature 1.

---

### 6. MCP `claim_card` / `release_card` Tools

**Problem**: Agents set `assignee: 'agent'` to claim work, but nothing prevents two agents from claiming the same card simultaneously. There's no atomic check-and-set.

**Solution**: Add `claim_card` MCP tool that atomically checks if the card is unclaimed, sets the assignee to the requesting agent's identity, and records the claim in history. Add `release_card` to unclaim. Return an error if already claimed by a different agent.

**Why now**: Essential for multi-agent coordination. Without atomic claiming, two agents can start working on the same card.

**Implementation sketch**:
- `claim_card(projectSlug, cardSlug)` → acquire card lock, check assignee, set assignee + record history, release lock
- `release_card(projectSlug, cardSlug)` → acquire card lock, clear assignee, release lock
- Use agent identity from `X-DevPlanner-Actor` / `DEVPLANNER_AGENT_NAME`
- Error: `CARD_ALREADY_CLAIMED` with current assignee in the message

---

### 7. Sub-task Support (Nested Checklists)

**Problem**: Complex cards need hierarchical task breakdown. Agents naturally decompose work into sub-steps, but the current flat checklist doesn't support nesting.

**Solution**: Support indented markdown checkboxes (`  - [ ]` for level 2, `    - [ ]` for level 3). Extend `MarkdownService` to parse indent levels. UI supports tab/shift-tab for indenting. Task progress counts all levels.

**Why now**: Frequently needed for real development work where a card represents a feature with multiple components, each having their own subtasks.

---

### 8. Dashboard View (Project Health)

**Problem**: When multiple agents are working, the human needs a "control tower" view — not just the Kanban board, but metrics at a glance.

**Solution**: New frontend route (`/dashboard`) that renders project stats (WIP count, backlog depth, blocked count, completion velocity) as metric cards. The `/api/projects/:slug/stats` endpoint already computes all of this. This is purely a frontend feature.

**Why now**: The data already exists. This is a relatively small frontend effort with high visibility value.

---

## Tier 3 — Longer-Term

Features to build when multi-agent workflows are actively in use and patterns are validated.

### 9. Multi-Agent Session Registry

When multiple agents are connected, the system should know who is active. A lightweight in-memory registry (agent name, connected since, current card, last action) exposed via `GET /api/agents` lets the dashboard show "Agent A is working on card X, Agent B is idle."

Builds on: Agent Identity (Tier 1), Dashboard View (Tier 2).

### 10. Conflict Resolution UI

When optimistic locking produces a 409, the human needs a way to see both versions and choose. A diff view in the card detail panel showing "your version" vs "incoming version" with accept/reject per field.

Builds on: Optimistic Locking (Tier 2).

### 11. Card Templates

Store reusable card structures (bug report, feature card, research spike) as `.md` files in a `_templates/` directory. Expose via API and MCP so agents can create cards from templates. Reduces boilerplate and enforces consistent structure.

### 12. Webhook / Event Sink

Beyond WebSocket (which requires a persistent connection), support POSTing events to a configured URL. External systems (CI, Slack, custom dashboards) can react to DevPlanner changes without maintaining a WebSocket client.

---

## Dependency graph

```
Tier 1 (build now)
├── 1. Concurrency Guard ─────────┐
├── 2. Agent Identity ────────────┤
├── 3. WebSocket Smart Merge      │
└── 4. History Persistence        │
                                  │
Tier 2 (build next)              │
├── 5. Optimistic Locking ────────┘ (extends version field from #1)
├── 6. claim_card / release_card ── (uses locks from #1 + identity from #2)
├── 7. Sub-task Support
└── 8. Dashboard View

Tier 3 (build later)
├── 9. Agent Session Registry ──── (uses identity from #2 + dashboard from #8)
├── 10. Conflict Resolution UI ─── (uses optimistic locking from #5)
├── 11. Card Templates
└── 12. Webhook / Event Sink
```

## Guiding principles

- **Don't add a database.** File-based storage is a feature, not a limitation. Agents and humans can both read/write cards directly. Keep it that way.
- **Don't add authentication.** Voluntary identity strings are sufficient for a local/team tool. Auth adds complexity without proportional value at this scale.
- **Don't over-abstract.** Each feature should be a focused addition. Avoid building generic frameworks when a specific solution works.
- **Build for the current architecture.** Single-process, in-memory locks, file I/O. When (if) we need multi-node, that's a different conversation.
- **Prioritize the human-agent loop.** Every feature should make it easier for a human and one or more agents to collaborate on building software. If it doesn't serve that goal, it can wait.
