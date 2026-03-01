---
title: Concurrency guard and operation queue
type: spec
created: 2026-02-28
updated: 2026-02-28
tags: [spec, devplanner, concurrency, locking, multi-agent, queue]
project: devplanner
status: draft
sources: []
related:
  - docs/TASKS.md (History Persistence & Performance, Multi-Agent Support)
owner: scribe
---

## Goal

Make DevPlanner safe for concurrent access by multiple agents and humans without introducing a database, distributed locking, or heavy middleware. Operations that touch shared files (`_order.json`, card `.md` files, `_project.json`) must be serialized per resource so that two writers never corrupt the same file.

## Scope

- **In scope**: Per-resource mutex locks across all services, FIFO operation queue, optimistic locking via `version` field and `If-Match` header, lock timeout with clear error responses, deadlock prevention.
- **Out of scope**: Distributed locking across processes or nodes, CRDT-based field-level merging, authentication/authorization, multi-node deployment, undo/redo.

## Current state analysis

### Where locking exists today

Only `TaskService` has per-card mutex locks (see `src/services/task.service.ts:12-39`). The pattern uses a `Map<string, Promise<void>>` keyed by `${projectSlug}:${cardSlug}`. All task mutations (add, toggle, update, delete) acquire the lock before reading the card file, perform changes, write the file, then release the lock in a `finally` block.

### Where locking is missing

| Service | Method | Shared resource | Risk |
|---------|--------|----------------|------|
| `CardService` | `createCard` | `_order.json` in target lane | Two concurrent creates append to `_order.json` — one write overwrites the other |
| `CardService` | `updateCard` | Card `.md` file | Two updates read the same frontmatter, both write back — first update lost |
| `CardService` | `moveCard` | Source and target `_order.json` + card file | Move involves reading two order files, renaming the card file, writing both orders — partial failure corrupts state |
| `CardService` | `archiveCard` | Same as `moveCard` | Same risks as move (archive is a lane move) |
| `CardService` | `reorderCards` | `_order.json` in lane | Concurrent reorder + create/move = lost order entries |
| `ProjectService` | `updateProject` | `_project.json` | Concurrent project config updates overwrite each other |
| `LinkService` | All mutations | Card `.md` file (frontmatter) | Same as card update — link changes read/write full frontmatter |

### Specific race conditions

**Race 1: Concurrent card moves to same lane**
1. Agent A calls `moveCard(card-x, lane-02)` — reads `_order.json` for lane-02: `["card-a", "card-b"]`
2. Agent B calls `moveCard(card-y, lane-02)` — reads same `_order.json`: `["card-a", "card-b"]`
3. Agent A writes: `["card-a", "card-b", "card-x"]`
4. Agent B writes: `["card-a", "card-b", "card-y"]` — **card-x is lost from the order**

**Race 2: Card create during lane reorder**
1. User drags to reorder lane-01 — reads `_order.json`: `["card-a", "card-b", "card-c"]`
2. Agent creates new card in lane-01 — reads same `_order.json`, appends `"new-card"`, writes: `["card-a", "card-b", "card-c", "new-card"]`
3. User's reorder writes: `["card-c", "card-a", "card-b"]` — **new-card vanishes from the order**

