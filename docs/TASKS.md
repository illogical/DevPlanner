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

**Feature spec:** `docs/features/mcp-server.md`

**Status:** Core infrastructure complete (18.1-18.6), tool handlers complete (18.7-18.23), verification script implemented (18.27)

- [x] 18.1-18.6: Core Infrastructure
  - [x] MCP SDK setup, type definitions, JSON schemas, stdio transport, error handling
  - [x] Basic MCP server connectivity verified

- [x] 18.7-18.23: Tool Implementation
  - [x] All 17 tool handlers implemented and registered
  - [x] All 3 resource providers implemented
  - [x] Unit tests for all tool handlers

- [ ] 18.24-18.26: Resource Providers (See mcp-server.md for details)

- [~] 18.27-18.30: Testing & Integration
  - [x] Verification script for Ollama/LMAPI testing (see `docs/features/mcp-verification.md`)
  - [x] Agent performance tracking with 4-metric scoring system
  - [x] Delivery robot scenario for structured workflow testing
  - [ ] Integration tests with MCP Inspector
  - [ ] Real-world testing with Claude Desktop/Code

- [ ] 18.31-18.33: Documentation & Demo
  - [x] Scripts README with usage instructions
  - [ ] Claude Desktop and Claude Code configuration examples
  - [ ] Demo video/GIF showing agent workflows

*MVP Phases End*

---

# Completed Near-Term Features

These were planned as enhancements after the MVP and are now done:

- [x] **Card Identifiers** — sequential `PREFIX-N` IDs auto-assigned at creation, displayed in UI
- [x] **Description Editor & Tags** — inline Markdown editor, `TagInput` combobox with autocomplete
- [x] **Title / Priority / Assignee editing** — inline editing, priority dropdown, delete confirmation
- [x] **Search & Highlight (v1)** — header search box, title + task highlighting with yellow rings
- [x] **Reference/File Management** — upload, associate, download; `CardFiles` and `FilesPanel` components
- [x] **API Improvements (Phase 20)** — history `since` filter, cross-project feed, stats endpoint, `blockedReason`, task timestamps, `digestAnchor`
- [x] **Real-Time Activity History** — in-memory event log, ActivityLog panel, WebSocket broadcast
- [x] **URL / Link Management on cards** — first-class link objects with label, URL, description; per-resource FIFO operation queue

---

# Upcoming Enhancements — Priority Order

---

## Priority 1: Search Improvements (Command Palette)

**Spec:** `docs/features/search-palette.md` *(to be created)*

Replace the current inline header search with a keyboard-driven command-palette overlay (inspired by VS Code Command Palette, JetBrains Search Everywhere, and Raycast). A global shortcut opens the palette; results appear as you type with context labels; arrow keys navigate; Enter activates; Esc dismisses.

### Search Palette UI
- [ ] Create `SearchPalette.tsx` overlay — full-screen dimmed backdrop, centered rounded panel, real-time result list with Framer Motion entrance/exit animations
- [ ] Register global keyboard shortcut (`Ctrl+K` / `Cmd+K` or TBD) to open the palette; `Esc` to close
- [ ] Remove the current inline header search input; replace with a small "Search" button/chip showing the shortcut hint
- [ ] Arrow-key navigation with looping focus; `Enter` to activate; mouse hover also works
- [ ] Show a context label chip on every result (see Result Types below)
- [ ] Group results by type with collapsible section headers (max ~5 per group, "Show more" expander)
- [ ] Show a text snippet with the matched portion highlighted for description / task / file-description / link-description results
- [ ] Debounce input at 150 ms; minimum 2 characters before querying

### Result Types & Context Labels

| Label | What it matches |
|-------|----------------|
| `Card` | Card title, card identifier (e.g. `MP-42`) |
| `Task` | Checklist item text within a card |
| `Description` | Card body / Markdown content |
| `Tag` | Card tag values |
| `Assignee` | Card assignee field |
| `File` | Attached file name |
| `File Description` | Attached file description metadata |
| `Link` | Link URL (hostname + path) |
| `Link Label` | Link display title |
| `Link Description` | Link description metadata |
| `Lane` | Lane display name (for direct lane navigation) |
| `Project` | Project name / description |

