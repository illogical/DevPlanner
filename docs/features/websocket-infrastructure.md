# WebSocket Infrastructure (Phase 12)

**Status:** In Progress  
**Dependencies:** Phase 11.5 (Visual Indicators - already complete)  
**Next Phase:** Phase 13 (File Watching Service)

---

## Overview

Phase 12 establishes the backend WebSocket infrastructure for real-time client updates. This foundation enables DevPlanner to push changes to all connected clients without requiring manual refreshes or polling.

The frontend visual indicator system (Phase 11.5) is already implemented and will automatically work with WebSocket updates. Store actions like `createCard()`, `moveCard()`, and `toggleTask()` will be called by WebSocket handlers without requiring additional frontend code changes.

---

## Architecture

### Connection Management

**WebSocketService** (`src/services/websocket.service.ts`) provides:

1. **Client Tracking** — `Map<clientId, WebSocket>` to manage all active connections
2. **Project Subscriptions** — `Map<projectSlug, Set<clientId>>` to route messages to clients watching specific projects
3. **Broadcast Functionality** — Send messages to all clients subscribed to a project or to a specific client

### Message Types

All WebSocket messages follow a standard format:

```typescript
interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'event' | 'error' | 'pong';
  projectSlug?: string;    // Target project for subscription/events
  event?: WebSocketEvent;  // Event payload (when type === 'event')
  error?: string;          // Error message (when type === 'error')
}
```

**Event Types** (for future phases):
- `card:created` — New card added to a lane
- `card:updated` — Card frontmatter or content changed
- `card:moved` — Card moved to a different lane
- `card:deleted` — Card removed/archived
- `task:toggled` — Task checked/unchecked
- `lane:reordered` — Cards reordered within a lane
- `project:updated` — Project metadata changed

---

## Implementation Tasks

### 12.1 Create WebSocketService

**File:** `src/services/websocket.service.ts`

Implement a singleton service with:

```typescript
class WebSocketService {
  private clients: Map<string, WebSocket>;
  private subscriptions: Map<string, Set<string>>;
  
  constructor() {
    this.clients = new Map();
    this.subscriptions = new Map();
  }

  // Connection lifecycle
  registerClient(clientId: string, ws: WebSocket): void
  unregisterClient(clientId: string): void
  
  // Subscription management
  subscribe(clientId: string, projectSlug: string): void
  unsubscribe(clientId: string, projectSlug: string): void
  getSubscribers(projectSlug: string): string[]
  
  // Message broadcasting
  broadcast(projectSlug: string, message: WebSocketMessage): void
  sendToClient(clientId: string, message: WebSocketMessage): void
  
  // Health monitoring
  getClientCount(): number
  getProjectSubscriptionCount(projectSlug: string): number
}
```

**Key behaviors:**
- Generate unique client IDs (UUID v4)
- Auto-cleanup subscriptions when client disconnects
- Safe handling of closed/errored WebSocket connections
- Log connection events for debugging

### 12.2 Add WebSocket Message Types

**File:** `src/types/index.ts`

Add TypeScript interfaces for WebSocket communication:

```typescript
// Base message structure
export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'event' | 'error' | 'pong';
  projectSlug?: string;
  event?: WebSocketEvent;
  error?: string;
}

// Event payloads (for Phase 13+)
export type WebSocketEventType = 
  | 'card:created'
  | 'card:updated'
  | 'card:moved'
  | 'card:deleted'
  | 'task:toggled'
  | 'lane:reordered'
  | 'project:updated';

export interface WebSocketEvent {
  type: WebSocketEventType;
  projectSlug: string;
  timestamp: string;      // ISO 8601
  data: unknown;          // Event-specific payload
}

// Client-to-server messages
export interface SubscribeMessage {
  type: 'subscribe';
  projectSlug: string;
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  projectSlug: string;
}

export interface PingMessage {
  type: 'ping';
}
```

### 12.3 Create WebSocket Route

**File:** `src/routes/websocket.ts`

Implement Elysia WebSocket route at `/api/ws`:

```typescript
import { Elysia } from 'elysia';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketService } from '../services/websocket.service';

const wsService = WebSocketService.getInstance();

export const websocketRoutes = new Elysia()
  .ws('/api/ws', {
    open(ws) {
      const clientId = uuidv4();
      ws.data.clientId = clientId;
      wsService.registerClient(clientId, ws);
      console.log(`[WebSocket] Client connected: ${clientId}`);
    },

    message(ws, message) {
      const clientId = ws.data.clientId;
      
      try {
        const msg = typeof message === 'string' 
          ? JSON.parse(message) 
          : message;

        if (msg.type === 'subscribe' && msg.projectSlug) {
          wsService.subscribe(clientId, msg.projectSlug);
          ws.send(JSON.stringify({ 
            type: 'subscribed', 
            projectSlug: msg.projectSlug 
          }));
        } 
        else if (msg.type === 'unsubscribe' && msg.projectSlug) {
          wsService.unsubscribe(clientId, msg.projectSlug);
          ws.send(JSON.stringify({ 
            type: 'unsubscribed', 
            projectSlug: msg.projectSlug 
          }));
        }
        else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        else {
          ws.send(JSON.stringify({ 
            type: 'error', 
            error: 'Unknown message type' 
          }));
        }
      } catch (err) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'Invalid message format' 
        }));
      }
    },

    close(ws) {
      const clientId = ws.data.clientId;
      wsService.unregisterClient(clientId);
      console.log(`[WebSocket] Client disconnected: ${clientId}`);
    }
  });
```

