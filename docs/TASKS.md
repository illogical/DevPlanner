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

- [x] 9.5.1 Implement inline "New Project" form in ProjectSidebar — Collapsible expand, name + description inputs, create/cancel with keyboard support
- [x] 9.5.2 Replace PriorityBadge in CardPreview with colored left border accent (red/amber/green by priority level)
- [x] 9.5.3 Add status-based visual cues to CardPreview — subtle ring + brighter background for in-progress, blocked, review, testing cards
    -[x] 9.5.4 The style being used for this is fairly ugly. Remove this style since there is already a separate lane indicating in-progress cards.
    -[x] 9.5.5 Give the task completion graph and counts more visual weight style/layout to make it more obvious that a card has tasks started instead of adjusting the background color of the card when in-progress

## Phase 10: Drag-and-Drop

- [x] 10.1 Integrate `@dnd-kit/core` and `@dnd-kit/sortable` into `KanbanBoard` and `Lane`
- [x] 10.2 Implement within-lane reordering (calls `reorderCards` API)
- [x] 10.3 Implement cross-lane card moves (calls `moveCard` API)
- [x] 10.4 Add visual drag feedback (placeholder, drag overlay)

## Phase 11: Responsive Design & Polish

- [x] 11.1 Implement responsive breakpoints from spec section 5.7 (desktop, tablet, mobile)
- [x] 11.2 Sidebar: hidden by default on tablet/mobile, overlay mode
- [x] 11.3 Detail panel: full-width on tablet, full-screen on mobile
- [x] 11.4 Lanes: horizontal scroll on tablet, stacked on mobile
- [x] 11.5 Visual polish pass — hover states, transitions, focus rings, loading states
- [x] 11.6 Remember the last project selected, ideally tracked from the backend API so that all clients load the last-selected project

## Phase 11.5: Frontend Visual Indicators for Background Changes

- [x] 11.5.1 Create change indicator infrastructure in Zustand store — `changeIndicators` Map with unique IDs, auto-expiration, cleanup timer
- [x] 11.5.2 Add `addChangeIndicator()`, `removeChangeIndicator()`, `clearExpiredIndicators()` store actions
- [x] 11.5.3 Enhance `TaskCheckbox` component with flash and pulse animations using Framer Motion's `useAnimate`
- [x] 11.5.4 Integrate task toggle animations with store indicators — green flash (300ms) + scale pulse (400ms)
- [x] 11.5.5 Create `AnimatedCardWrapper` component for card-level animations — detects indicator types via store queries
- [x] 11.5.6 Implement card creation animation — slide-in effect with blue glow border (2s, spring physics)
- [x] 11.5.7 Implement card movement animation — amber glow border (1.5s)
- [x] 11.5.8 Add store action integration — `createCard`, `moveCard`, `toggleTask` automatically trigger visual indicators
- [x] 11.5.9 Optimize effect dependencies and prevent duplicate animations via ref tracking
- [x] 11.5.10 Add HMR cleanup for setInterval to prevent memory leaks in development
- [x] 11.5.11 Document feature in `docs/features/visual-indicators.md` with specifications and implementation phases
- [x] 11.5.12 Manual testing — verify task toggle, card creation, and card movement animations work correctly

## Phase 12: Backend WebSocket Infrastructure

**Note:** Frontend visual indicators (Phase 11.5) are already implemented and will automatically work with WebSocket updates once this backend infrastructure is in place. The store actions that trigger animations (`createCard`, `moveCard`, `toggleTask`) will be called by WebSocket handlers without any additional frontend code changes.

- [x] 12.1 Create `src/services/websocket.service.ts` — connection manager with client tracking (`Map<clientId, ws>`), per-project subscription model (`Map<projectSlug, Set<clientId>>`), and broadcast functionality
- [x] 12.2 Add WebSocket message types to `src/types/index.ts` — `WebSocketMessage` interface, event type union (`card:updated`, `task:toggled`, `lane:reordered`, etc.)
- [x] 12.3 Create `src/routes/websocket.ts` — Elysia WebSocket route (`/api/ws`), handle `open`/`close`/`message` lifecycle, route `subscribe`/`unsubscribe` messages to WebSocketService
- [x] 12.4 Register WebSocket route in `src/server.ts`, initialize WebSocketService singleton
- [x] 12.5 Implement heartbeat/ping-pong for connection health monitoring (30s interval, disconnect stale clients)
- [x] 12.6 Test WebSocket connection with wscat — verify connect, subscribe, and broadcast messages work

