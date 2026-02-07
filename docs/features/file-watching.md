# WebSocket File Watching & Live Reload

## Context

Currently, DevPlanner uses a REST API-only architecture where the frontend fetches data via explicit user actions (page load, card clicks, manual refresh). This creates several limitations:

1. **No multi-client sync**: If two users/tabs are viewing the same project and one makes a change (or an external process modifies workspace files), the other tab won't see updates until manually refreshed
2. **No external file monitoring**: Changes made directly to workspace markdown files (via text editor, git pull, automated scripts) aren't reflected in the UI
3. **Missed development opportunities**: The file-based storage model is perfect for real-time sync, but it's currently untapped

This implementation adds **WebSocket-based file watching** to enable real-time synchronization across all connected clients when workspace files change. Additionally, it introduces a **real-time activity history log** to track changes with timestamps (separate from interrupting notifications).

## Technology Choice: WebSockets

WebSockets were selected over Server-Sent Events (SSE) for several reasons:

1. **Bidirectional communication**: Enables client-to-server subscriptions (clients can subscribe to specific projects)
2. **Future extensibility**: Supports collaborative editing features (coming later)
3. **Structured message protocol**: Better for typed event messages with delta updates
4. **Elysia integration**: Built-in WebSocket support in the existing framework

Both technologies support multi-client broadcasting, but WebSockets provide more flexibility for future features.

## Architecture Overview

```
File System Changes (*.md, _project.json, _order.json)
    |
FileWatcherService (detects changes, parses files)
    |
WebSocketService (broadcasts delta updates to subscribed clients)
    |
Frontend WebSocket Client (receives messages)
    |
Zustand Store (merges delta updates into state)
    |
React UI (re-renders with new data)
```

## WebSocket Message Protocol

### Message Format

All messages follow a structured format:

```typescript
interface WebSocketMessage {
  type: string;           // Event type (e.g., 'card:updated', 'task:toggled')
  timestamp: string;      // ISO 8601 timestamp
  projectSlug?: string;   // Optional project context
  data: any;             // Event-specific payload
}
```

### Event Types

**Connection Events** (Client-to-Server):
- `subscribe` — Subscribe to project updates (payload: `{ projectSlug }`)
- `unsubscribe` — Unsubscribe from project (payload: `{ projectSlug }`)

**Connection Events** (Server-to-Client):
- `connected` — Connection initialized (payload: `{ clientId }`)
- `subscribed` — Subscription confirmed (payload: `{ projectSlug }`)

**Project Events**:
- `project:updated` — Project metadata changed (payload: partial `ProjectConfig`)
- `project:created` — New project created (payload: `ProjectConfig`)
- `project:archived` — Project archived (payload: `{ projectSlug }`)

**Card Events**:
- `card:created` — Card created (payload: `{ slug, lane, card: CardSummary }`)
- `card:updated` — Card content changed (payload: `{ slug, lane, changes: { frontmatter?, content?, tasks? } }`)
- `card:moved` — Card moved between lanes (payload: `{ slug, sourceLane, targetLane, position }`)
- `card:deleted` — Card deleted (payload: `{ slug, lane }`)

**Lane Events**:
- `lane:reordered` — Lane order changed (payload: `{ lane, order: string[] }`)

**Task Events**:
- `task:toggled` — Task checked/unchecked (payload: `{ cardSlug, taskIndex, checked, taskProgress }`)
- `task:added` — Task added (payload: `{ cardSlug, task: TaskItem, taskProgress }`)

**History Events**:
- `history:event` — Activity log entry (payload: `{ action, description, metadata }`)

## File Watching Strategy

### Monitored Files

| File Pattern | Event Produced | Description |
|---|---|---|
| `{project}/{lane}/*.md` | `card:created`, `card:updated`, `card:deleted` | Card content changes |
| `{project}/_project.json` | `project:updated` | Project config changes |
| `{project}/{lane}/_order.json` | `lane:reordered` | Lane ordering changes |

### Implementation Details

- **Engine**: Node.js native `fs.watch` with recursive monitoring
- **File filtering**: Only process `.md`, `_project.json`, `_order.json` — ignore `.tmp`, `.swp`, etc.
- **Debouncing**: 100ms window to handle rapid changes (e.g., editor auto-save writing multiple times)
- **Change detection**: Parse file path structure to determine project slug, lane, and card slug, then read/parse the file to extract delta data
- **Edge cases**: File rename vs delete detection, directory creation/deletion, race conditions between write and read

### Delta Updates

Instead of sending full project state, send only changed data:
- **Card updated**: Only send changed frontmatter fields + content
- **Task toggled**: Send task index + new checked state + updated progress
- **Card moved**: Send source lane + target lane + position
- **Lane reordered**: Send new order array for affected lane only

