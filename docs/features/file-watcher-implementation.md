# File Watcher Service - Phase 13 Implementation Plan

## Overview

This document provides a detailed implementation plan for Phase 13 of the WebSocket file-watching feature. Phase 13 focuses on building the `FileWatcherService` that monitors the workspace directory for changes to project files and broadcasts delta updates to connected WebSocket clients.

## Context

Phase 12 (Backend WebSocket Infrastructure) has already been completed, providing:
- `WebSocketService` for client connection management and broadcasting
- WebSocket route at `/api/ws` with subscription handling
- WebSocket message types defined in `src/types/index.ts`

Phase 13 builds on this foundation by adding file system monitoring that triggers WebSocket broadcasts when files change.

## Objectives

1. Monitor all workspace files recursively using Node.js `fs.watch`
2. Filter file changes to only process relevant files (`.md`, `_project.json`, `_order.json`)
3. Debounce rapid file changes (100ms window) to handle editor auto-saves
4. Parse file changes to determine event type and extract delta data
5. Broadcast events to clients subscribed to the affected project
6. Handle edge cases (file rename, delete, race conditions)

## Architecture

```
File System Changes
    ↓
fs.watch (recursive, all files)
    ↓
File Filter (*.md, _project.json, _order.json)
    ↓
Debouncer (100ms window)
    ↓
Change Detector (parse path, determine event type)
    ↓
File Parser (read file, extract delta)
    ↓
WebSocketService.broadcast()
    ↓
Connected Clients
```

## File Path Analysis

The workspace structure provides all the context we need:

```
workspace/
└── project-slug/
    ├── _project.json          → project:updated
    ├── 01-upcoming/
    │   ├── _order.json        → lane:reordered (lane = "01-upcoming")
    │   └── card-slug.md       → card:created/updated/deleted (lane = "01-upcoming")
    ├── 02-in-progress/
    ├── 03-complete/
    └── 04-archive/
```

From a file path like `workspace/my-project/02-in-progress/implement-auth.md`, we can extract:
- Project slug: `my-project`
- Lane: `02-in-progress`
- Card slug: `implement-auth`

## Event Type Determination

| File Pattern | Event Type | Conditions |
|---|---|---|
| `{project}/_project.json` | `project:updated` | File modified |
| `{project}/{lane}/_order.json` | `lane:reordered` | File modified |
| `{project}/{lane}/{card}.md` | `card:created` | File created (new file) |
| `{project}/{lane}/{card}.md` | `card:updated` | File modified |
| `{project}/{lane}/{card}.md` | `card:deleted` | File deleted/renamed away |
| `{project}/{lane}/{card}.md` | `card:moved` | Detected via matching delete + create in different lanes within debounce window |

## Implementation Tasks

### Task 13.1: Create FileWatcherService with Recursive Watching

**File:** `src/services/file-watcher.service.ts`

**Implementation:**
```typescript
import { watch } from 'fs';
import { join } from 'path';
import { WebSocketService } from './websocket.service';
import { ConfigService } from './config.service';

export class FileWatcherService {
  private static instance: FileWatcherService;
  private watcher: FSWatcher | null = null;
  private wsService: WebSocketService;
  
  private constructor() {
    this.wsService = WebSocketService.getInstance();
  }
  
  public static getInstance(): FileWatcherService {
    if (!FileWatcherService.instance) {
      FileWatcherService.instance = new FileWatcherService();
    }
    return FileWatcherService.instance;
  }
  
  public start(): void {
    const config = ConfigService.getInstance();
    const workspacePath = config.workspacePath;
    
    this.watcher = watch(workspacePath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      this.handleFileChange(eventType, filename);
    });
    
    console.log(`[FileWatcher] Started watching: ${workspacePath}`);
  }
  
  public stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[FileWatcher] Stopped');
    }
  }
}
```

**Key Points:**
- Singleton pattern (matches WebSocketService)
- Recursive watching on entire workspace
- Store WebSocketService reference for broadcasting

### Task 13.2: Implement File Filtering

**Add to FileWatcherService:**

```typescript
private shouldProcessFile(filename: string): boolean {
  // Ignore temporary files created by editors
  if (filename.includes('.tmp') || filename.includes('.swp')) {
    return false;
  }
  
  // Only process our three file types
  if (filename.endsWith('.md')) return true;
  if (filename.endsWith('_project.json')) return true;
  if (filename.endsWith('_order.json')) return true;
  
  return false;
}
```

**Edge Cases:**
- Hidden files (`.git/`, `.DS_Store`) - ignored by extension check
- Backup files (`.bak`, `~`) - ignored by extension check
- Editor temp files (`.tmp`, `.swp`) - explicitly ignored