**Message flow:**
1. Client connects → `open()` generates client ID, registers in service
2. Client sends `subscribe` → Added to project's subscriber set
3. Client sends `unsubscribe` → Removed from project's subscriber set
4. Client sends `ping` → Server responds with `pong`
5. Client disconnects → `close()` cleanup all subscriptions

### 12.4 Register WebSocket Route in Server

**File:** `src/server.ts`

Add WebSocket route registration:

```typescript
import { websocketRoutes } from './routes/websocket';

// ... existing server setup ...

app
  .use(projectRoutes)
  .use(cardRoutes)
  .use(taskRoutes)
  .use(websocketRoutes)  // <-- Add this
  .listen(PORT);
```

Initialize WebSocketService singleton during server startup:

```typescript
import { WebSocketService } from './services/websocket.service';

// Initialize singleton before starting server
WebSocketService.getInstance();

console.log(`[WebSocket] Service initialized`);
```

### 12.5 Implement Heartbeat/Ping-Pong

Add connection health monitoring to WebSocketService:

```typescript
class WebSocketService {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly PING_TIMEOUT = 5000;        // 5 seconds
  
  startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((ws, clientId) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
          
          // Set timeout to close connection if no pong received
          const timeout = setTimeout(() => {
            console.log(`[WebSocket] Client ${clientId} failed heartbeat`);
            this.unregisterClient(clientId);
            ws.close();
          }, this.PING_TIMEOUT);
          
          // Store timeout so we can clear it on pong
          ws.data.pingTimeout = timeout;
        }
      });
    }, this.HEARTBEAT_INTERVAL);
  }
  
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}
```

Handle `pong` messages in the WebSocket route to clear timeout:

```typescript
if (msg.type === 'pong') {
  if (ws.data.pingTimeout) {
    clearTimeout(ws.data.pingTimeout);
  }
}
```

**Heartbeat flow:**
1. Server sends `ping` every 30 seconds to all connected clients
2. Server sets 5-second timeout waiting for `pong` response
3. Client responds with `pong` → timeout is cleared
4. No `pong` received → connection is stale, client is disconnected

### 12.6 Test WebSocket Connection

**Using wscat (WebSocket CLI tool):**

```bash
# Install wscat globally
bun add -g wscat

# Connect to WebSocket server
wscat -c ws://localhost:17103/api/ws

# Test subscribe
> {"type":"subscribe","projectSlug":"media-manager"}
< {"type":"subscribed","projectSlug":"media-manager"}

# Test ping
> {"type":"ping"}
< {"type":"pong"}

# Test unsubscribe
> {"type":"unsubscribe","projectSlug":"media-manager"}
< {"type":"unsubscribed","projectSlug":"media-manager"}
```

**Manual test checklist:**
- [ ] Client can connect to `/api/ws`
- [ ] Subscribe message registers client for project
- [ ] Unsubscribe message removes client subscription
- [ ] Ping/pong heartbeat works correctly
- [ ] Multiple clients can subscribe to same project
- [ ] Client disconnect triggers cleanup
- [ ] Invalid messages return error response

**Using browser console (for frontend integration testing later):**