- [ ] Finalize label taxonomy (review with user, add/remove labels as needed)
- [ ] Design label chip styles — small colored pill, one distinctive color per label type

### Fuzzy Search Engine
- [ ] Implement `fuzzy.ts` utility in `frontend/src/utils/` — score-based matching: exact substring > word-prefix > initials (e.g. `"cp"` matches `"Card Preview"`)
- [ ] Apply fuzzy scoring to local in-memory results for instant feel; backend call supplements with description / file / link fields
- [ ] Min score threshold to suppress low-confidence matches

### Backend Search API
- [ ] Extend `GET /api/projects/:slug/cards/search` to include card description body, file names, file descriptions, link URLs, link labels, link descriptions, and assignees in the match scope
- [ ] Return structured results: `{ type, cardSlug, laneSlug, field, snippet, score }` per match
- [ ] Add `GET /api/projects/:slug/search?q=&types=` — type-filtered version for agent use
- [ ] Add `GET /api/search?q=&projects=` — global cross-project search (agent-facing)
- [ ] Keep `GET /api/projects/:slug/cards/search?q=` backward-compatible for existing clients

### Navigation Behavior
- [ ] **Card / Identifier** — switch to card's project + lane, open card detail panel
- [ ] **Task** — open card detail panel, scroll to Tasks section, briefly pulse-highlight the matched task row
- [ ] **Description** — open card detail panel, switch to edit/view mode, scroll to matched text and highlight
- [ ] **Tag / Assignee / Priority** — open card detail panel, scroll to metadata section, highlight the matching field row
- [ ] **File / File Description** — open card detail panel, scroll to Files section, highlight the matching file row
- [ ] **Link URL / Label / Description** — open card detail panel, scroll to Links section, highlight the matching link row
- [ ] **Lane** — scroll Kanban board to that lane, briefly pulse the lane header
- [ ] **Project** — switch active project in sidebar

### Post-Navigation Highlight Cleanup
- [ ] Auto-clear row highlights after 2–3 seconds (use existing `AnimatedCardWrapper` infrastructure where possible)
- [ ] Implement a `highlightTarget` store field (`{ section, index }`) consumed by card detail panel sections to trigger highlight animations

### Future: RAG Integration
- [ ] Add `GET /api/projects/:slug/search?mode=semantic` stub (returns `501 Not Implemented` until embedding pipeline is ready)
- [ ] Document integration point with Obsidian/Scribe RAG in `docs/features/rag-integration.md`
- [ ] Plan cross-project relationship queries (DevPlanner implementation tracking ↔ Obsidian documentation)

---

## Priority 2: Project-Level Background Documents

**Spec:** `docs/features/project-readme.md` *(to be created)*

Each project gains a `_README.md` in its workspace directory for higher-level context — project goals, architecture notes, key decisions. Both humans and AI agents read and edit it.

### Storage & API
- [ ] Design storage: `_README.md` Markdown file alongside `_project.json`
- [ ] `GET /api/projects/:slug/readme` — returns `{ content: string, updatedAt: string }`
- [ ] `PUT /api/projects/:slug/readme` — full replace of content
- [ ] Expose `updatedAt` from file `mtime`

### UI
- [ ] Collapsible README section in `ProjectSidebar` below the project name — shows first paragraph as preview when collapsed
- [ ] Rendered Markdown in read mode; textarea with Save/Cancel in edit mode (pencil icon, reuse `CardContent.tsx` pattern)
- [ ] Show word count / last-updated timestamp in collapsed preview

### Agent Integration
- [ ] Add MCP tool `get_project_readme` (read access)
- [ ] Add MCP tool `update_project_readme` (write access, append or replace)
- [ ] Update `devplanner` skill (`SKILL.md`) to note: read project README before planning work
- [ ] Update `devplanner-insights` skill to include README first paragraph in digests

---

## Priority 3: URL Link Enhancements

URL links are already implemented. These are the next improvements:

- [ ] **Open Graph metadata auto-fetch** — `GET /api/og?url=` backend endpoint fetches page title + description; used to auto-populate link label when user pastes a URL into the Add Link form
- [ ] **Link preview on hover** — show URL hostname + favicon badge when hovering a link chip in card preview
- [ ] **Link ordering** — drag-to-reorder links within the card detail Links section (reuse `@dnd-kit/sortable`)
- [ ] **Link categories** — optional tag on a link (`reference`, `design`, `issue`, `pr`, `doc`) with small colored icon
- [ ] **Search integration** — link URLs, labels, and descriptions indexed in the search palette (covered in Priority 1)