## Phase 13: File Watching Service

- [x] 13.1 Create `src/services/file-watcher.service.ts` — recursive `fs.watch` on workspace directory with 100ms debouncing
- [x] 13.2 Implement file filtering — only process changes to `*.md`, `_project.json`, `_order.json` files, ignore temp files (`.tmp`, `.swp`)
- [x] 13.3 Implement change detection logic — determine event type from file path (`card:updated` vs `project:updated` vs `lane:reordered`)
- [x] 13.4 Parse changed files to extract delta data — read updated file, diff against event type to build minimal payload
- [x] 13.5 Integrate FileWatcherService with WebSocketService — broadcast parsed events to clients subscribed to affected project
- [x] 13.6 Initialize FileWatcherService in `src/server.ts` with workspace path from ConfigService
- [x] 13.7 Handle edge cases — file rename/delete detection, directory creation/deletion, race conditions between write and read

## Phase 14: Frontend WebSocket Client

**Feature doc:** `docs/features/websocket-frontend.md`

- [x] 14.1 Add WebSocket message types to `frontend/src/types/index.ts` — mirror backend `WebSocketMessage`, `WebSocketEvent`, `WebSocketEventType`, plus typed event data interfaces (`CardCreatedData`, `CardUpdatedData`, `CardMovedData`, `CardDeletedData`, `LaneReorderedData`, `ProjectUpdatedData`)
- [x] 14.2 Create `frontend/src/services/websocket.service.ts` — standalone WebSocket client class (no React dependency) with `connect()`, `disconnect()`, `subscribe(projectSlug)`, `unsubscribe(projectSlug)`, `on(eventType, handler)`, `off(eventType, handler)`, state tracking (`connected`/`disconnected`/`reconnecting`), heartbeat pong response, and dev-mode direct URL construction (`ws://localhost:17103/api/ws`)
- [x] 14.3 Implement auto-reconnection with exponential backoff in WebSocket client — 1s → 2s → 4s → 8s → 16s delays, max 5 attempts, reset counter on success, re-subscribe to active project on reconnect, emit `reconnected` pseudo-event for data refresh
- [x] 14.4 Create `frontend/src/hooks/useWebSocket.ts` — React hook that manages client singleton lifecycle, subscribes to active project on `activeProjectSlug` change (unsubscribe old → subscribe new), registers all event handlers (Phase 15), tracks connection state, refreshes data (`loadCards`/`loadHistory`) on reconnect
- [x] 14.5 Initialize `useWebSocket()` hook in `App.tsx` — call at root level, pass connection state to header
- [x] 14.6 Create `frontend/src/components/ui/ConnectionIndicator.tsx` — green dot (connected, auto-hides after 3s), amber pulsing dot + tooltip (reconnecting), red dot + "click to retry" (disconnected). Add to `Header.tsx` near activity toggle button
- [x] 14.7 Test WebSocket client — verify: auto-connect on load, project subscription, project switch re-subscribes, pong response to server pings, reconnection after server restart (observe backoff timing), connection indicator states, data refresh after reconnect

## Phase 15: Zustand Store Integration (Delta Updates)

**Feature doc:** `docs/features/websocket-frontend.md`

**Note:** Frontend visual indicators (Phase 11.5) will automatically animate when these delta update handlers are called. No additional animation code needed in this phase.

