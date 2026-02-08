# Real-Time Activity History (Phase 16)

**Status:** In Progress  
**Dependencies:** Phase 12 (WebSocket Infrastructure), Phase 13 (File Watching Service)  
**Related:** Phase 14-15 (Frontend WebSocket Client & Zustand Integration)

---

## Overview

Phase 16 adds a **real-time activity history log** that tracks all changes to a project (card creation, task completion, card moves, etc.) with timestamps and descriptions. Unlike visual indicators (Phase 11.5) which provide brief animations, the activity history provides a persistent, queryable record of changes.

The history is displayed in a **slide-out panel** that appears from the right side of the screen, featuring a tabbed interface for future extensibility. The panel includes smooth animations and can be toggled without interrupting the Kanban board workflow.

---

## User Experience Design

### Slide-Out Panel

**Visual Design:**
- **Position**: Slides in from the right edge of the screen
- **Width**: 400px on desktop, 100% on mobile
- **Height**: Full viewport height
- **Z-index**: Above Kanban board but below modals
- **Background**: Dark mode default (`bg-gray-900`)
- **Border**: Left border with subtle accent (`border-l border-gray-700`)

**Animation Specifications:**
- **Slide In**: Spring animation with `damping: 30, stiffness: 300`
- **Duration**: 400ms
- **Easing**: Smooth spring physics (Framer Motion)
- **Overlay**: Semi-transparent backdrop (`bg-black/30`) with fade animation
- **Interaction**: Click overlay or press Escape to close

**Layout Structure:**
```
┌─────────────────────────────────────────┐
│  [Close X]        Activity History      │ Header
├─────────────────────────────────────────┤
│  [History Tab] [Future Tab]             │ Tab Bar
├─────────────────────────────────────────┤
│                                         │
│  Today                                  │ Time Group
│  ├─ Task "Setup auth" completed 2:34pm │ Event
│  ├─ Card "API docs" moved to Complete  │ Event
│  └─ Card "New feature" created 1:12pm  │ Event
│                                         │
│  Yesterday                              │ Time Group
│  ├─ Task "Write tests" completed       │ Event
│  └─ Card "Bug fix" archived            │ Event
│                                         │
│  This Week                              │ Time Group
│  └─ ... older events ...               │
│                                         │
└─────────────────────────────────────────┘
```

**Interaction Behaviors:**
- **Toggle Button**: Icon button in header (bell/clock icon) to open/close
- **Keyboard**: Press `H` to toggle history panel (when no input focused)
- **Auto-scroll**: New events appear at top, panel auto-scrolls smoothly
- **Click Event**: Clicking an event opens the related card (if still exists)
- **Responsive**: Full-screen on mobile with slide-up animation

### Activity Event Display

**Event Card Design:**
- **Icon**: Action-specific icon (✓ for task complete, → for move, + for create)
- **Description**: Natural language description ("Task 'Setup auth' completed")
- **Timestamp**: Relative time ("2 minutes ago", "1:34 PM", "Yesterday")
- **Metadata**: Card name (clickable), lane badge, user info (future)
- **Hover State**: Subtle highlight, clickable cursor

**Time Grouping:**
- **Today**: Events from current day (midnight to now)
- **Yesterday**: Events from previous day
- **This Week**: Events from past 7 days
- **This Month**: Events from past 30 days
- **Older**: Events beyond 30 days (if any)

**Color Coding:**
- Task completed: Green accent (`text-green-500`)
- Card created: Blue accent (`text-blue-500`)
- Card moved: Amber accent (`text-amber-500`)
- Card archived: Gray accent (`text-gray-500`)
- Card updated: Violet accent (`text-violet-500`)

---

## Technical Architecture

### Backend: History Service

**File**: `src/services/history.service.ts`