---

## Priority 4: Reference File Management — Testing & Integration

Backend and frontend implementation are complete. Remaining:

- [ ] End-to-end test: file upload/download through UI
- [ ] Verify WebSocket synchronization across clients
- [ ] Test MCP tools with AI agent workflows
- [ ] Manual testing with various file types (text, scripts, PDFs)

---

## Priority 5: AI Agent File Creation ("Add File to Card")

**Feature Doc:** `docs/features/add-file-to-card.md`

Atomic "create text file and link to card" operation — closes the gap where agents can read files but not create them.

**Backend**
- [ ] Add `addFileToCard()` to `FileService` (validate card exists, create file, associate)
- [ ] Add `POST /api/projects/:projectSlug/cards/:cardSlug/files` REST endpoint (JSON body with `filename` + `content`; also supports multipart)
- [ ] Add MCP tool `add_file_to_card` — schema in `schemas.ts`, handler in `tool-handlers.ts`
- [ ] Register in `mcp-server.ts` (18 → 19 tools)
- [ ] Add `AddFileToCardInput` / `AddFileToCardOutput` types to `src/types/index.ts`

**Testing**
- [ ] 6 unit test cases in `file.service.test.ts`
- [ ] 6 MCP tool tests in `mcp/__tests__/add-file-to-card.test.ts`
- [ ] Act 7B in `scripts/e2e-demo.ts`

**Frontend**
- [ ] Add `addFileToCard()` to `frontend/src/api/client.ts` filesApi
- [ ] Mirror types in `frontend/src/types/index.ts`

---

## Priority 6: Multi-Agent Support

**Spec:** `docs/features/multi-agent.md` *(to be created)*

Enable multiple named agents and users to identify themselves as assignees. An agent running a session should be able to discover its own registered name from the API rather than free-typing it.

### Agent / Actor Identity
- [ ] Accept optional `X-DevPlanner-Actor` header on all API write requests; persist into `HistoryEvent.actor`
- [ ] MCP server reads `DEVPLANNER_AGENT_NAME` env var and injects it automatically as the actor header
- [ ] Display `actor` in the Activity Log UI (small badge next to event description)
- [ ] Tool descriptions updated: *"Use the name in `DEVPLANNER_AGENT_NAME`, or call `list_agents` to discover available names."*

### Agent Registry
- [ ] `_agents.json` in workspace root — list of `{ name, type: "human"|"agent", color? }`
- [ ] Seed with a default entry for the primary agent
- [ ] `GET /api/agents` — returns registered agents/users
- [ ] `POST /api/agents` — register a new agent/user
- [ ] MCP tool `list_agents` — agent discovers available names before assigning itself

### Assignee UI
- [ ] Replace free-text assignee input with a combobox backed by `/api/agents`
- [ ] Show type indicator (icon differentiating human vs. agent)
- [ ] "Create new" option to register a previously unknown agent on the fly

### Atomic Card Claiming (Tier 2, see `feature-priorities.md`)
- [ ] MCP tool `claim_card` — atomically checks if card is unclaimed, sets assignee, records history; returns `CARD_ALREADY_CLAIMED` error if taken
- [ ] MCP tool `release_card` — clears assignee atomically
- [ ] Optimistic locking (`version` field + `If-Match` header on card updates) — prerequisite: concurrency guard already implemented

---

## Medium Priority: Sub-task Support

- [ ] Support indented markdown checkboxes (`  - [ ]` for level 2, `    - [ ]` for level 3) in `MarkdownService`
- [ ] Tab / Shift+Tab indenting in the TaskList UI
- [ ] Visual indentation in `TaskList` and `CardPreviewTasks`
- [ ] Task progress counts all nesting levels

---

## Medium Priority: WebSocket Smart Merge

**Spec:** `docs/features/websocket-smart-merge.md`

Prevents WebSocket updates from interrupting mid-edit by merging only non-edited fields.