- [x] 15.1 Add WebSocket state to Zustand store — `wsConnected: boolean`, `wsReconnecting: boolean`, `setWsConnected()`, `setWsReconnecting()`. Add self-echo dedup tracking: `_recentLocalActions: Map<string, number>`, `_recordLocalAction(key)` (records `${eventType}:${cardSlug}` with timestamp), `_isRecentLocalAction(key)` (returns true if action within last 3 seconds)
- [x] 15.2 Add self-echo dedup to existing store actions — `createCard()`, `moveCard()`, `toggleTask()`, `reorderCards()`, `archiveCard()` should call `_recordLocalAction()` after their API calls so WebSocket echoes are detected
- [x] 15.3 Implement `wsHandleCardUpdated(data: CardUpdatedData)` — find card in `cardsByLane[lane]` and replace, search all lanes as fallback, reload `activeCard` from API if slug matches, add `card:updated` change indicator if not a recent local action. Detect task progress changes: compare old vs new `taskProgress` and emit `task:toggled` indicator if changed
- [x] 15.4 Implement `wsHandleCardCreated(data: CardCreatedData)` — check if card already exists (dedup), prepend to `cardsByLane[lane]` if new, add `card:created` change indicator if not a recent local action
- [x] 15.5 Implement `wsHandleCardMoved(data: CardMovedData)` — remove card from `cardsByLane[sourceLane]`, insert into `cardsByLane[targetLane]`, fall back to API fetch if card data missing, update `activeCard` lane display if slug matches, add `card:moved` change indicator if not a recent local action
- [x] 15.6 Implement `wsHandleCardDeleted(data: CardDeletedData)` — remove card from `cardsByLane[lane]`, close detail panel if `activeCard?.slug` matches
- [x] 15.7 Implement `wsHandleLaneReordered(data: LaneReorderedData)` — reorder `cardsByLane[lane]` according to new order array (sort existing cards by position in order array)
- [x] 15.8 Implement `wsHandleProjectUpdated(data: ProjectUpdatedData)` — find and merge updated config into `projects[]`, update derived state if active project matches
- [x] 15.9 Wire all handlers in `useWebSocket` hook — register `client.on()` for each event type mapping to store handlers: `card:created` → `wsHandleCardCreated`, `card:updated` → `wsHandleCardUpdated`, `card:moved` → `wsHandleCardMoved`, `card:deleted` → `wsHandleCardDeleted`, `lane:reordered` → `wsHandleLaneReordered`, `project:updated` → `wsHandleProjectUpdated`, `history:event` → `addHistoryEvent`. Clean up with returned unsubscribe functions
- [x] 15.10 Test delta updates end-to-end — verify: (1) external file edit updates UI within ~200ms, (2) external task toggle updates checkbox + progress bar, (3) multi-tab sync works (create card in tab 1 → appears in tab 2 with animation), (4) self-echo dedup prevents double animations for local actions, (5) detail panel updates when viewing a card modified externally, (6) reconnection refreshes stale data


## Phase 18: MCP (Model Context Protocol) Server Integration

**Feature doc:** `docs/features/mcp-server.md`

### Core Infrastructure (Tasks 18.1-18.6)

- [ ] 18.1 Install MCP SDK and set up project structure
  - [ ] Add `@modelcontextprotocol/sdk` to `package.json` dependencies
  - [ ] Add `"mcp": "bun src/mcp-server.ts"` script to `package.json`
  - [ ] Create `src/mcp/` directory for MCP-specific code
  - [ ] Create `src/mcp/__tests__/` directory for tests

- [ ] 18.2 Create MCP type definitions in `src/mcp/types.ts`
  - [ ] Define tool input/output TypeScript interfaces (17 tools)
  - [ ] Define resource content type interfaces (3 resources)
  - [ ] Define MCP error response structure with suggestions array
  - [ ] Export all types for use in handlers and tests

- [ ] 18.3 Create JSON schemas in `src/mcp/schemas.ts`
  - [ ] Define JSON Schema for all 17 tool inputs (following MCP spec format)
  - [ ] Include descriptions, required fields, enums, defaults
  - [ ] Export as const objects for SDK registration
  - [ ] Add JSDoc comments linking to tool handler functions

- [ ] 18.4 Create `src/mcp-server.ts` — stdio transport entry point
  - [ ] Import MCP Server and StdioServerTransport from SDK
  - [ ] Initialize server with name "devplanner" and version "1.0.0"
  - [ ] Configure capabilities: `{ tools: {}, resources: {} }`
  - [ ] Register request handlers: ListTools, CallTool, ListResources, ReadResource
  - [ ] Set up error handling with logging
  - [ ] Connect stdio transport and start server
  - [ ] Add graceful shutdown on SIGINT/SIGTERM