**Data Structure:**
```typescript
export interface HistoryEvent {
  id: string;                    // UUID
  projectSlug: string;
  timestamp: string;             // ISO 8601
  action: HistoryActionType;
  description: string;           // Human-readable text
  metadata: HistoryEventMetadata;
}

export type HistoryActionType =
  | 'task:completed'
  | 'task:uncompleted'
  | 'card:created'
  | 'card:moved'
  | 'card:updated'
  | 'card:archived';

export interface HistoryEventMetadata {
  cardSlug: string;
  cardTitle: string;
  lane?: string;
  sourceLane?: string;
  targetLane?: string;
  taskIndex?: number;
  taskText?: string;
  changedFields?: string[];      // For card:updated
}
```

**Service Implementation:**
```typescript
class HistoryService {
  private events: Map<string, HistoryEvent[]>; // projectSlug -> events
  private readonly MAX_EVENTS_PER_PROJECT = 50;
  
  private static instance: HistoryService;
  
  static getInstance(): HistoryService {
    if (!this.instance) {
      this.instance = new HistoryService();
    }
    return this.instance;
  }
  
  constructor() {
    this.events = new Map();
  }
  
  /**
   * Record a new history event
   */
  recordEvent(event: Omit<HistoryEvent, 'id' | 'timestamp'>): HistoryEvent {
    const fullEvent: HistoryEvent = {
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };
    
    const projectEvents = this.events.get(event.projectSlug) || [];
    projectEvents.unshift(fullEvent); // Add to front (newest first)
    
    // Trim to max size
    if (projectEvents.length > this.MAX_EVENTS_PER_PROJECT) {
      projectEvents.length = this.MAX_EVENTS_PER_PROJECT;
    }
    
    this.events.set(event.projectSlug, projectEvents);
    
    return fullEvent;
  }
  
  /**
   * Get recent events for a project
   */
  getEvents(projectSlug: string, limit: number = 50): HistoryEvent[] {
    const events = this.events.get(projectSlug) || [];
    return events.slice(0, limit);
  }
  
  /**
   * Clear events for a project (e.g., when project is deleted)
   */
  clearEvents(projectSlug: string): void {
    this.events.delete(projectSlug);
  }
  
  /**
   * Get total event count for a project
   */
  getEventCount(projectSlug: string): number {
    return (this.events.get(projectSlug) || []).length;
  }
}
```

### Backend: REST Endpoint

**File**: `src/routes/history.ts`

```typescript
import { Elysia, t } from 'elysia';
import { HistoryService } from '../services/history.service';

const historyService = HistoryService.getInstance();

export const historyRoutes = new Elysia({ prefix: '/api' })
  .get('/projects/:projectSlug/history', 
    ({ params, query }) => {
      const { projectSlug } = params;
      const limit = Math.min(
        parseInt(query.limit as string) || 50, 
        100
      );
      
      const events = historyService.getEvents(projectSlug, limit);
      
      return {
        events,
        total: historyService.getEventCount(projectSlug),
      };
    },
    {
      params: t.Object({
        projectSlug: t.String(),
      }),
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
    }
  );
```

**Register in `src/server.ts`:**
```typescript
import { historyRoutes } from './routes/history';

app
  .use(projectRoutes)
  .use(cardRoutes)
  .use(taskRoutes)
  .use(websocketRoutes)
  .use(historyRoutes)  // <-- Add this
  .listen(PORT);
```

### Backend: Integration with File Watcher

**File**: `src/services/file-watcher.service.ts` (modify)

Add history logging when broadcasting WebSocket events:

```typescript
import { HistoryService } from './history.service';
import { WebSocketService } from './websocket.service';

class FileWatcherService {
  private historyService: HistoryService;
  private wsService: WebSocketService;
  
  constructor() {
    this.historyService = HistoryService.getInstance();
    this.wsService = WebSocketService.getInstance();
  }
  
  private handleCardUpdated(projectSlug: string, cardSlug: string, changes: any) {
    // ... existing logic to parse changes ...
    
    // Record history event
    const historyEvent = this.historyService.recordEvent({
      projectSlug,
      action: 'card:updated',
      description: `Card "${changes.title || cardSlug}" was updated`,
      metadata: {
        cardSlug,
        cardTitle: changes.title || cardSlug,
        lane: changes.lane,
        changedFields: Object.keys(changes),
      },
    });
    
    // Broadcast WebSocket event
    this.wsService.broadcast(projectSlug, {
      type: 'event',
      event: {
        type: 'card:updated',
        projectSlug,
        timestamp: historyEvent.timestamp,
        data: changes,
      },
    });
    
    // Broadcast history event separately
    this.wsService.broadcast(projectSlug, {
      type: 'event',
      event: {
        type: 'history:event',
        projectSlug,
        timestamp: historyEvent.timestamp,
        data: historyEvent,
      },
    });
  }
  
  // Similar patterns for other event types...
}
```

### Frontend: Activity Panel Component

**File**: `frontend/src/components/activity/ActivityPanel.tsx`

```typescript
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { ActivityLog } from './ActivityLog';
import { cn } from '../../utils/cn';

interface ActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ActivityPanel({ isOpen, onClose }: ActivityPanelProps) {
  const [activeTab, setActiveTab] = useState<'history' | 'future'>('history');
  
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
          />
          
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
            }}
            className={cn(
              'fixed top-0 right-0 h-full z-50',
              'w-full md:w-[400px]',
              'bg-gray-900 border-l border-gray-700',
              'flex flex-col',
              'shadow-2xl'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-gray-100">
                Activity History
              </h2>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-gray-800 transition-colors"
                aria-label="Close activity panel"
              >
                <XMarkIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* Tab Bar */}
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => setActiveTab('history')}
                className={cn(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                  activeTab === 'history'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-300'
                )}
              >
                History
              </button>
              <button
                onClick={() => setActiveTab('future')}
                className={cn(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                  activeTab === 'future'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-300'
                )}
                disabled
              >
                Notifications
                <span className="ml-2 text-xs text-gray-500">(Soon)</span>
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'history' && <ActivityLog />}
              {activeTab === 'future' && (
                <div className="p-4 text-center text-gray-500">
                  Coming soon...
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

**File**: `frontend/src/components/activity/ActivityLog.tsx`

```typescript
import { useEffect } from 'react';
import { useStore } from '../../store';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../../utils/cn';
import {
  CheckCircleIcon,
  ArrowRightIcon,
  PlusIcon,
  ArchiveBoxIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';

export function ActivityLog() {
  const { historyEvents, loadHistory, activeProjectSlug, openCardDetail } = useStore();
  
  useEffect(() => {
    if (activeProjectSlug) {
      loadHistory();
    }
  }, [activeProjectSlug, loadHistory]);
  
  // Group events by time period
  const groupedEvents = groupEventsByTime(historyEvents);
  
  return (
    <div className="p-4 space-y-6">
      {Object.entries(groupedEvents).map(([timeGroup, events]) => (
        <div key={timeGroup}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">
            {timeGroup}
          </h3>
          <div className="space-y-2">
            {events.map((event) => (
              <ActivityEventCard
                key={event.id}
                event={event}
                onClick={() => {
                  if (event.metadata.cardSlug) {
                    openCardDetail(event.metadata.cardSlug);
                  }
                }}
              />
            ))}
          </div>
        </div>
      ))}
      
      {historyEvents.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No activity yet
        </div>
      )}
    </div>
  );
}

interface ActivityEventCardProps {
  event: HistoryEvent;
  onClick: () => void;
}

function ActivityEventCard({ event, onClick }: ActivityEventCardProps) {
  const icon = getEventIcon(event.action);
  const colorClass = getEventColor(event.action);
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg',
        'bg-gray-800/50 hover:bg-gray-800',
        'border border-gray-700 hover:border-gray-600',
        'transition-all duration-150',
        'group cursor-pointer'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn('flex-shrink-0 mt-0.5', colorClass)}>
          {icon}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 group-hover:text-white transition-colors">
            {event.description}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
          </p>
        </div>
      </div>
    </button>
  );
}