## Critical Files

### Backend — New Files

| File | Purpose |
|---|---|
| `src/services/websocket.service.ts` | Connection manager, subscription tracking, message broadcasting, heartbeat |
| `src/services/file-watcher.service.ts` | File system monitoring, change detection, debouncing, event broadcasting |
| `src/services/history.service.ts` | In-memory activity log (50 events/project), timestamps, descriptions |
| `src/routes/websocket.ts` | Elysia WebSocket route (`/api/ws`), connection lifecycle, message routing |
| `src/routes/history.ts` | REST endpoint `GET /api/projects/:slug/history` |

### Backend — Modified Files

| File | Changes |
|---|---|
| `src/server.ts` | Initialize FileWatcherService + WebSocketService, register new routes |
| `src/types/index.ts` | Add WebSocket message types, history event types |

### Frontend — New Files

| File | Purpose |
|---|---|
| `frontend/src/services/websocket.service.ts` | WebSocket client wrapper, auto-reconnection, message handler registration |
| `frontend/src/hooks/useWebSocket.ts` | React hook for WebSocket lifecycle, auto-subscribe on project change |
| `frontend/src/components/ActivityLog.tsx` | Real-time activity history display, time-grouped events |

### Frontend — Modified Files

| File | Changes |
|---|---|
| `frontend/src/App.tsx` | Initialize WebSocket, render ActivityLog |
| `frontend/src/store/index.ts` | WebSocket state, delta merge handlers, history state |
| `frontend/src/types/index.ts` | WebSocket message types (mirror backend) |

## Implementation Phases

See [TASKS.md](../TASKS.md) Phases 12-17 for the full task breakdown.

| Phase | Objective | Key Deliverables |
|---|---|---|
| **12: Backend WebSocket Infrastructure** | WebSocket connection handling and message routing | `websocket.service.ts`, `/api/ws` route, heartbeat |
| **13: File Watching Service** | Monitor workspace files and detect changes | `file-watcher.service.ts`, debouncing, change detection |
| **14: Frontend WebSocket Client** | Establish WebSocket from React, handle messages | Client wrapper, `useWebSocket` hook, auto-reconnect |
| **15: Zustand Store Integration** | Merge delta updates into application state | 8 message handlers, delta merge logic, conflict resolution |
| **16: Real-Time Activity History** | Timestamped log of changes (non-interrupting) | `history.service.ts`, `ActivityLog.tsx`, REST + WS endpoints |
| **17: Production Optimization & Testing** | Robustness and performance | Message batching, graceful degradation, unit/integration tests |

## Verification Steps

### Basic Functionality (Phases 12-14)

1. **WebSocket Connection** — Start backend, open browser DevTools WS tab, verify `connected` message with clientId
2. **Project Subscription** — Load a project, verify `subscribe` sent and `subscribed` received
3. **File Change Detection** — Edit a card markdown file in text editor, verify `card:updated` event in WS tab

### Multi-Client Sync (Phase 15)

4. **Two-Tab Test** — Open same project in two tabs, toggle a task in Tab 1, verify Tab 2 updates within 500ms
5. **External File Edit** — Edit card file in VS Code, verify browser UI updates automatically

### Real-Time History (Phase 16)

6. **Activity Log** — Complete a task and move a card, verify events appear in ActivityLog with timestamps

### Reconnection (Phase 17)

7. **Auto-Reconnect** — Stop backend, verify "Disconnected" indicator, restart, verify reconnection within 5s
8. **Graceful Degradation** — Start only frontend, verify app loads with warning and manual refresh works

## Error Handling

### Backend

| Scenario | Strategy |
|---|---|
| File read error during change detection | Log error, skip broadcast, continue watching |
| Invalid project/card path | Log warning, ignore event |
| WebSocket send failure | Log error, mark client for health check |
| File watcher crash | Auto-restart watcher, log critical error |

### Frontend

| Scenario | Strategy |
|---|---|
| Connection failure | Show disconnected indicator, auto-retry with exponential backoff |
| Message parse error | Log error, ignore message |
| Max reconnection attempts (5) | Show manual reconnect button |
| Store update conflict | Prefer server data (server is source of truth) |

## Performance Considerations

1. **Debouncing**: 100ms window to batch rapid file changes
2. **Message batching**: Collect changes within 200ms, send single update
3. **Selective subscriptions**: Only broadcast to clients subscribed to affected project
4. **Delta updates**: Send only changed fields, not full state
5. **History limits**: Max 50 events per project in memory

## Future Enhancements (Out of Scope)

- Collaborative editing with operational transforms
- User presence indicators (who's viewing which cards)
- Conflict resolution UI for merge conflicts
- Offline mode with change queue
- WebSocket-based notifications for @mentions or assignments