- [ ] 18.5 Set up error handling utilities in `src/mcp/errors.ts`
  - [ ] Create `MCPError` class extending Error with code, message, suggestions
  - [ ] Define error code constants (PROJECT_NOT_FOUND, CARD_NOT_FOUND, etc.)
  - [ ] Implement `formatMCPError()` helper for consistent error responses
  - [ ] Add `wrapServiceError()` to convert service exceptions to MCP format
  - [ ] Include LLM-friendly error messages with corrective actions

- [ ] 18.6 Test basic MCP server connectivity
  - [ ] Run `bun src/mcp-server.ts` and verify server starts
  - [ ] Test with MCP Inspector: `mcp-inspector bun src/mcp-server.ts`
  - [ ] Verify ListTools returns empty array (before tool registration)
  - [ ] Verify ListResources returns empty array (before resource registration)
  - [ ] Verify server responds to ping/capabilities check

### Core CRUD Tool Handlers (Tasks 18.7-18.16)

- [ ] 18.7 Implement `list_projects` tool in `src/mcp/tool-handlers.ts`
  - [ ] Create `handleListProjects()` function calling ProjectService.listProjects()
  - [ ] Add `includeArchived` parameter filtering
  - [ ] Return `{ projects: ProjectSummary[], total: number }`
  - [ ] Register tool in mcp-server.ts with schema from schemas.ts
  - [ ] Add unit test with mocked ProjectService

- [ ] 18.8 Implement `get_project` tool
  - [ ] Create `handleGetProject()` calling ProjectService.getProject()
  - [ ] Add PROJECT_NOT_FOUND error handling
  - [ ] Return full ProjectConfig with lane configuration
  - [ ] Register tool and schema
  - [ ] Add unit test for valid and invalid project slugs

- [ ] 18.9 Implement `create_project` tool
  - [ ] Create `handleCreateProject()` calling ProjectService.createProject()
  - [ ] Validate name parameter (non-empty, < 100 chars)
  - [ ] Generate slug from name using existing slug utility
  - [ ] Return created project with default lanes
  - [ ] Register tool and schema
  - [ ] Add unit test verifying project file creation

- [ ] 18.10 Implement `list_cards` tool
  - [ ] Create `handleListCards()` calling CardService.listCards()
  - [ ] Implement filtering: lane, priority, assignee, tags, status
  - [ ] Filter in-memory after service call (service returns all)
  - [ ] Return `{ cards: CardSummary[], total: number }`
  - [ ] Register tool and schema
  - [ ] Add unit tests for each filter combination

- [ ] 18.11 Implement `get_card` tool
  - [ ] Create `handleGetCard()` calling CardService.getCard()
  - [ ] Add CARD_NOT_FOUND error with suggestions
  - [ ] Return full Card object with content and tasks
  - [ ] Register tool and schema
  - [ ] Add unit test with valid/invalid card slugs

- [ ] 18.12 Implement `create_card` tool
  - [ ] Create `handleCreateCard()` calling CardService.createCard()
  - [ ] Map MCP input to CreateCardInput type
  - [ ] Default lane to '01-upcoming' if not specified
  - [ ] Return created Card object
  - [ ] Register tool and schema
  - [ ] Add unit test verifying card file + order.json update

- [ ] 18.13 Implement `update_card` tool
  - [ ] Create `handleUpdateCard()` calling CardService.updateCard()
  - [ ] Only update provided fields (merge with existing frontmatter)
  - [ ] Add CARD_NOT_FOUND error handling
  - [ ] Return updated Card object
  - [ ] Register tool and schema
  - [ ] Add unit test verifying selective field updates

- [ ] 18.14 Implement `move_card` tool
  - [ ] Create `handleMoveCard()` calling CardService.moveCard()
  - [ ] Validate targetLane is valid lane slug
  - [ ] Add CARD_NOT_FOUND and INVALID_LANE error handling
  - [ ] Return moved Card object with updated lane field
  - [ ] Register tool and schema
  - [ ] Add unit test verifying file move + both order.json updates