function getEventIcon(action: string) {
  switch (action) {
    case 'task:completed':
      return <CheckCircleIcon className="w-5 h-5" />;
    case 'card:moved':
      return <ArrowRightIcon className="w-5 h-5" />;
    case 'card:created':
      return <PlusIcon className="w-5 h-5" />;
    case 'card:archived':
      return <ArchiveBoxIcon className="w-5 h-5" />;
    case 'card:updated':
      return <PencilIcon className="w-5 h-5" />;
    default:
      return <PencilIcon className="w-5 h-5" />;
  }
}

function getEventColor(action: string): string {
  switch (action) {
    case 'task:completed':
      return 'text-green-500';
    case 'card:moved':
      return 'text-amber-500';
    case 'card:created':
      return 'text-blue-500';
    case 'card:archived':
      return 'text-gray-500';
    case 'card:updated':
      return 'text-violet-500';
    default:
      return 'text-gray-400';
  }
}

function groupEventsByTime(events: HistoryEvent[]): Record<string, HistoryEvent[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);
  
  const groups: Record<string, HistoryEvent[]> = {
    'Today': [],
    'Yesterday': [],
    'This Week': [],
    'This Month': [],
    'Older': [],
  };
  
  for (const event of events) {
    const eventDate = new Date(event.timestamp);
    
    if (eventDate >= today) {
      groups['Today'].push(event);
    } else if (eventDate >= yesterday) {
      groups['Yesterday'].push(event);
    } else if (eventDate >= weekAgo) {
      groups['This Week'].push(event);
    } else if (eventDate >= monthAgo) {
      groups['This Month'].push(event);
    } else {
      groups['Older'].push(event);
    }
  }
  
  // Remove empty groups
  return Object.fromEntries(
    Object.entries(groups).filter(([_, events]) => events.length > 0)
  );
}
```

### Frontend: Zustand Store Integration

**File**: `frontend/src/store/index.ts` (add)

```typescript
interface DevPlannerStore {
  // ... existing state ...
  
  // Activity History
  historyEvents: HistoryEvent[];
  isActivityPanelOpen: boolean;
  loadHistory: () => Promise<void>;
  addHistoryEvent: (event: HistoryEvent) => void;
  toggleActivityPanel: () => void;
  setActivityPanelOpen: (open: boolean) => void;
}

// In store implementation:
{
  // ... existing state ...
  historyEvents: [],
  isActivityPanelOpen: false,
  
  loadHistory: async () => {
    const projectSlug = get().activeProjectSlug;
    if (!projectSlug) return;
    
    try {
      const response = await fetch(
        `/api/projects/${projectSlug}/history?limit=50`
      );
      const data = await response.json();
      set({ historyEvents: data.events });
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  },
  
  addHistoryEvent: (event: HistoryEvent) => {
    set((state) => ({
      historyEvents: [event, ...state.historyEvents].slice(0, 50),
    }));
  },
  
  toggleActivityPanel: () => {
    set((state) => ({
      isActivityPanelOpen: !state.isActivityPanelOpen,
    }));
  },
  
  setActivityPanelOpen: (open: boolean) => {
    set({ isActivityPanelOpen: open });
  },
}
```

### Frontend: WebSocket Integration

**File**: `frontend/src/hooks/useWebSocket.ts` (modify)

Add handler for `history:event` messages:

```typescript
useEffect(() => {
  if (!ws) return;
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    if (message.type === 'event') {
      const wsEvent = message.event;
      
      switch (wsEvent.type) {
        case 'history:event':
          store.addHistoryEvent(wsEvent.data);
          break;
        
        // ... other event handlers ...
      }
    }
  };
}, [ws]);
```

### Frontend: Header Integration

**File**: `frontend/src/components/layout/Header.tsx` (modify)

Add activity panel toggle button:

```typescript
import { ClockIcon } from '@heroicons/react/24/outline';
import { useStore } from '../../store';