### Task 13.3: Implement Debouncing

**Add to FileWatcherService:**

```typescript
private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
private readonly DEBOUNCE_MS = 100;

private handleFileChange(eventType: string, filename: string): void {
  if (!this.shouldProcessFile(filename)) {
    return;
  }
  
  // Clear existing timer for this file
  const existingTimer = this.debounceTimers.get(filename);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  
  // Set new timer
  const timer = setTimeout(() => {
    this.debounceTimers.delete(filename);
    this.processFileChange(eventType, filename);
  }, this.DEBOUNCE_MS);
  
  this.debounceTimers.set(filename, timer);
}
```

**Rationale:**
- 100ms window handles rapid editor saves (auto-save often writes multiple times)
- Per-file debouncing allows multiple files to be processed in parallel
- Timer cleanup prevents memory leaks

### Task 13.4: Implement Change Detection Logic

**Add to FileWatcherService:**

```typescript
private processFileChange(eventType: string, filename: string): void {
  try {
    const pathParts = this.parseFilePath(filename);
    if (!pathParts) {
      console.warn(`[FileWatcher] Could not parse path: ${filename}`);
      return;
    }
    
    const fullPath = join(ConfigService.getInstance().workspacePath, filename);
    
    // Determine event type and parse file
    if (filename.endsWith('_project.json')) {
      this.handleProjectChange(pathParts.projectSlug, fullPath);
    } else if (filename.endsWith('_order.json')) {
      this.handleOrderChange(pathParts.projectSlug, pathParts.lane!, fullPath);
    } else if (filename.endsWith('.md')) {
      this.handleCardChange(eventType, pathParts, fullPath);
    }
  } catch (error) {
    console.error(`[FileWatcher] Error processing ${filename}:`, error);
  }
}

private parseFilePath(filename: string): { 
  projectSlug: string; 
  lane?: string; 
  cardSlug?: string;
} | null {
  const parts = filename.split('/');
  
  if (parts.length < 2) return null;
  
  const projectSlug = parts[0];
  
  if (parts.length === 2) {
    // workspace/project/_project.json
    return { projectSlug };
  }
  
  if (parts.length === 3) {
    // workspace/project/lane/_order.json or workspace/project/lane/card.md
    const lane = parts[1];
    const file = parts[2];
    
    if (file === '_order.json') {
      return { projectSlug, lane };
    }
    
    if (file.endsWith('.md')) {
      const cardSlug = file.replace('.md', '');
      return { projectSlug, lane, cardSlug };
    }
  }
  
  return null;
}
```

**Path Parsing Logic:**
- 2 parts: `project/_project.json` → project update
- 3 parts: `project/lane/_order.json` → lane reorder
- 3 parts: `project/lane/card.md` → card change

### Task 13.5: Parse Changed Files and Extract Delta Data

**Add handler methods to FileWatcherService:**