- [ ] 18.15 Implement `add_task` tool
  - [ ] Create `handleAddTask()` calling TaskService.addTask()
  - [ ] Validate text parameter (non-empty, < 500 chars)
  - [ ] Return `{ task: TaskItem, card: { slug, taskProgress } }`
  - [ ] Register tool and schema
  - [ ] Add unit test verifying task appended to markdown

- [ ] 18.16 Implement `toggle_task` tool
  - [ ] Create `handleToggleTask()` calling TaskService.setTaskChecked()
  - [ ] If `checked` param omitted, toggle current state
  - [ ] Add TASK_INDEX_OUT_OF_RANGE error handling
  - [ ] Return `{ task: TaskItem, card: { slug, taskProgress } }`
  - [ ] Register tool and schema
  - [ ] Add unit test for toggle, explicit check, explicit uncheck

### Smart/Workflow Tool Handlers (Tasks 18.17-18.23)

- [ ] 18.17 Implement `get_board_overview` tool
  - [ ] Create `handleGetBoardOverview()` aggregating data from multiple services
  - [ ] For each lane: count cards, calculate task stats, priority breakdown
  - [ ] Compute overall summary: total cards, total tasks, completion rate
  - [ ] Return rich nested structure (see feature doc for schema)
  - [ ] Register tool and schema
  - [ ] Add unit test with multi-card project verifying calculations

- [ ] 18.18 Implement `get_next_tasks` tool
  - [ ] Create `handleGetNextTasks()` calling CardService.listCards()
  - [ ] Filter cards by assignee and lane if provided
  - [ ] Extract unchecked tasks from filtered cards
  - [ ] Sort by: card priority (high→medium→low), then lane order (in-progress first)
  - [ ] Apply limit parameter (default 20, max 100)
  - [ ] Return `{ tasks: Array<{ task, card, project }>, total }`
  - [ ] Register tool and schema
  - [ ] Add unit test verifying prioritization and filtering

- [ ] 18.19 Implement `batch_update_tasks` tool
  - [ ] Create `handleBatchUpdateTasks()` parsing card once
  - [ ] Apply all task updates in single pass through markdown
  - [ ] Validate all taskIndex values before applying any changes
  - [ ] Use MarkdownService.setTaskChecked() repeatedly, write file once
  - [ ] Return `{ updated: TaskItem[], card: { slug, taskProgress } }`
  - [ ] Register tool and schema
  - [ ] Add unit test verifying atomic update (all or none on error)

- [ ] 18.20 Implement `search_cards` tool
  - [ ] Create `handleSearchCards()` calling CardService.listCards()
  - [ ] Implement case-insensitive search across: title, content, tags
  - [ ] If `fields` param provided, limit search to those fields
  - [ ] Include matched field names and content excerpt in results
  - [ ] Apply limit parameter (default 20, max 100)
  - [ ] Return `{ results: Array<{ card, matchedFields, excerpt }>, total, query }`
  - [ ] Register tool and schema
  - [ ] Add unit test with various search queries

- [ ] 18.21 Implement `update_card_content` tool
  - [ ] Create `handleUpdateCardContent()` calling CardService.updateCard()
  - [ ] If `append=true`, read existing content and concatenate
  - [ ] If `append=false`, replace entire content section
  - [ ] Preserve frontmatter and tasks section
  - [ ] Return updated Card object
  - [ ] Register tool and schema
  - [ ] Add unit test for replace and append modes

- [ ] 18.22 Implement `get_project_progress` tool
  - [ ] Create `handleGetProjectProgress()` aggregating card/task data
  - [ ] Group statistics by lane: card count, task counts, completion rate
  - [ ] Group statistics by priority: card count, task counts, completion rate
  - [ ] Compute overall totals and completion rate
  - [ ] Return nested structure (see feature doc for schema)
  - [ ] Register tool and schema
  - [ ] Add unit test verifying percentage calculations

- [ ] 18.23 Implement `archive_card` tool
  - [ ] Create `handleArchiveCard()` as wrapper around handleMoveCard()
  - [ ] Hardcode targetLane to '04-archive'
  - [ ] Return archived Card object
  - [ ] Register tool and schema
  - [ ] Add unit test verifying same behavior as move_card

### Resource Providers (Tasks 18.24-18.26)