- [ ] Add `activeCardEdits` to Zustand store (`isEditingTitle`, `isEditingContent`, `isEditingMetadata`)
- [ ] Track editing state in `CardDetailHeader`, `CardContent`, `CardMetadata`
- [ ] `card:updated` WebSocket handler merges only fields not currently being edited
- [ ] Clear edit state on panel close

---

## Medium Priority: History Persistence & Performance

- [ ] Persist history events to `_history.json` per project (write queue to avoid lock contention)
- [ ] Rolling rotation: keep last 200 events, archive older
- [ ] Handle rapid successive updates (e.g. checking off multiple tasks quickly)
- [ ] Implement `history:event` WebSocket handler in frontend to append events in real-time
- [ ] Test activity log real-time updates end-to-end

---

## Medium Priority: Dashboard View

The `/api/projects/:slug/stats` endpoint already computes WIP count, backlog depth, blocked count, and completion velocity. This is a pure frontend addition.

- [ ] New frontend route (`/dashboard`) showing project stats as metric cards
- [ ] Per-project sparkline for completion velocity (last 30 days)
- [ ] "Control tower" view useful when multiple agents are active simultaneously

---

## Lower Priority: Task Status & Collaboration

- [ ] Task status beyond checkboxes: `not-started` / `in-progress` / `complete`
- [ ] Task assignment / "claimed by" indicator
- [ ] UI for marking individual tasks as in-progress
- [ ] Task-level locking for concurrent agent safety

---

## Lower Priority: Documentation Maintenance

- [ ] Review and update `SPECIFICATION.md` to reflect Phases 12–20 and all completed enhancements
- [ ] Review and update `README.md` feature list and API overview
- [ ] Add architecture diagrams for WebSocket and history features
- [ ] Claude Desktop and Claude Code MCP configuration examples

---

## Future: MCP (Phase 18 — Remaining Items)

**Feature spec:** `docs/features/mcp-server.md`

- [ ] 18.24–18.26: Resource Providers (see mcp-server.md for details)
- [ ] Integration tests with MCP Inspector
- [ ] Real-world testing with Claude Desktop / Claude Code
- [ ] Demo video / GIF showing agent workflows

### MCP Verification & Tuning
- [ ] Test verification script with real Ollama models (qwen2.5, llama3.1, mistral)
- [ ] Collect baseline scores for different models; iterate on tool descriptions
- [ ] Add more test scenarios (AI/ML pipeline, web app, IoT system)
- [ ] LMAPI and OpenRouter providers for multi-model comparison
- [ ] A/B test different system prompts
- [ ] Track rarely-used tools; identify confusing tool combinations
- [ ] "Best practices" guide for MCP tool usage based on collected metrics

---

## Future: User Attribution

- [ ] `actor` field on all history events (groundwork in Priority 6 above)
- [ ] "Modified by" metadata on cards and tasks
- [ ] Activity log filtering by user / agent
- [ ] Design conflict resolution for concurrent agent modifications

---

## Future: RAG Integration

**Spec:** `docs/features/rag-integration.md` *(to be created)*

Long-term integration of embedding-based semantic search backed by Obsidian (managed by Scribe agent).

- [ ] Define API contract for external RAG providers
- [ ] Design bridge protocol between DevPlanner and Obsidian knowledge base
- [ ] `GET /api/projects/:slug/search?mode=semantic` stub (501 until ready)
- [ ] Plan cross-project relationship queries: implementation tracking ↔ documentation

---

## Future: Production Optimization

- [ ] Message batching for rapid changes (200 ms window, single combined WebSocket update)
- [ ] `VITE_WS_URL` environment variable with sensible default
- [ ] Graceful degradation when WebSocket unavailable (warning banner, manual refresh)
- [ ] Unit tests for `WebSocketService` and `FileWatcherService`
- [ ] Multi-client and reconnection edge-case tests

---

## Future: Card Templates

- [ ] Store reusable card structures (bug, feature, spike) in `_templates/` directory
- [ ] Expose via API and MCP so agents can create cards from templates
- [ ] Template picker in `QuickAddCard` UI

---

## Future: Webhook / Event Sink

- [ ] POST events to a configured external URL (for CI, Slack, custom dashboards)
- [ ] Complements WebSocket for consumers that can't maintain a persistent connection