```typescript
import { readFileSync, existsSync } from 'fs';
import { ProjectService } from './project.service';
import { CardService } from './card.service';
import type { WebSocketEvent } from '../types';

private handleProjectChange(projectSlug: string, fullPath: string): void {
  if (!existsSync(fullPath)) {
    // Project deleted - don't broadcast (projects are only archived, not deleted)
    return;
  }
  
  try {
    const project = ProjectService.getInstance().getProject(projectSlug);
    
    const event: WebSocketEvent = {
      type: 'project:updated',
      projectSlug,
      timestamp: new Date().toISOString(),
      data: project
    };
    
    this.wsService.broadcast(projectSlug, {
      type: 'event',
      event
    });
    
    console.log(`[FileWatcher] Project updated: ${projectSlug}`);
  } catch (error) {
    console.error(`[FileWatcher] Error reading project ${projectSlug}:`, error);
  }
}

private handleOrderChange(projectSlug: string, lane: string, fullPath: string): void {
  if (!existsSync(fullPath)) {
    // Order file deleted - this shouldn't happen in normal operation
    return;
  }
  
  try {
    const orderData = JSON.parse(readFileSync(fullPath, 'utf-8'));
    const order = orderData.order || [];
    
    const event: WebSocketEvent = {
      type: 'lane:reordered',
      projectSlug,
      timestamp: new Date().toISOString(),
      data: { lane, order }
    };
    
    this.wsService.broadcast(projectSlug, {
      type: 'event',
      event
    });
    
    console.log(`[FileWatcher] Lane reordered: ${projectSlug}/${lane}`);
  } catch (error) {
    console.error(`[FileWatcher] Error reading order file ${fullPath}:`, error);
  }
}

private handleCardChange(
  eventType: string,
  pathParts: { projectSlug: string; lane: string; cardSlug: string },
  fullPath: string
): void {
  const { projectSlug, lane, cardSlug } = pathParts;
  const exists = existsSync(fullPath);
  
  if (!exists) {
    // Card deleted
    const event: WebSocketEvent = {
      type: 'card:deleted',
      projectSlug,
      timestamp: new Date().toISOString(),
      data: { slug: cardSlug, lane }
    };
    
    this.wsService.broadcast(projectSlug, {
      type: 'event',
      event
    });
    
    console.log(`[FileWatcher] Card deleted: ${projectSlug}/${lane}/${cardSlug}`);
    return;
  }
  
  try {
    // Card created or updated - read the full card
    const cardService = CardService.getInstance();
    const card = cardService.getCard(projectSlug, cardSlug);
    
    if (!card) {
      console.warn(`[FileWatcher] Card not found after change: ${cardSlug}`);
      return;
    }
    
    // For simplicity, treat all existing file changes as updates
    // Creation detection could be enhanced by tracking previously seen cards
    const event: WebSocketEvent = {
      type: 'card:updated',
      projectSlug,
      timestamp: new Date().toISOString(),
      data: {
        slug: cardSlug,
        lane,
        card: {
          slug: card.slug,
          filename: card.filename,
          lane: card.lane,
          frontmatter: card.frontmatter,
          taskProgress: {
            total: card.tasks.length,
            checked: card.tasks.filter(t => t.checked).length
          }
        }
      }
    };
    
    this.wsService.broadcast(projectSlug, {
      type: 'event',
      event
    });
    
    console.log(`[FileWatcher] Card updated: ${projectSlug}/${lane}/${cardSlug}`);
  } catch (error) {
    console.error(`[FileWatcher] Error reading card ${cardSlug}:`, error);
  }
}
```

**Delta Strategy:**
- For project updates: Send full project config (small payload)
- For lane reorder: Send new order array only
- For card changes: Send CardSummary (not full content) to minimize payload
- Full card content is fetched on-demand when user opens detail panel

### Task 13.6: Integrate with Server

**Modify:** `src/server.ts`

```typescript
import { FileWatcherService } from './services/file-watcher.service';

// After WebSocketService initialization
const fileWatcher = FileWatcherService.getInstance();
fileWatcher.start();

console.log('FileWatcher service started');
```

**Shutdown Handling:**

```typescript
// Add graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  fileWatcher.stop();
  process.exit(0);
});
```

### Task 13.7: Handle Edge Cases

**Card Move Detection:**

The basic implementation above treats delete + create as separate events. A more sophisticated approach would detect moves:

```typescript
private moveDetectionWindow: Map<string, {
  slug: string;
  sourceLane: string;
  timestamp: number;
}> = new Map();

private readonly MOVE_DETECTION_WINDOW_MS = 500;

// In handleCardChange, when card is deleted:
if (!exists) {
  // Store delete event for move detection
  const key = `${projectSlug}:${cardSlug}`;
  this.moveDetectionWindow.set(key, {
    slug: cardSlug,
    sourceLane: lane,
    timestamp: Date.now()
  });
  
  // Clean up after window expires
  setTimeout(() => {
    this.moveDetectionWindow.delete(key);
  }, this.MOVE_DETECTION_WINDOW_MS);
  
  // Don't broadcast delete yet - wait to see if it's a move
  return;
}

// When card is created/updated:
const key = `${projectSlug}:${cardSlug}`;
const recentDelete = this.moveDetectionWindow.get(key);

if (recentDelete && Date.now() - recentDelete.timestamp < this.MOVE_DETECTION_WINDOW_MS) {
  // This is a move!
  this.moveDetectionWindow.delete(key);
  
  const event: WebSocketEvent = {
    type: 'card:moved',
    projectSlug,
    timestamp: new Date().toISOString(),
    data: {
      slug: cardSlug,
      sourceLane: recentDelete.sourceLane,
      targetLane: lane
    }
  };
  
  this.wsService.broadcast(projectSlug, { type: 'event', event });
  console.log(`[FileWatcher] Card moved: ${cardSlug} from ${recentDelete.sourceLane} to ${lane}`);
  return;
}
```

**Race Condition Handling:**

File reads can fail if the file is still being written:

```typescript
private safeReadFile(path: string, retries = 3, delay = 50): string | null {
  for (let i = 0; i < retries; i++) {
    try {
      return readFileSync(path, 'utf-8');
    } catch (error) {
      if (i < retries - 1) {
        // Wait and retry
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait (synchronous delay)
        }
      }
    }
  }
  return null;
}
```

