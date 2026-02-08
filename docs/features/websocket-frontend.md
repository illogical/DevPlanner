# Frontend WebSocket Client & Store Integration (Phases 14-15)

**Status:** Not Started
**Dependencies:** Phase 12 (WebSocket Infrastructure), Phase 13 (File Watching), Phase 11.5 (Visual Indicators)
**Completes:** Real-time sync pipeline — external file changes appear in the UI instantly with animations

---

## Overview

Phases 14 and 15 complete the real-time synchronization pipeline by connecting the frontend to the backend WebSocket server. Once implemented:

1. **External file edits** (AI agents, text editors, CLI tools) trigger filesystem events
2. **File watcher** detects changes, parses the affected files, and broadcasts WebSocket events
3. **Frontend WebSocket client** receives events and routes them to handlers
4. **Zustand store handlers** merge delta updates into state, triggering re-renders and visual animations

The visual indicator system (Phase 11.5) and activity history (Phase 16) are already wired to store actions. These phases simply connect the missing link: **WebSocket events → store actions**.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  External Change (AI agent, text editor, CLI)                    │
│  └─ Writes to workspace/*.md / _order.json / _project.json     │
└──────────────────────────┬───────────────────────────────────────┘
                           │ fs.watch
┌──────────────────────────▼───────────────────────────────────────┐
│  FileWatcherService (100ms debounce)                             │
│  └─ Parses file → determines event type → builds payload        │
│  └─ Records HistoryEvent                                         │
└──────────────────────────┬───────────────────────────────────────┘
                           │ broadcast()
┌──────────────────────────▼───────────────────────────────────────┐
│  WebSocketService (backend)                                      │
│  └─ Routes to all clients subscribed to the affected project     │
└──────────────────────────┬───────────────────────────────────────┘
                           │ WebSocket message
┌──────────────────────────▼───────────────────────────────────────┐
│  WebSocketClient (Phase 14) ← NEW                                │
│  └─ Receives message, parses JSON                                │
│  └─ Routes to registered handlers by event type                  │
│  └─ Auto-reconnects on disconnect (exponential backoff)          │
└──────────────────────────┬───────────────────────────────────────┘
                           │ handler callback
┌──────────────────────────▼───────────────────────────────────────┐
│  Zustand Store Handlers (Phase 15) ← NEW                         │
│  └─ Merges delta data into store state                           │
│  └─ Triggers change indicators → visual animations (Phase 11.5)  │
│  └─ Appends history events → activity panel (Phase 16)           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 14: Frontend WebSocket Client

### 14.1 WebSocket Client Service

**File:** `frontend/src/services/websocket.service.ts`

A standalone WebSocket client wrapper (no React dependency) that provides:

```typescript
class WebSocketClient {
  private ws: WebSocket | null;
  private handlers: Map<string, Set<(data: unknown) => void>>;
  private reconnectAttempts: number;
  private maxReconnectAttempts: number;  // 5
  private subscribedProject: string | null;

  constructor(url: string);

  // Connection lifecycle
  connect(): void;
  disconnect(): void;

  // Project subscription
  subscribe(projectSlug: string): void;
  unsubscribe(projectSlug: string): void;

  // Event handler registration
  on(eventType: string, handler: (data: unknown) => void): () => void;  // returns unsubscribe fn
  off(eventType: string, handler: (data: unknown) => void): void;

  // State
  isConnected(): boolean;
  getState(): 'connected' | 'disconnected' | 'reconnecting';
}
```

**Key behaviors:**

- **Message routing:** When a `type: 'event'` message arrives, extract `event.type` and call all registered handlers for that event type
- **Heartbeat response:** When a `type: 'ping'` message arrives, immediately respond with `{ type: 'pong' }`
- **Subscription confirmation:** When `subscribed`/`unsubscribed` messages arrive, log for debugging
- **Error handling:** When `type: 'error'` arrives, log the error message
- **Connection state:** Track current state and notify listeners on state changes

**WebSocket URL construction:**

```typescript
function getWebSocketUrl(): string {
  // In development, Vite proxies /api but not WebSocket by default
  // Use the same host but with ws:// protocol
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  // In dev mode, connect directly to backend port
  if (import.meta.env.DEV) {
    return 'ws://localhost:17103/api/ws';
  }

  // In production, use same host
  return `${protocol}//${window.location.host}/api/ws`;
}
```

### 14.2 Auto-Reconnection with Exponential Backoff

When the WebSocket connection closes unexpectedly (not from a manual `disconnect()` call):

1. Set state to `'reconnecting'`
2. Wait `delay` milliseconds, then attempt to reconnect
3. On success: reset attempt counter, re-subscribe to the current project, set state to `'connected'`
4. On failure: increment attempt counter, increase delay

**Backoff schedule:**

| Attempt | Delay  |
|---------|--------|
| 1       | 1s     |
| 2       | 2s     |
| 3       | 4s     |
| 4       | 8s     |
| 5       | 16s    |

After 5 failed attempts, stop reconnecting and set state to `'disconnected'`. The UI will show a "connection lost" indicator, and the user can manually trigger a reconnect.

**Reset behavior:**
- On successful reconnect: reset attempt counter to 0
- Re-subscribe to the project that was active before disconnect
- Emit a `'reconnected'` pseudo-event so handlers can refresh stale data

### 14.3 React Hook: `useWebSocket`

**File:** `frontend/src/hooks/useWebSocket.ts`

```typescript
function useWebSocket(): {
  connectionState: 'connected' | 'disconnected' | 'reconnecting';
  reconnect: () => void;
}
```

**Responsibilities:**

1. **Create client singleton** on first mount (or use module-level singleton)
2. **Connect on mount**, disconnect on unmount (of the root component using it)
3. **Subscribe to active project** when `activeProjectSlug` changes in the store
4. **Unsubscribe from old project** before subscribing to new one
5. **Register all event handlers** that route to Zustand store actions (Phase 15)
6. **Track connection state** and expose it for UI indicators
7. **On reconnect**: call `loadCards()` and `loadHistory()` to refresh potentially stale data

**Project switching flow:**

```
User selects project "media-manager"
  → useWebSocket detects activeProjectSlug changed
  → Sends: { type: 'unsubscribe', projectSlug: 'old-project' }
  → Sends: { type: 'subscribe', projectSlug: 'media-manager' }
  → Receives: { type: 'subscribed', projectSlug: 'media-manager' }
```

### 14.4 Frontend WebSocket Message Types

**File:** `frontend/src/types/index.ts`

Mirror the backend types for type-safe message handling:

```typescript
// Server → Client messages
interface WebSocketMessage {
  type: 'event' | 'error' | 'ping' | 'subscribed' | 'unsubscribed';
  projectSlug?: string;
  event?: WebSocketEvent;
  error?: string;
}

interface WebSocketEvent {
  type: WebSocketEventType;
  projectSlug: string;
  timestamp: string;
  data: unknown;
}

type WebSocketEventType =
  | 'card:created'
  | 'card:updated'
  | 'card:moved'
  | 'card:deleted'
  | 'task:toggled'
  | 'lane:reordered'
  | 'project:updated'
  | 'history:event';

// Typed event data payloads
interface CardCreatedData {
  slug: string;
  lane: string;
  card: CardSummary;
}

interface CardUpdatedData {
  slug: string;
  lane: string;
  card: CardSummary;
}

interface CardMovedData {
  slug: string;
  sourceLane: string;
  targetLane: string;
}

interface CardDeletedData {
  slug: string;
  lane: string;
}

interface TaskToggledData {
  slug: string;
  lane: string;
  card: CardSummary;
}

interface LaneReorderedData {
  lane: string;
  order: string[];
}

interface ProjectUpdatedData {
  config: ProjectConfig;
}
```

### 14.5 App.tsx Integration

Initialize the WebSocket hook at the app root level:

```typescript
function App() {
  const { connectionState } = useWebSocket();
  // ... rest of app
}
```

The hook handles all lifecycle — no additional wiring needed in App.tsx beyond calling the hook and passing connection state to the indicator.

### 14.6 Connection State Indicator

**File:** `frontend/src/components/ui/ConnectionIndicator.tsx`

A small indicator in the header showing WebSocket connection status:

| State | Visual |
|-------|--------|
| Connected | Small green dot (hidden after 3s) |
| Reconnecting | Amber pulsing dot + "Reconnecting..." tooltip |
| Disconnected | Red dot + "Connection lost" tooltip + click to retry |

**Design:**
- Placed in the header, near the activity toggle button
- Minimal footprint — just a colored dot with tooltip
- Connected state auto-hides after 3 seconds to reduce visual noise
- Disconnected state persists until connection is restored or user retries

### 14.7 Testing

**Manual test checklist:**
- [ ] WebSocket connects on app load
- [ ] Subscribes to active project
- [ ] Switches subscription when project changes
- [ ] Responds to server pings (check backend logs)
- [ ] Reconnects after server restart (check backoff timing)
- [ ] Shows connection state in UI
- [ ] "Click to retry" works when disconnected
- [ ] Refreshes data after reconnection

---

## Phase 15: Zustand Store Integration (Delta Updates)

### Design Philosophy

**Delta updates, not full refreshes.** When a WebSocket event arrives, we merge only the changed data into the existing store state. This is faster, preserves scroll position, and triggers minimal re-renders.

**Idempotent handlers.** Merging the same data twice should produce the same result. This matters because local actions (API calls) and their corresponding WebSocket events can both update the store.

### Self-Echo Deduplication

When the current user performs an action (e.g., creates a card):

1. **API call** updates the store immediately (optimistic update + change indicator)
2. **File watcher** detects the file change and broadcasts a WebSocket event
3. **This client** receives the event for its own action (self-echo)

Without deduplication, the user would see double animations. Strategy:

```typescript
// In Zustand store
interface DevPlannerStore {
  // Track recent local actions to suppress duplicate WebSocket animations
  _recentLocalActions: Map<string, number>;  // key → timestamp
  _recordLocalAction(key: string): void;
  _isRecentLocalAction(key: string): boolean;
}
```

**Key generation:** `${eventType}:${cardSlug}` (e.g., `card:created:my-card`)

**Timing window:** 3 seconds. If a WebSocket event matches a recent local action within 3 seconds, merge the data but skip the change indicator.

**Cleanup:** Remove entries older than 5 seconds on each check (lightweight, no timer needed).

### 15.1 WebSocket State in Store

Add connection tracking to the Zustand store:

```typescript
interface DevPlannerStore {
  // WebSocket connection state
  wsConnected: boolean;
  wsReconnecting: boolean;
  setWsConnected(connected: boolean): void;
  setWsReconnecting(reconnecting: boolean): void;
}
```

### 15.2 handleCardUpdated

**Trigger:** `card:updated` WebSocket event
**Payload:** `{ slug, lane, card: CardSummary }`

```
1. Find the card in cardsByLane[lane]
2. If found: replace the CardSummary with the new data
3. If not found: insert it (may have been created while we weren't watching)
4. If activeCard?.slug matches: reload the full card detail from API
   (CardSummary doesn't have full content, so we fetch it fresh)
5. If not a recent local action: add 'card:updated' change indicator
```

**Edge case:** If the card moved lanes between our last state and this update, it won't be in the expected lane. The handler should search all lanes as a fallback.

### 15.3 handleCardCreated

**Trigger:** `card:created` WebSocket event
**Payload:** `{ slug, lane, card: CardSummary }`

```
1. Check if card already exists in cardsByLane[lane] (dedup)
2. If not present: prepend to cardsByLane[lane] (newest first)
3. If not a recent local action: add 'card:created' change indicator
```

### 15.4 handleCardMoved

**Trigger:** `card:moved` WebSocket event
**Payload:** `{ slug, sourceLane, targetLane }`

```
1. Find and remove card from cardsByLane[sourceLane]
2. If card data found: insert into cardsByLane[targetLane]
3. If card data NOT found: fetch from API (race condition recovery)
4. If activeCard?.slug matches: update the lane display in the detail panel
5. If not a recent local action: add 'card:moved' change indicator
6. Reload _order.json for both lanes (fetch cards API with lane filter)
```

**Note:** The `card:moved` event from the file watcher doesn't include the full card data (just slugs and lanes). The handler reuses the card data from the source lane. If the card data isn't found (rare race condition), it falls back to an API fetch.

### 15.5 handleCardDeleted

**Trigger:** `card:deleted` WebSocket event
**Payload:** `{ slug, lane }`

```
1. Remove card from cardsByLane[lane]
2. If activeCard?.slug matches: close the detail panel
3. No change indicator needed (card is gone)
```

### 15.6 handleTaskToggled

**Trigger:** `card:updated` event where task state changed (file watcher emits `card:updated` for task changes)
**Payload:** `{ slug, lane, card: CardSummary }` (includes updated `taskProgress`)

The frontend doesn't receive a separate `task:toggled` WebSocket event from the file watcher — task changes come through as `card:updated`. However, by comparing the old and new `taskProgress`, we can detect task toggles and trigger the appropriate animation:

```
1. Find old card in cardsByLane[lane]
2. Compare old.taskProgress with new.taskProgress
3. Replace card data with new CardSummary
4. If taskProgress changed AND not a recent local action:
   - Add 'task:toggled' change indicator
5. If activeCard?.slug matches: reload full card detail from API
```

### 15.7 handleLaneReordered

**Trigger:** `lane:reordered` WebSocket event
**Payload:** `{ lane, order: string[] }`

```
1. Get current cards for the lane from cardsByLane[lane]
2. Sort cards according to the new order array
3. Replace cardsByLane[lane] with reordered array
```

### 15.8 handleProjectUpdated

**Trigger:** `project:updated` WebSocket event
**Payload:** `{ config: ProjectConfig }`

```
1. Find project in projects[] by slug
2. Merge updated fields into existing project
3. If activeProjectSlug matches: update any derived state
```

### 15.9 Wire Handlers to useWebSocket

In `useWebSocket.ts`, register all handlers during setup:

```typescript
useEffect(() => {
  if (!client) return;

  const unsubscribers = [
    client.on('card:created', (data) => handleCardCreated(data as CardCreatedData)),
    client.on('card:updated', (data) => handleCardUpdated(data as CardUpdatedData)),
    client.on('card:moved', (data) => handleCardMoved(data as CardMovedData)),
    client.on('card:deleted', (data) => handleCardDeleted(data as CardDeletedData)),
    client.on('lane:reordered', (data) => handleLaneReordered(data as LaneReorderedData)),
    client.on('project:updated', (data) => handleProjectUpdated(data as ProjectUpdatedData)),
    client.on('history:event', (data) => store.addHistoryEvent(data as HistoryEvent)),
  ];

  return () => unsubscribers.forEach(unsub => unsub());
}, [client]);
```

### 15.10 End-to-End Testing

**Test scenario 1: External card edit**
1. Open DevPlanner in browser, navigate to a project
2. Edit a card's `.md` file in a text editor (change the title in frontmatter)
3. Verify: card title updates in the UI within ~200ms
4. Verify: `card:updated` change indicator animation plays
5. Verify: history event appears in activity panel (if open)

**Test scenario 2: External task toggle**
1. Open a card's detail panel
2. Edit the `.md` file to change `- [ ]` to `- [x]`
3. Verify: task checkbox updates in the detail panel
4. Verify: task progress bar updates on the card preview
5. Verify: green flash animation plays on the checkbox

**Test scenario 3: Multi-tab sync**
1. Open DevPlanner in two browser tabs on the same project
2. In Tab 1: create a new card
3. Verify: card appears in Tab 2 with blue glow animation
4. In Tab 2: move the card to a different lane
5. Verify: card moves in Tab 1 with amber glow animation

**Test scenario 4: Self-echo deduplication**
1. Create a card via the UI
2. Verify: only ONE blue glow animation plays (not two)
3. Toggle a task via the UI
4. Verify: only ONE green flash plays

**Test scenario 5: Reconnection recovery**
1. Open DevPlanner, note a card's state
2. Stop the backend server
3. Verify: connection indicator shows "Reconnecting..."
4. Edit a card file while server is down
5. Restart the backend server
6. Verify: client auto-reconnects
7. Verify: card data refreshes to reflect the edit made while disconnected

---

## Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `frontend/src/services/websocket.service.ts` | 14.1 | WebSocket client with reconnection |
| `frontend/src/hooks/useWebSocket.ts` | 14.3 | React hook for WebSocket lifecycle |
| `frontend/src/components/ui/ConnectionIndicator.tsx` | 14.6 | Connection state dot in header |

## Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `frontend/src/types/index.ts` | 14.4 | Add WebSocket message types and typed event payloads |
| `frontend/src/App.tsx` | 14.5 | Initialize useWebSocket hook |
| `frontend/src/components/layout/Header.tsx` | 14.6 | Add ConnectionIndicator |
| `frontend/src/store/index.ts` | 15.1-15.8 | Add wsConnected state, delta handlers, dedup tracking |

---

## Implementation Order

The recommended implementation order within these phases:

### Phase 14 (do sequentially)
1. **14.4** Types first — define all message types so everything is type-safe
2. **14.1** WebSocket client service — the core transport layer
3. **14.2** Add reconnection logic to the client
4. **14.3** React hook — bridges client to React lifecycle
5. **14.5** App.tsx integration — connect the hook
6. **14.6** Connection indicator — visual feedback
7. **14.7** Manual testing — verify connection, subscription, and reconnection

### Phase 15 (do sequentially)
1. **15.1** WebSocket state in store — foundation for handlers
2. **15.2-15.8** Delta handlers — implement one at a time, test each
3. **15.9** Wire handlers in useWebSocket hook
4. **15.10** End-to-end testing

---

## Success Criteria

Phases 14-15 are complete when:

1. WebSocket connects automatically on app load
2. Client subscribes to the active project and switches on project change
3. Auto-reconnection works with exponential backoff (up to 5 attempts)
4. Connection state indicator shows connected/reconnecting/disconnected
5. External file changes appear in the UI within ~200ms
6. Visual animations play for remote changes (card created, moved, task toggled)
7. Local actions don't trigger double animations (self-echo dedup)
8. Active card detail panel updates when the card is modified externally
9. Activity history receives real-time events via WebSocket
10. Data refreshes correctly after reconnection

---

## Technical Notes

### Why a standalone client service (not just a hook)?

The WebSocket connection should outlive individual React components. A module-level singleton ensures:
- Single connection per browser tab
- No reconnection thrashing during React re-renders
- Handlers can be registered/unregistered without affecting the connection
- Clean separation between transport (service) and React integration (hook)

### Why not use a WebSocket library (e.g., socket.io-client)?

- The backend uses Elysia's native WebSocket support, not socket.io
- Native WebSocket API is simple enough for our needs
- No need for the overhead of protocol negotiation, namespaces, or rooms
- Our reconnection logic is straightforward (5 attempts with backoff)
- Fewer dependencies to maintain

### Vite proxy and WebSocket

Vite's built-in proxy supports WebSocket forwarding, but it can be unreliable with hot reload. For development, we connect directly to the backend WebSocket URL (`ws://localhost:17103/api/ws`) rather than going through the Vite proxy. The `import.meta.env.DEV` check handles this.

### Performance considerations

- **No polling fallback.** If WebSocket is unavailable, the app works fine — just without real-time updates. Users can manually refresh.
- **Message size.** WebSocket events carry CardSummary data (lightweight — no full Markdown content). Detail panel fetches full content via REST API when needed.
- **Handler execution.** All handlers are synchronous store updates. API calls (for detail panel refresh) are fire-and-forget.