- [ ] 18.24 Create resource provider infrastructure in `src/mcp/resource-providers.ts`
  - [ ] Implement `parseResourceUri()` to extract projectSlug and cardSlug from URI
  - [ ] Create `listResourceTemplates()` returning URI patterns with descriptions
  - [ ] Add error handling for malformed URIs
  - [ ] Export provider functions for registration

- [ ] 18.25 Implement `devplanner://projects` resource
  - [ ] Create `handleProjectsResource()` calling ProjectService.listProjects()
  - [ ] Return JSON with projects array (same as list_projects tool output)
  - [ ] Set mimeType to 'application/json'
  - [ ] Register resource in mcp-server.ts
  - [ ] Add unit test verifying JSON structure

- [ ] 18.26 Implement `devplanner://projects/{slug}` and `devplanner://projects/{slug}/cards/{cardSlug}` resources
  - [ ] Create `handleProjectResource()` calling getProject() + listCards()
  - [ ] Return full board state: project config + all cards grouped by lane
  - [ ] Create `handleCardResource()` calling CardService.getCard()
  - [ ] Return full card details: frontmatter + content + tasks
  - [ ] Register both resources with URI templates
  - [ ] Add unit tests for valid and invalid URIs

### Testing & Integration (Tasks 18.27-18.30)

- [ ] 18.27 Write comprehensive unit tests in `src/mcp/__tests__/tool-handlers.test.ts`
  - [ ] Mock all service dependencies (ProjectService, CardService, TaskService)
  - [ ] Test all 17 tool handlers with valid inputs
  - [ ] Test error cases: not found, validation errors, out of range
  - [ ] Verify error responses include suggestions array
  - [ ] Achieve >90% code coverage for tool handlers

- [ ] 18.28 Write integration tests in `src/mcp/__tests__/mcp-server.integration.test.ts`
  - [ ] Create test workspace with seed data
  - [ ] Start MCP server programmatically (not stdio, use in-memory transport)
  - [ ] Execute full agent workflow: create project → create card → add tasks → toggle tasks → move card
  - [ ] Verify filesystem changes persist (check .md files and order.json)
  - [ ] Test concurrent tool calls (create multiple cards in parallel)
  - [ ] Verify WebSocket events are broadcast (requires mocking WebSocketService)

- [ ] 18.29 Manual testing with MCP Inspector
  - [ ] Install MCP Inspector: `bun add -g @modelcontextprotocol/inspector`
  - [ ] Launch server: `mcp-inspector bun src/mcp-server.ts`
  - [ ] Test each tool with sample inputs in web UI
  - [ ] Verify resources are browsable and return expected data
  - [ ] Test error cases: invalid slugs, out of range indexes
  - [ ] Screenshot tool list and example responses for documentation

- [ ] 18.30 Test with real AI clients
  - [ ] Configure Claude Desktop with DevPlanner MCP server
  - [ ] Ask Claude: "What projects are available in DevPlanner?"
  - [ ] Ask Claude: "Create a test card and add 3 tasks to it"
  - [ ] Verify Claude can discover tools, call them correctly, handle errors
  - [ ] Test Claude Code CLI integration (add to .claudecode/config.json)
  - [ ] Document any AI prompting patterns that work particularly well

### Documentation & Configuration (Tasks 18.31-18.33)

- [ ] 18.31 Update project documentation files
  - [ ] Add MCP section to `README.md` with setup instructions
  - [ ] Update `docs/SPECIFICATION.md` with MCP architecture overview
  - [ ] Create example config files: `examples/claude-desktop-config.json`, `examples/claude-code-config.json`
  - [ ] Add troubleshooting section to `docs/features/mcp-server.md`

- [ ] 18.32 Add MCP server to development workflow
  - [ ] Update `bun run dev` to optionally start MCP server alongside REST API
  - [ ] Add environment variable `MCP_ENABLED` (default false)
  - [ ] Add logging to distinguish MCP tool calls from REST API calls
  - [ ] Document how to run both transports simultaneously

- [ ] 18.33 Create demo video/GIF showing agent workflow
  - [ ] Record Claude Desktop or Claude Code CLI using MCP tools
  - [ ] Show: list projects → get next tasks → claim card → toggle tasks → move to complete
  - [ ] Add to README.md and docs/features/mcp-server.md
  - [ ] Include example prompts that work well with the MCP tools