## Testing Strategy

### Unit Tests

**File:** `src/__tests__/file-watcher.service.test.ts`

Test cases:
1. ✅ File filtering - correctly identifies processable files
2. ✅ Path parsing - extracts project/lane/card from various paths
3. ✅ Debouncing - multiple rapid changes result in single event
4. ✅ Project change handling - broadcasts correct event type
5. ✅ Card change handling - broadcasts correct delta data
6. ✅ Lane reorder handling - broadcasts correct order array
7. ✅ Card deletion - broadcasts delete event
8. ✅ Move detection - identifies delete + create as move

### Manual Testing

1. **Basic watching:**
   - Start backend with `bun run dev:backend`
   - Connect WebSocket client (browser or wscat)
   - Subscribe to a project
   - Edit a card markdown file in VS Code
   - Verify `card:updated` event received

2. **Debouncing:**
   - Enable auto-save in editor (1s interval)
   - Type continuously in a card file
   - Verify only 1-2 events received (not one per keystroke)

3. **Multi-client sync:**
   - Open project in two browser tabs
   - Edit card file externally
   - Verify both tabs receive update

4. **Edge cases:**
   - Rename a card file → should see delete + create (or move event)
   - Delete a card file → should see delete event
   - Create new card file → should see create/update event
   - Modify `_order.json` → should see lane:reordered event

## Performance Considerations

### Memory

- Debounce timers: One timeout per active file (typically < 10 at any time)
- Move detection window: Cleared after 500ms, max ~10 entries
- Total overhead: < 1MB

### CPU

- File filtering is O(1) string operations
- Path parsing is O(1) (split + array access)
- File reads only happen after debounce (not on every change)
- Broadcasts are O(n) where n = subscribers to project (typically 1-5)

### Debounce Tuning

- 100ms is chosen as a balance:
  - Too short (< 50ms): Multiple events from single editor save
  - Too long (> 200ms): Noticeable lag for users
- Can be made configurable via environment variable if needed

## Error Handling

| Error Scenario | Handling Strategy |
|---|---|
| File read fails | Log error, skip broadcast, continue watching |
| Invalid JSON in _project.json | Log error, skip broadcast, don't crash |
| Path parsing fails | Log warning, ignore event |
| Service method throws | Catch, log, continue (don't crash watcher) |
| Watcher crashes | Could auto-restart, but let process supervisor handle |

**Error Logging:**
- All errors logged with `[FileWatcher]` prefix for easy filtering
- Include filename and error details
- Don't expose stack traces in production (use `error.message`)

## Integration Points

### Dependencies
- `ConfigService` - get workspace path
- `WebSocketService` - broadcast events
- `ProjectService` - read project configs
- `CardService` - read card data

### Dependents
- None directly (it pushes data to WebSocketService)
- Indirectly: Frontend clients receive events

## Rollout Plan

1. **Development:**
   - Implement and test locally
   - Verify with seeded data

2. **Verification:**
   - Run unit tests: `bun test file-watcher.service.test.ts`
   - Manual testing with two browser tabs
   - Edit files with different editors (VS Code, vim, etc.)

3. **Deployment:**
   - FileWatcherService starts automatically with server
   - No configuration changes needed (uses existing DEVPLANNER_WORKSPACE)
   - No breaking changes to existing API

## Future Enhancements (Out of Scope)

- **Message batching:** Collect multiple changes within 200ms, send as single update
- **Change tracking:** Track file hashes to detect actual content changes vs timestamp updates
- **Inotify optimization:** Use OS-specific file watching APIs for better performance
- **Event history:** Keep short buffer of recent events for reconnecting clients
- **Selective watching:** Only watch projects that have active subscribers

## Success Criteria

Phase 13 is complete when:

1. ✅ `FileWatcherService` successfully watches workspace directory
2. ✅ File changes trigger appropriate WebSocket events
3. ✅ Debouncing prevents duplicate events from rapid changes
4. ✅ All event types are correctly identified (project, card, lane)
5. ✅ Delta data is correctly extracted and broadcasted
6. ✅ Edge cases (rename, delete) are handled gracefully
7. ✅ Unit tests pass with > 80% coverage
8. ✅ Manual testing confirms multi-client sync works
9. ✅ No performance degradation (< 50ms per file change)
10. ✅ Error handling prevents crashes

## References

- [Phase 12: WebSocket Infrastructure](./websocket-infrastructure.md)
- [Overall File Watching Spec](./file-watching.md)
- [Node.js fs.watch Documentation](https://nodejs.org/api/fs.html#fswatchfilename-options-listener)
- [TASKS.md Phase 13](../TASKS.md) - Original task breakdown