**Race 3: Concurrent frontmatter updates**
1. Agent A reads card, sees `priority: "medium"`, changes to `priority: "high"`, writes back
2. Agent B reads card (before A's write), sees `priority: "medium"`, changes `assignee: "agent-b"`, writes back
3. Agent B's write replaces A's — **priority stays "medium", A's change is silently lost**

## Architecture decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Lock granularity | Per-card and per-lane-order | Card file operations are the hotspot. Lane order locks cover `_order.json` writes. Project config changes are rare enough to lock per-project. |
| Lock implementation | In-memory `Map<string, Promise<void>>` with FIFO queuing | Single-process architecture means no external dependencies. Already proven in `TaskService`. |
| Queue pattern | FIFO queue per resource key with automatic drain | Prevents starvation. Operations wait in arrival order rather than spin-looping. More predictable under load than the current while-loop spin. |
| Optimistic locking | `version` field in card frontmatter + `If-Match` header | Standard HTTP pattern. Allows clients to detect stale reads without holding locks during user think-time. Backward compatible — omitting the header skips the check. |
| Deadlock prevention | Sorted key acquisition order | Multi-lock operations (e.g., `moveCard` needs source lane + target lane + card locks) always acquire locks in alphabetical key order. |
| Lock timeout | 5 seconds | Prevents indefinite blocking if a lock holder crashes. Long enough for any normal file I/O. |
| Lock scope for multi-step operations | Acquire all locks, perform all steps, release all | Card move involves reading source lane order, reading target lane order, renaming file, writing both orders. All must be atomic. |

## Implementation plan

### Step 1: Extract shared resource lock utility

Create `src/utils/resource-lock.ts` — a singleton that provides per-resource-key FIFO locking.

```typescript
// src/utils/resource-lock.ts

class ResourceLock {
  private queues: Map<string, Array<() => void>> = new Map();
  private held: Set<string> = new Set();

  /**
   * Acquire an exclusive lock on a resource key.
   * If the lock is held, the caller is queued and resolved in FIFO order.
   * Returns a release function that MUST be called in a finally block.
   *
   * @param key - Resource identifier (e.g., "my-project:my-card" or "my-project:01-upcoming:order")
   * @param timeoutMs - Maximum wait time before throwing (default 5000)
   */
  async acquire(key: string, timeoutMs = 5000): Promise<() => void> {
    if (!this.held.has(key)) {
      this.held.add(key);
      return () => this.release(key);
    }

    // Queue the caller
    return new Promise<() => void>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue on timeout
        const queue = this.queues.get(key);
        if (queue) {
          const idx = queue.indexOf(grant);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) this.queues.delete(key);
        }
        reject(new ResourceBusyError(key));
      }, timeoutMs);

      const grant = () => {
        clearTimeout(timer);
        this.held.add(key);
        resolve(() => this.release(key));
      };

      if (!this.queues.has(key)) this.queues.set(key, []);
      this.queues.get(key)!.push(grant);
    });
  }

  /**
   * Acquire multiple locks in sorted key order to prevent deadlocks.
   * Returns a single release function that frees all locks.
   */
  async acquireMultiple(keys: string[], timeoutMs = 5000): Promise<() => void> {
    const sorted = [...new Set(keys)].sort();
    const releases: Array<() => void> = [];

    try {
      for (const key of sorted) {
        releases.push(await this.acquire(key, timeoutMs));
      }
    } catch (err) {
      // Release any locks acquired before the failure
      releases.forEach((r) => r());
      throw err;
    }

    return () => releases.forEach((r) => r());
  }

  private release(key: string): void {
    this.held.delete(key);
    const queue = this.queues.get(key);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) this.queues.delete(key);
      next(); // Grant the lock to the next waiter
    }
  }
}

export class ResourceBusyError extends Error {
  public readonly resourceKey: string;
  public readonly retryAfterMs = 1000;

  constructor(key: string) {
    super(`Resource "${key}" is busy. Another operation is in progress.`);
    this.name = 'ResourceBusyError';
    this.resourceKey = key;
  }
}

// Singleton — all services share the same lock registry
export const resourceLock = new ResourceLock();
```

### Step 2: Define resource key conventions

| Resource | Key pattern | Example |
|----------|-------------|---------|
| Card file | `${projectSlug}:card:${cardSlug}` | `my-project:card:add-login-page` |
| Lane order | `${projectSlug}:order:${laneDir}` | `my-project:order:01-upcoming` |
| Project config | `${projectSlug}:config` | `my-project:config` |

### Step 3: Add locks to CardService

```typescript
// In card.service.ts — example for updateCard

async updateCard(projectSlug: string, cardSlug: string, updates: Partial<CardFrontmatter>): Promise<Card> {
  const release = await resourceLock.acquire(`${projectSlug}:card:${cardSlug}`);
  try {
    // existing read-modify-write logic
    // bump version before writing
    const currentVersion = frontmatter.version ?? 0;
    frontmatter.version = currentVersion + 1;
    // ... write file
  } finally {
    release();
  }
}

// moveCard needs multiple locks
async moveCard(projectSlug: string, cardSlug: string, targetLane: string): Promise<Card> {
  const sourceLane = await this.findCardLane(projectSlug, cardSlug);
  const release = await resourceLock.acquireMultiple([
    `${projectSlug}:card:${cardSlug}`,
    `${projectSlug}:order:${sourceLane}`,
    `${projectSlug}:order:${targetLane}`,
  ]);
  try {
    // existing move logic (read both orders, rename file, write both orders)
  } finally {
    release();
  }
}
```

### Step 4: Add locks to LinkService

Link mutations read/write the same card `.md` file as card updates. Use the same `${projectSlug}:card:${cardSlug}` key.

### Step 5: Add locks to ProjectService

```typescript
async updateProject(slug: string, updates: Partial<ProjectConfig>): Promise<Project> {
  const release = await resourceLock.acquire(`${slug}:config`);
  try {
    // existing read-modify-write of _project.json
  } finally {
    release();
  }
}
```

### Step 6: Refactor TaskService

Replace the private `locks` Map and `acquireLock` method with calls to the shared `resourceLock.acquire()`. The key format `${projectSlug}:card:${cardSlug}` means task operations and card updates are properly serialized against each other (which they should be, since they write to the same `.md` file).

### Step 7: Add version field for optimistic locking

Add `version?: number` to `CardFrontmatter` in `src/types/index.ts`. Default to `1` when creating a new card. Increment on every write (in `CardService.updateCard`, `moveCard`, `TaskService.*`, `LinkService.*`).

### Step 8: Support If-Match header in routes

In `src/routes/cards.ts` (PATCH endpoint) and `src/routes/links.ts`:

```typescript
// Extract version from If-Match header
const ifMatch = request.headers.get('if-match');
if (ifMatch) {
  const expectedVersion = parseInt(ifMatch, 10);
  const currentCard = await cardService.getCard(projectSlug, cardSlug);
  if (currentCard.version !== expectedVersion) {
    return new Response(JSON.stringify({
      error: 'VERSION_CONFLICT',
      message: `Card has been modified since you last read it (your version: ${expectedVersion}, current: ${currentCard.version}).`,
      currentVersion: currentCard.version,
      yourVersion: expectedVersion,
      currentState: currentCard,
    }), { status: 409 });
  }
}
```

### Step 9: Handle ResourceBusyError in error handler

In `src/server.ts`, add a catch for `ResourceBusyError`:

```typescript
if (error instanceof ResourceBusyError) {
  return new Response(JSON.stringify({
    error: 'RESOURCE_BUSY',
    message: error.message,
    retryAfterMs: error.retryAfterMs,
  }), {
    status: 503,
    headers: { 'Retry-After': '1' },
  });
}
```

## API contract changes

### New response field

All card responses include `version: number` (integer, starts at 1, incremented on every write).

### New request header

`If-Match: <version>` (optional) on:
- `PATCH /api/projects/:slug/cards/:cardSlug` (update card)
- `PATCH /api/projects/:slug/cards/:cardSlug/move` (move card)
- `POST /api/projects/:slug/cards/:cardSlug/links` (add link)
- `PATCH /api/projects/:slug/cards/:cardSlug/links/:linkId` (update link)
- `DELETE /api/projects/:slug/cards/:cardSlug/links/:linkId` (delete link)

If the header is absent, the operation proceeds without version checking (backward compatible).

### New error responses

**409 Conflict — Version mismatch**
```json
{
  "error": "VERSION_CONFLICT",
  "message": "Card has been modified since you last read it (your version: 3, current: 5).",
  "currentVersion": 5,
  "yourVersion": 3,
  "currentState": { /* full card object */ }
}
```

**503 Service Unavailable — Lock timeout**
```json
{
  "error": "RESOURCE_BUSY",
  "message": "Resource \"my-project:card:login-page\" is busy. Another operation is in progress.",
  "retryAfterMs": 1000
}
```

## MCP implications

- MCP tool handlers should pass the `If-Match` header when the tool schema includes a `version` parameter. This is optional — omitting version falls back to last-write-wins.
- The `RESOURCE_BUSY` error should be surfaced to the agent with a suggestion to retry. The existing MCP error handler in `src/mcp/errors.ts` can map this to an LLM-friendly message.
- Consider adding a `version` field to MCP tool responses so agents can track versions across operations.

## WebSocket implications

No changes needed. WebSocket broadcasts fire after operations complete (after locks are released). The lock ensures only one broadcast fires per logical operation, so clients see consistent state.

## Testing plan

### Unit tests for `resource-lock.ts`

- Acquire and release a single lock
- Two concurrent acquires on the same key — second waits, runs after first releases
- FIFO ordering — three waiters are granted in arrival order
- Timeout — waiter that exceeds timeout receives `ResourceBusyError`
- `acquireMultiple` — locks are acquired in sorted order regardless of input order
- `acquireMultiple` — if second lock fails, first lock is released (rollback)
- Release is idempotent — double-release does not corrupt state
- Different keys are independent — locking key A does not block key B

### Integration tests

- Fire 10 concurrent `updateCard` calls on the same card — verify all updates are applied (no lost writes)
- Fire 5 concurrent `moveCard` calls to the same target lane — verify `_order.json` contains all 5 cards
- Fire concurrent `createCard` + `reorderCards` on same lane — verify new card is present in final order
- Verify `If-Match` with correct version succeeds; with stale version returns 409 with current state
- Verify `ResourceBusyError` returns 503 with `Retry-After` header

## Acceptance criteria

- [ ] Two concurrent `moveCard` calls to the same lane produce correct `_order.json` with both cards present.
- [ ] Two concurrent `updateCard` calls to the same card both succeed sequentially (no data loss).
- [ ] Two concurrent `createCard` calls in the same lane both appear in `_order.json`.
- [ ] `If-Match` header with stale version returns 409 with the current card state.
- [ ] `If-Match` header with correct version allows the update to proceed.
- [ ] Operations blocked longer than 5 seconds return 503 `RESOURCE_BUSY` with `retryAfterMs`.
- [ ] Locking adds less than 100ms latency to uncontested operations.
- [ ] `TaskService` uses the shared `resourceLock` instead of its private lock Map.
- [ ] All existing tests continue to pass without modification.
- [ ] `acquireMultiple` acquires locks in sorted key order (deadlock prevention verified by test).

## Migration notes

- The `version` field is optional in frontmatter. Existing cards without it default to version `1` on first read. The field is written on the next update.
- No data migration needed — the feature is additive.
- The `If-Match` header is optional — existing clients and MCP tools continue to work without changes.
- The shared `resourceLock` singleton is created on import — no initialization step required.