export function Header() {
  const { toggleActivityPanel, isActivityPanelOpen } = useStore();
  
  return (
    <header className="...">
      {/* ... existing header content ... */}
      
      <button
        onClick={toggleActivityPanel}
        className={cn(
          'p-2 rounded-lg transition-colors',
          isActivityPanelOpen
            ? 'bg-blue-500/20 text-blue-400'
            : 'hover:bg-gray-800 text-gray-400'
        )}
        aria-label="Toggle activity history"
      >
        <ClockIcon className="w-5 h-5" />
      </button>
    </header>
  );
}
```

### Frontend: App Integration

**File**: `frontend/src/App.tsx` (modify)

Render ActivityPanel:

```typescript
import { ActivityPanel } from './components/activity/ActivityPanel';

export function App() {
  const { isActivityPanelOpen, setActivityPanelOpen } = useStore();
  
  return (
    <MainLayout>
      {/* ... existing content ... */}
      
      <ActivityPanel
        isOpen={isActivityPanelOpen}
        onClose={() => setActivityPanelOpen(false)}
      />
    </MainLayout>
  );
}
```

---

## Implementation Checklist

### Backend (Tasks 16.1-16.5)

- [ ] 16.1 Create `src/services/history.service.ts`
  - [ ] Define `HistoryEvent` interface and types
  - [ ] Implement in-memory storage (Map by project slug)
  - [ ] Add `recordEvent()` method with max 50 events per project
  - [ ] Add `getEvents()` method with limit parameter
  - [ ] Add `clearEvents()` and `getEventCount()` utilities
  - [ ] Export singleton instance

- [ ] 16.2 Integrate HistoryService with FileWatcherService
  - [ ] Import HistoryService singleton
  - [ ] Record events in all change handlers (task completed, card moved, card created, etc.)
  - [ ] Generate human-readable descriptions for each action type
  - [ ] Include full metadata (card slug, title, lanes, etc.)
  - [ ] Broadcast `history:event` via WebSocket after recording

- [ ] 16.3 Create `src/routes/history.ts`
  - [ ] Define GET `/api/projects/:slug/history` endpoint
  - [ ] Add query parameter `limit` (default 50, max 100)
  - [ ] Return `{ events: HistoryEvent[], total: number }`
  - [ ] Add proper TypeScript validation with Elysia `t`
  - [ ] Handle invalid project slug gracefully

- [ ] 16.4 Register history routes in `src/server.ts`
  - [ ] Import `historyRoutes`
  - [ ] Add `.use(historyRoutes)` after other routes
  - [ ] Initialize HistoryService singleton on startup
  - [ ] Log initialization confirmation

- [ ] 16.5 Add `history:event` WebSocket message type
  - [ ] Update `src/types/index.ts` with `HistoryEvent` types
  - [ ] Add `history:event` to `WebSocketEventType` union
  - [ ] Update WebSocket message documentation

### Frontend (Tasks 16.6-16.10)

- [ ] 16.6 Add history state to Zustand store
  - [ ] Add `historyEvents: HistoryEvent[]` state
  - [ ] Add `isActivityPanelOpen: boolean` state
  - [ ] Implement `loadHistory()` action (fetch from REST API)
  - [ ] Implement `addHistoryEvent()` action (prepend, trim to 50)
  - [ ] Implement `toggleActivityPanel()` and `setActivityPanelOpen()` actions
  - [ ] Add HistoryEvent types to `frontend/src/types/index.ts`

- [ ] 16.7 Create `frontend/src/components/activity/ActivityPanel.tsx`
  - [ ] Implement slide-in panel with Framer Motion
  - [ ] Add backdrop with click-to-close
  - [ ] Implement header with close button
  - [ ] Create tab bar (History + placeholder for Notifications)
  - [ ] Add Escape key handler to close panel
  - [ ] Make responsive (full-width on mobile, 400px on desktop)
  - [ ] Add proper z-index layering

- [ ] 16.8 Create `frontend/src/components/activity/ActivityLog.tsx`
  - [ ] Fetch history on mount using `loadHistory()`
  - [ ] Implement time-based grouping (Today, Yesterday, This Week, etc.)
  - [ ] Create `ActivityEventCard` component
  - [ ] Add action-specific icons and colors
  - [ ] Implement relative timestamps ("2 minutes ago")
  - [ ] Make events clickable to open card detail
  - [ ] Handle empty state ("No activity yet")

- [ ] 16.9 Integrate with WebSocket for real-time updates
  - [ ] Update `frontend/src/hooks/useWebSocket.ts`
  - [ ] Add handler for `history:event` messages
  - [ ] Call `addHistoryEvent()` when new event arrives
  - [ ] Test real-time event appearance in ActivityLog

- [ ] 16.10 Add activity panel toggle to Header
  - [ ] Update `frontend/src/components/layout/Header.tsx`
  - [ ] Add clock/bell icon button
  - [ ] Wire to `toggleActivityPanel()` action
  - [ ] Add active state styling when panel is open
  - [ ] Add keyboard shortcut (H key) for power users

### Testing & Polish

- [ ] Test backend history recording
  - [ ] Create card → verify event recorded
  - [ ] Complete task → verify event recorded
  - [ ] Move card → verify event recorded
  - [ ] Verify max 50 events per project enforced
  - [ ] Test REST endpoint with various limits

- [ ] Test frontend display
  - [ ] Open activity panel → verify animations smooth
  - [ ] Verify time grouping correct (Today, Yesterday, etc.)
  - [ ] Click event → verify card detail opens
  - [ ] Test responsive behavior (mobile, tablet, desktop)
  - [ ] Test Escape key and backdrop click to close

- [ ] Test real-time updates
  - [ ] Open panel, make change in another tab → verify event appears
  - [ ] Make external file edit → verify event appears via file watcher
  - [ ] Test auto-scroll to new events

- [ ] Manual verification
  - [ ] Take screenshot of slide-out panel with animations
  - [ ] Verify all event types display correctly
  - [ ] Test with empty state, single event, many events
  - [ ] Verify keyboard navigation works

---

## Success Criteria

Phase 16 is complete when:

1. ✅ Backend HistoryService records all change events with timestamps
2. ✅ REST endpoint returns history events with proper filtering
3. ✅ FileWatcherService broadcasts `history:event` via WebSocket
4. ✅ Frontend slide-out panel animates smoothly (400ms spring)
5. ✅ Activity log displays events grouped by time period
6. ✅ Real-time events appear instantly via WebSocket
7. ✅ Clicking an event opens the related card detail
8. ✅ Panel is responsive (full-screen mobile, 400px desktop)
9. ✅ All animations respect reduced-motion preferences
10. ✅ Manual testing confirms end-to-end functionality

---

## Timeline

**Estimated effort:** 6-8 hours

- 2-3 hours: Backend HistoryService + REST endpoint + integration
- 3-4 hours: Frontend ActivityPanel + ActivityLog components
- 1 hour: WebSocket integration + real-time updates
- 1 hour: Testing, polish, and screenshots

**Next milestone:** Phase 17 (Production Optimization & Testing) — Add message batching, graceful degradation, unit tests

---

## Future Enhancements (Out of Scope)

- Persistent storage (save history to database)
- User attribution (track which user made each change)
- Filtering by action type or card
- Search within activity log
- Export history as CSV/JSON
- Notifications tab for @mentions and assignments
- Undo/redo functionality based on history
- Activity analytics and insights