---

# Post-MVP / Future Enhancements

## Near-term priorities (after Phase 18)

### Documentation Maintenance
- [ ] Review and update SPECIFICATION.md to reflect all Phase 12-16 features
- [ ] Review and update README.md feature list and API overview
- [ ] Ensure TASKS.md is in sync with actual implementation status
- [ ] Add architecture diagrams for WebSocket and history features

## Later priorities

### Task Status & Collaboration
- [ ] Add task status tracking (not-started, in-progress, complete) beyond checkboxes
- [ ] Design task assignment/claiming mechanism to prevent work conflicts
- [ ] Implement task-level locking or "claimed by" indicator
- [ ] Add UI for marking individual tasks as in-progress
- [ ] Support multiple agents working on different tasks within same card

### History Persistence & Performance
- [ ] Implement persistent JSON file storage for history events
- [ ] Design rolling file mechanism for last 50 events per project
- [ ] Add in-memory write queue to prevent file lock contention
- [ ] Centralize history updates to single async writer
- [ ] Handle rapid successive updates (e.g., checking off multiple tasks quickly)
- [ ] Add history file rotation and archival strategy

### User Attribution & Multi-Agent Support
- [ ] Add user/agent identification to all history events
- [ ] Track who made each card/task modification
- [ ] Design authentication/session mechanism for user tracking
- [ ] Add "modified by" metadata to cards and tasks
- [ ] Implement agent identity system (user vs agent1 vs agent2)
- [ ] Add activity log filtering by user/agent
- [ ] Brainstorm requirements for multi-agent, multi-project workflows
- [ ] Design conflict resolution for concurrent agent modifications

### Content & Features
- [ ] Markdown editor for card content
- [ ] Search and filter
- [ ] Reference/file management
- [ ] Optimistic locking conflict UI
- [ ] Add identifier to each card for a shortcut for referring to cards in conversation


## Phase 16: Real-Time Activity History

- [x] 16.1 Create `src/services/history.service.ts` — in-memory event log with max 50 events per project, `HistoryEvent` type with timestamp, action, description, metadata
- [x] 16.2 Integrate HistoryService with FileWatcherService — record events on file changes (task completed, card moved, card created, card archived)
- [x] 16.3 Create `src/routes/history.ts` — REST endpoint `GET /api/projects/:slug/history?limit=50` to fetch recent history
- [x] 16.4 Register history routes in `src/server.ts`, add `HistoryEvent` types to `src/types/index.ts`
- [x] 16.5 Broadcast `history:event` via WebSocket when new events are recorded
- [x] 16.6 Add history state to Zustand store — `historyEvents[]`, `addHistoryEvent()`, `loadHistory()`
- [x] 16.7 Create `frontend/src/components/ActivityLog.tsx` — real-time event display grouped by time period (Today, Yesterday, This Week)
- [ ] 16.8 Implement `history:event` WebSocket handler to append events to store in real-time (requires Phase 14 WebSocket client)
- [x] 16.9 Render ActivityLog in sidebar or collapsible panel (slide-out panel with tabs and animations)
- [ ] 16.10 Test activity log — verify events appear in real-time as cards/tasks are modified (requires Phase 14-15 for WebSocket support)


## Phase 17: Production Optimization & Testing

- [ ] 17.1 Implement message batching for rapid changes (200ms window, send single combined update)
- [ ] 17.2 Add environment variable for WebSocket URL (`VITE_WS_URL`) with sensible default
- [ ] 17.3 Add graceful degradation — show warning if WebSocket unavailable, fallback to manual refresh
- [ ] 17.4 Write unit tests for WebSocketService (connection tracking, subscription, broadcast)
- [ ] 17.5 Write unit tests for FileWatcherService (change detection, debouncing, file filtering)
- [ ] 17.6 Test multi-client scenario — two browser tabs, verify both receive updates simultaneously
- [ ] 17.7 Test reconnection scenario — stop/restart server, verify clients auto-reconnect and re-subscribe
- [ ] 17.8 Test edge cases — rapid file changes, corrupted files, file rename vs delete, large payloads