```javascript
const ws = new WebSocket('ws://localhost:17103/api/ws');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({ type: 'subscribe', projectSlug: 'media-manager' }));
};

ws.onmessage = (event) => {
  console.log('Message:', JSON.parse(event.data));
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

---

## Integration with Future Phases

### Phase 13: File Watching Service

File watcher will detect filesystem changes and broadcast events via WebSocketService:

```typescript
// Example from Phase 13
fileWatcher.on('change', (event: WebSocketEvent) => {
  wsService.broadcast(event.projectSlug, {
    type: 'event',
    event: event
  });
});
```

### Phase 14: Frontend WebSocket Client

Frontend will connect and subscribe to active project:

```typescript
// Example from Phase 14
const ws = new WebSocket('ws://localhost:17103/api/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({ 
    type: 'subscribe', 
    projectSlug: currentProject 
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'event') {
    handleWebSocketEvent(msg.event);  // Triggers visual indicators
  }
};
```

### Phase 15: Zustand Store Integration

Store handlers will be called by WebSocket events, automatically triggering visual indicators from Phase 11.5:

```typescript
// Example from Phase 15
function handleWebSocketEvent(event: WebSocketEvent) {
  switch (event.type) {
    case 'card:created':
      store.createCard(event.data);  // Triggers blue glow animation
      break;
    case 'card:moved':
      store.moveCard(event.data);    // Triggers amber glow animation
      break;
    case 'task:toggled':
      store.toggleTask(event.data);  // Triggers green flash animation
      break;
  }
}
```

---

## Success Criteria

Phase 12 is complete when:

1. ✅ WebSocketService singleton manages client connections and subscriptions
2. ✅ WebSocket route at `/api/ws` handles connection lifecycle
3. ✅ Clients can subscribe/unsubscribe to specific projects
4. ✅ Heartbeat/ping-pong prevents stale connections
5. ✅ Multiple clients can connect simultaneously
6. ✅ Connection cleanup works correctly on disconnect
7. ✅ Manual testing with wscat confirms all functionality

---

## Technical Notes

### Why WebSockets?

- **Real-time updates:** Instant notification of file changes across all clients
- **Efficient:** No polling overhead, server pushes only when changes occur
- **Scalable:** Subscription model ensures clients only receive relevant updates
- **Standards-based:** Native browser support, well-tested libraries

### Alternative Approaches Considered

1. **HTTP long-polling:** Less efficient, more server overhead
2. **Server-Sent Events (SSE):** Unidirectional, would require separate connection for client → server
3. **Polling:** High latency, unnecessary network traffic

### Performance Considerations

- **Connection limit:** Each WebSocket connection consumes server resources. Monitor with `getClientCount()`
- **Memory:** Client/subscription maps grow with concurrent users. Consider TTL cleanup for abandoned connections
- **Network:** Heartbeat messages add constant bandwidth. 30-second interval balances responsiveness vs. overhead

### Security Considerations

**Phase 12 scope (basic functionality):**
- WebSocket connections are unauthenticated
- Any client can subscribe to any project
- No message rate limiting

**Future enhancements (post-MVP):**
- Add authentication token validation on connection
- Implement per-client message rate limiting
- Add project-level access control
- Encrypt WebSocket connections (WSS) in production

---

## Dependencies

**NPM Packages:**
- No additional dependencies required (Elysia has built-in WebSocket support via `@elysiajs/websocket` plugin)

**Development Tools:**
- `wscat` — Command-line WebSocket client for testing

---

## Testing Strategy

### Unit Tests (optional for Phase 12)

Test WebSocketService in isolation:

```typescript
describe('WebSocketService', () => {
  it('registers and unregisters clients', () => {
    const service = new WebSocketService();
    const ws = createMockWebSocket();
    
    service.registerClient('client1', ws);
    expect(service.getClientCount()).toBe(1);
    
    service.unregisterClient('client1');
    expect(service.getClientCount()).toBe(0);
  });

  it('manages project subscriptions', () => {
    const service = new WebSocketService();
    
    service.subscribe('client1', 'project-a');
    expect(service.getSubscribers('project-a')).toContain('client1');
    
    service.unsubscribe('client1', 'project-a');
    expect(service.getSubscribers('project-a')).not.toContain('client1');
  });

  it('broadcasts messages to subscribed clients', () => {
    // Test implementation
  });
});
```

### Integration Tests

Test WebSocket route with real connections:

```typescript
describe('WebSocket Route', () => {
  it('accepts connections at /api/ws', async () => {
    const ws = new WebSocket('ws://localhost:17103/api/ws');
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('handles subscribe/unsubscribe messages', async () => {
    // Test implementation
  });
});
```

### Manual Testing

See section 12.6 above for wscat test commands.

---

## Troubleshooting

### WebSocket connection refused

- Verify server is running on correct port (`PORT` env var)
- Check that WebSocket route is registered in `server.ts`
- Ensure firewall allows WebSocket connections

### Client disconnects immediately

- Check server logs for error messages
- Verify heartbeat timeout is not too aggressive
- Test with wscat to isolate frontend vs. backend issues

### Subscriptions not persisting

- Ensure `clientId` is stored in `ws.data` during `open()`
- Verify subscription is added before sending confirmation
- Check for race conditions in subscription map access

---

## Documentation

**Files created/modified:**
- `src/services/websocket.service.ts` — WebSocket connection manager
- `src/routes/websocket.ts` — WebSocket route handler
- `src/types/index.ts` — WebSocket message type definitions
- `src/server.ts` — WebSocket route registration
- `docs/features/websocket-infrastructure.md` — This document

**Related documentation:**
- `docs/features/visual-indicators.md` — Frontend animation system (Phase 11.5)
- `docs/features/file-watching.md` — File watching integration (Phase 13)
- `docs/SPECIFICATION.md` — API contracts and architecture
- `docs/TASKS.md` — Implementation roadmap

---

## Timeline

**Estimated effort:** 4-6 hours

- 1-2 hours: WebSocketService implementation
- 1 hour: Type definitions and route setup
- 1 hour: Heartbeat/health monitoring
- 1-2 hours: Testing and debugging

**Next milestone:** Phase 13 (File Watching Service) — Add filesystem monitoring to detect changes and broadcast via WebSocket
