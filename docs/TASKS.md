# DevPlanner - Build Tasks

Prioritized task list for building the DevPlanner MVP. Tasks are ordered by dependency — each phase builds on the previous one.

Status key: `[ ]` = not started, `[~]` = in progress, `[x]` = complete

---

## Phase 1: Project Scaffolding

- [x] 1.1 Initialize root `package.json` with Bun, add backend dependencies (`elysia`, `gray-matter`), dev dependencies (`@types/bun`, `typescript`)
- [x] 1.2 Create `tsconfig.json` for the backend
- [x] 1.3 Scaffold frontend with `bun create vite frontend --template react-ts`
- [x] 1.4 Install frontend dependencies (`marked`, `zustand`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- [x] 1.5 Install frontend dev dependencies (`tailwindcss`, `@tailwindcss/vite`)
- [x] 1.6 Configure Tailwind CSS (dark mode palette from spec section 5.5)
- [x] 1.7 Configure Vite proxy (`/api` → `http://localhost:17103`)
- [x] 1.8 Add `package.json` scripts: `dev`, `test`, `seed`, `frontend`
- [x] 1.9 Create `workspace/` directory, add to `.gitignore`
- [x] 1.10 Create backend directory structure (`src/routes/`, `src/services/`, `src/types/`, `src/utils/`, `src/__tests__/`)

## Phase 2: Shared Types & Utilities

- [x] 2.1 Define shared TypeScript interfaces in `src/types/index.ts` (`ProjectConfig`, `LaneConfig`, `CardFrontmatter`, `Card`, `CardSummary`, `TaskItem`, `ApiError`, etc.)
- [x] 2.2 Implement `slugify()` in `src/utils/slug.ts` with unit tests

## Phase 3: Backend Services

Build from the bottom up — `MarkdownService` has no dependencies, then `ProjectService`, `CardService`, and `TaskService` layer on top.

- [x] 3.1 Implement `MarkdownService.parse()` — parse frontmatter + content + tasks from raw Markdown string
- [x] 3.2 Implement `MarkdownService.serialize()` — serialize frontmatter + content back to Markdown string
- [x] 3.3 Implement `MarkdownService.parseTasks()` — extract `TaskItem[]` from Markdown content
- [x] 3.4 Implement `MarkdownService.setTaskChecked()` — toggle a task's checked state in Markdown content
- [x] 3.5 Implement `MarkdownService.appendTask()` — add a new checklist item to Markdown content
- [x] 3.6 Implement `MarkdownService.taskProgress()` — compute `{ total, checked }` summary
- [x] 3.7 Write unit tests for `MarkdownService` (parsing, serialization, task manipulation, edge cases)
- [x] 3.8 Implement `ProjectService.listProjects()` — scan workspace, read `_project.json` files, compute card counts
- [x] 3.9 Implement `ProjectService.getProject()` — read single project config
- [x] 3.10 Implement `ProjectService.createProject()` — create folder, `_project.json`, lane subfolders with `_order.json`
- [x] 3.11 Implement `ProjectService.updateProject()` — update `_project.json` fields
- [x] 3.12 Implement `ProjectService.archiveProject()` — set `archived: true`
- [x] 3.13 Write unit tests for `ProjectService`
- [x] 3.14 Implement `CardService.listCards()` — read all lanes, parse frontmatter, respect `_order.json` ordering
- [x] 3.15 Implement `CardService.getCard()` — find card across lanes, return full parsed content
- [x] 3.16 Implement `CardService.createCard()` — slugify title, handle duplicate slugs, write `.md` file, update `_order.json`
- [x] 3.17 Implement `CardService.moveCard()` — move file between lane folders, update both `_order.json` files
- [x] 3.18 Implement `CardService.archiveCard()` — move card to `04-archive/`
- [x] 3.19 Implement `CardService.reorderCards()` — replace `_order.json` for a lane
- [x] 3.20 Write unit tests for `CardService`
- [x] 3.21 Implement `TaskService.addTask()` — append checklist item to card
- [x] 3.22 Implement `TaskService.setTaskChecked()` — toggle task checked state
- [x] 3.23 Write unit tests for `TaskService`

## Phase 4: Backend API Routes & Server

- [x] 4.1 Set up Elysia server in `src/server.ts` with `DEVPLANNER_WORKSPACE` validation and CORS
- [x] 4.2 Implement project routes in `src/routes/projects.ts` (`GET /api/projects`, `POST /api/projects`, `PATCH /api/projects/:projectSlug`, `DELETE /api/projects/:projectSlug`)
- [x] 4.3 Implement card routes in `src/routes/cards.ts` (`GET /api/projects/:projectSlug/cards`, `POST /api/projects/:projectSlug/cards`, `GET /api/projects/:projectSlug/cards/:cardSlug`, `DELETE /api/projects/:projectSlug/cards/:cardSlug`, `PATCH /api/projects/:projectSlug/cards/:cardSlug/move`)
- [x] 4.4 Implement task routes in `src/routes/tasks.ts` (`POST /api/projects/:projectSlug/cards/:cardSlug/tasks`, `PATCH /api/projects/:projectSlug/cards/:cardSlug/tasks/:taskIndex`)
- [x] 4.5 Implement reorder route (`PATCH /api/projects/:projectSlug/lanes/:laneSlug/order`)
- [x] 4.6 Add input validation with descriptive error responses (`ApiError` with `message` + `expected`)
- [x] 4.7 Verify all endpoints work end-to-end with manual testing or a quick smoke test

## Phase 5: Seed Data

- [x] 5.1 Implement `src/seed.ts` — idempotent script that creates the 3 seed projects (Media Manager, LM API, Memory API) with all cards and tasks from the spec
- [x] 5.2 Run seed script and verify data structure on disk

## Phase 6: Frontend Foundation

- [x] 6.0 Set up unified dev script — add `concurrently`, update `package.json` scripts
- [x] 6.1 Set up `frontend/src/api/client.ts` — typed API client for all endpoints
- [x] 6.2 Set up `frontend/src/types/index.ts` — mirror backend types
- [x] 6.3 Set up `frontend/src/utils/cn.ts` — Tailwind classname merge utility
- [x] 6.4 Install additional dependencies (`framer-motion`, `clsx`, `tailwind-merge`)
- [x] 6.5 Set up Zustand store in `frontend/src/store/index.ts` — full `DevPlannerStore`
- [x] 6.6 Update `frontend/src/index.css` — custom scrollbars, checkbox styles, focus rings
- [x] 6.7 Update `frontend/tailwind.config.ts` — lane colors, animations, custom timing
- [x] 6.8 Set up `App.tsx` with `MainLayout` structure

## Phase 7: UI Components & Layout Shell

- [x] 7.1 Build `ui/Collapsible.tsx` — animated expand/collapse container (CSS grid technique)
- [x] 7.2 Build `ui/Badge.tsx` — reusable badge for tags, priority, assignee
- [x] 7.3 Build `ui/Button.tsx` and `ui/IconButton.tsx` — styled button variants
- [x] 7.4 Build `layout/Header.tsx` — logo/title, sidebar toggle with animation
- [x] 7.5 Build `layout/ProjectSidebar.tsx` — collapsible project list, active highlight
- [x] 7.6 Build `layout/MainLayout.tsx` — CSS grid layout wrapper
- [x] 7.7 Wire up project loading on mount, project switching

## Phase 8: Kanban Board & Cards

- [x] 8.1 Build `kanban/LaneHeader.tsx` — color bar, display name, add button
- [x] 8.2 Build `tasks/TaskProgressBar.tsx` — visual progress with animation
- [x] 8.3 Build `tasks/TaskCheckbox.tsx` — interactive checkbox with check animation
- [x] 8.4 Build `kanban/CardPreviewTasks.tsx` — collapsible pending tasks list
- [x] 8.5 Build `kanban/CardPreview.tsx` — full card with collapsible tasks, hover effects
- [x] 8.6 Build `kanban/CollapsedLaneTab.tsx` — vertical text label, click to expand
- [x] 8.7 Build `kanban/CardList.tsx` — card container within lane
- [x] 8.8 Build `kanban/Lane.tsx` — combines header + card list
- [x] 8.9 Build `kanban/KanbanBoard.tsx` — renders lanes, handles collapsed state
- [x] 8.10 Build `kanban/QuickAddCard.tsx` — inline title input with animation
- [x] 8.11 Wire up card loading, display in lanes with `_order.json` ordering

## Phase 9: Card Detail Panel

- [x] 9.1 Build `card-detail/CardDetailPanel.tsx` — slide-in panel with Framer Motion
- [x] 9.2 Build `card-detail/CardDetailHeader.tsx` — title, close button, lane indicator
- [x] 9.3 Build `card-detail/CardMetadata.tsx` — assignee, priority, tags, dates
- [x] 9.4 Build `card-detail/CardContent.tsx` — render Markdown via `marked`
- [x] 9.5 Build `tasks/TaskList.tsx` — full task list with add/remove animations
- [x] 9.6 Build `tasks/AddTaskInput.tsx` — inline task creation
- [x] 9.7 Add placeholder section for future attachments
- [x] 9.8 Wire up panel open on card click, close on X/Escape/outside click

## Phase 9.5: UI Refinements

- [ ] 9.5.1 Implement inline "New Project" form in ProjectSidebar — Collapsible expand, name + description inputs, create/cancel with keyboard support
- [ ] 9.5.2 Replace PriorityBadge in CardPreview with colored left border accent (red/amber/green by priority level)
- [ ] 9.5.3 Add status-based visual cues to CardPreview — subtle ring + brighter background for in-progress, blocked, review, testing cards

## Phase 10: Drag-and-Drop

- [ ] 10.1 Integrate `@dnd-kit/core` and `@dnd-kit/sortable` into `KanbanBoard` and `Lane`
- [ ] 10.2 Implement within-lane reordering (calls `reorderCards` API)
- [ ] 10.3 Implement cross-lane card moves (calls `moveCard` API)
- [ ] 10.4 Add visual drag feedback (placeholder, drag overlay)

## Phase 11: Responsive Design & Polish

- [ ] 11.1 Implement responsive breakpoints from spec section 5.7 (desktop, tablet, mobile)
- [ ] 11.2 Sidebar: hidden by default on tablet/mobile, overlay mode
- [ ] 11.3 Detail panel: full-width on tablet, full-screen on mobile
- [ ] 11.4 Lanes: horizontal scroll on tablet, stacked on mobile
- [ ] 11.5 Visual polish pass — hover states, transitions, focus rings, loading states

## Phase 12: Backend WebSocket Infrastructure

- [ ] 12.1 Create `src/services/websocket.service.ts` — connection manager with client tracking (`Map<clientId, ws>`), per-project subscription model (`Map<projectSlug, Set<clientId>>`), and broadcast functionality
- [ ] 12.2 Add WebSocket message types to `src/types/index.ts` — `WebSocketMessage` interface, event type union (`card:updated`, `task:toggled`, `lane:reordered`, etc.)
- [ ] 12.3 Create `src/routes/websocket.ts` — Elysia WebSocket route (`/api/ws`), handle `open`/`close`/`message` lifecycle, route `subscribe`/`unsubscribe` messages to WebSocketService
- [ ] 12.4 Register WebSocket route in `src/server.ts`, initialize WebSocketService singleton
- [ ] 12.5 Implement heartbeat/ping-pong for connection health monitoring (30s interval, disconnect stale clients)
- [ ] 12.6 Test WebSocket connection with wscat — verify connect, subscribe, and broadcast messages work

## Phase 13: File Watching Service

- [ ] 13.1 Create `src/services/file-watcher.service.ts` — recursive `fs.watch` on workspace directory with 100ms debouncing
- [ ] 13.2 Implement file filtering — only process changes to `*.md`, `_project.json`, `_order.json` files, ignore temp files (`.tmp`, `.swp`)
- [ ] 13.3 Implement change detection logic — determine event type from file path (`card:updated` vs `project:updated` vs `lane:reordered`)
- [ ] 13.4 Parse changed files to extract delta data — read updated file, diff against event type to build minimal payload
- [ ] 13.5 Integrate FileWatcherService with WebSocketService — broadcast parsed events to clients subscribed to affected project
- [ ] 13.6 Initialize FileWatcherService in `src/server.ts` with workspace path from ConfigService
- [ ] 13.7 Handle edge cases — file rename/delete detection, directory creation/deletion, race conditions between write and read

## Phase 14: Frontend WebSocket Client

- [ ] 14.1 Create `frontend/src/services/websocket.service.ts` — WebSocket client wrapper with message handler registration (`on(eventType, handler)`)
- [ ] 14.2 Implement auto-reconnection with exponential backoff (1s → 2s → 4s → 8s → 16s → 32s max, reset on success, max 5 attempts)
- [ ] 14.3 Create `frontend/src/hooks/useWebSocket.ts` — React hook for WebSocket lifecycle, auto-subscribe to active project on change
- [ ] 14.4 Add WebSocket message types to `frontend/src/types/index.ts` — mirror backend types
- [ ] 14.5 Initialize WebSocket connection in `App.tsx`, subscribe to active project when it changes
- [ ] 14.6 Add connection state indicator to UI — show connected/disconnected/reconnecting status
- [ ] 14.7 Test auto-connect and auto-reconnect — verify reconnection after server restart

## Phase 15: Zustand Store Integration (Delta Updates)

- [ ] 15.1 Add WebSocket state to Zustand store — `wsConnected`, `wsReconnecting`, `setWsConnected()`
- [ ] 15.2 Implement `handleCardUpdated` — deep merge frontmatter changes, replace content/tasks for affected card
- [ ] 15.3 Implement `handleCardCreated` — insert new card into correct lane at specified position
- [ ] 15.4 Implement `handleCardMoved` — remove from source lane, insert into target lane at position
- [ ] 15.5 Implement `handleCardDeleted` — remove card from lane, close detail panel if viewing deleted card
- [ ] 15.6 Implement `handleTaskToggled` — update specific task checked state and card progress summary in both cardsByLane and activeCard
- [ ] 15.7 Implement `handleLaneReordered` — replace order array for affected lane
- [ ] 15.8 Implement `handleProjectUpdated` — merge partial project config with existing project in projects list
- [ ] 15.9 Wire all WebSocket message handlers to store actions in `useWebSocket` hook
- [ ] 15.10 Test delta updates end-to-end — edit card file externally, verify UI updates correctly without refresh

## Phase 16: Real-Time Activity History

- [ ] 16.1 Create `src/services/history.service.ts` — in-memory event log with max 50 events per project, `HistoryEvent` type with timestamp, action, description, metadata
- [ ] 16.2 Integrate HistoryService with FileWatcherService — record events on file changes (task completed, card moved, card created, card archived)
- [ ] 16.3 Create `src/routes/history.ts` — REST endpoint `GET /api/projects/:slug/history?limit=50` to fetch recent history
- [ ] 16.4 Register history routes in `src/server.ts`, add `HistoryEvent` types to `src/types/index.ts`
- [ ] 16.5 Broadcast `history:event` via WebSocket when new events are recorded
- [ ] 16.6 Add history state to Zustand store — `historyEvents[]`, `addHistoryEvent()`, `loadHistory()`
- [ ] 16.7 Create `frontend/src/components/ActivityLog.tsx` — real-time event display grouped by time period (Today, Yesterday, This Week)
- [ ] 16.8 Implement `history:event` WebSocket handler to append events to store in real-time
- [ ] 16.9 Render ActivityLog in sidebar or collapsible panel
- [ ] 16.10 Test activity log — verify events appear in real-time as cards/tasks are modified

## Phase 17: Production Optimization & Testing

- [ ] 17.1 Implement message batching for rapid changes (200ms window, send single combined update)
- [ ] 17.2 Add environment variable for WebSocket URL (`VITE_WS_URL`) with sensible default
- [ ] 17.3 Add graceful degradation — show warning if WebSocket unavailable, fallback to manual refresh
- [ ] 17.4 Write unit tests for WebSocketService (connection tracking, subscription, broadcast)
- [ ] 17.5 Write unit tests for FileWatcherService (change detection, debouncing, file filtering)
- [ ] 17.6 Test multi-client scenario — two browser tabs, verify both receive updates simultaneously
- [ ] 17.7 Test reconnection scenario — stop/restart server, verify clients auto-reconnect and re-subscribe
- [ ] 17.8 Test edge cases — rapid file changes, corrupted files, file rename vs delete, large payloads

---

## Post-MVP (not in scope for initial build)

- [ ] MCP server (reuses service layer)
- [ ] Markdown editor for card content
- [ ] Search and filter
- [ ] Reference/file management
- [ ] Optimistic locking conflict UI
