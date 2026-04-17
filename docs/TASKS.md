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

**Spec:** `docs/features/search-palette.md`

Replace the current inline header search with a keyboard-driven command-palette overlay (inspired by VS Code Command Palette, JetBrains Search Everywhere, and Raycast). A global shortcut opens the palette; results appear as you type with context labels; arrow keys navigate; Enter activates; Esc dismisses.

### Search Palette UI
- [x] Create `SearchPalette.tsx` overlay — full-screen dimmed backdrop, centered rounded panel, real-time result list with Framer Motion entrance/exit animations
- [x] Register global keyboard shortcut (`Ctrl+K` / `Cmd+K`) to open the palette; `Esc` to close
- [x] Remove the current inline header search input; replace with a small "Search" button/chip showing the shortcut hint
- [x] Arrow-key navigation with looping focus; `Enter` to activate; mouse hover also works
- [x] Show a context label chip on every result (see Result Types below)
- [x] Group results by type with collapsible section headers (max ~5 per group, "Show more" expander)
- [x] Show a text snippet with the matched portion highlighted for description / task / file-description / link-description results
- [x] Debounce input at 150 ms; minimum 2 characters before querying

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

- [x] Finalize label taxonomy (review with user, add/remove labels as needed)
- [x] Design label chip styles — small colored pill, one distinctive color per label type

### Fuzzy Search Engine
- [x] Implement `fuzzy.ts` utility in `frontend/src/utils/` — score-based matching: exact substring > word-prefix > initials (e.g. `"cp"` matches `"Card Preview"`)
- [x] Apply fuzzy scoring to local in-memory results for instant feel; backend call supplements with description / file / link fields
- [x] Min score threshold to suppress low-confidence matches

### Backend Search API
- [x] Extend `GET /api/projects/:slug/cards/search` to include card description body, file names, file descriptions, link URLs, link labels, link descriptions, and assignees in the match scope
- [x] Return structured results: `{ type, cardSlug, laneSlug, field, snippet, score }` per match
- [x] Add `GET /api/projects/:slug/search?q=&types=` — type-filtered version for agent use
- [x] Add `GET /api/search?q=&projects=` — global cross-project search (agent-facing)
- [x] Keep `GET /api/projects/:slug/cards/search?q=` backward-compatible for existing clients

### Navigation Behavior
- [x] **Card / Identifier** — switch to card's project + lane, open card detail panel
- [x] **Task** — open card detail panel, scroll to Tasks section, briefly pulse-highlight the matched task row
- [x] **Description** — open card detail panel, switch to edit/view mode, scroll to matched text and highlight
- [x] **Tag / Assignee / Priority** — open card detail panel, scroll to metadata section, highlight the matching field row
- [x] **File / File Description** — open card detail panel, scroll to Files section, highlight the matching file row
- [x] **Link URL / Label / Description** — open card detail panel, scroll to Links section, highlight the matching link row
- [ ] **Lane** — scroll Kanban board to that lane, briefly pulse the lane header
- [ ] **Project** — switch active project in sidebar

### Post-Navigation Highlight Cleanup
- [x] Auto-clear row highlights after 2–3 seconds (use existing `AnimatedCardWrapper` infrastructure where possible)
- [x] Implement a `highlightTarget` store field (`{ section, index }`) consumed by card detail panel sections to trigger highlight animations

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

## Phase 21: Diff Viewer

**Feature spec:** `docs/features/diff-viewer.md`

### Backend

- [x] 21.1 Add `readArtifactContent(relativePath)` to `src/services/vault.service.ts` with path traversal guard
- [x] 21.2 Create `src/routes/vault.ts` — `GET /api/vault/content` serving raw vault file content
- [x] 21.3 Create `src/routes/config.ts` — `GET /api/config/public` returning `{ artifactBaseUrl }`
- [x] 21.4 Register `vaultRoute` and `configRoute` in `src/server.ts`

### Frontend: Dependencies & Routing

- [x] 21.5 Add `react-router-dom`, `highlight.js`, and `diff` to `frontend/package.json`
- [x] 21.6 Wrap app in `BrowserRouter` in `frontend/src/main.tsx`
- [x] 21.7 Add `Routes` with `/` (existing Kanban) and `/diff` (DiffViewerPage) in `frontend/src/App.tsx`

### Frontend: API client

- [x] 21.8 Add `vaultApi.getContent()` and `publicConfigApi.get()` to `frontend/src/api/client.ts`

### Frontend: Utilities & Hooks

- [x] 21.9 Create `frontend/src/utils/diffUrl.ts` — `buildDiffUrl()` helper
- [x] 21.10 Create `frontend/src/hooks/useSyncScroll.ts` — synchronized scroll hook

### Frontend: Diff Components

- [x] 21.11 Create `frontend/src/components/diff/DiffHeader.tsx` — page title + back link
- [x] 21.12 Create `frontend/src/components/diff/DiffToolbar.tsx` — language, wrap, sync controls, swap, clear
- [x] 21.13 Create `frontend/src/components/diff/DiffLine.tsx` — individual line with highlight.js + change type color
- [x] 21.14 Create `frontend/src/components/diff/DiffContent.tsx` — scrollable lines container with sync scroll support
- [x] 21.15 Create `frontend/src/components/diff/DropZone.tsx` — drag-and-drop / file-picker / paste input
- [x] 21.16 Create `frontend/src/components/diff/DiffPaneHeader.tsx` — filename, copy, file picker button
- [x] 21.17 Create `frontend/src/components/diff/DiffPane.tsx` — single pane composing header + dropzone + content
- [x] 21.18 Create `frontend/src/components/diff/DiffLayout.tsx` — two-pane CSS grid container
- [x] 21.19 Create `frontend/src/pages/DiffViewerPage.tsx` — top-level page, URL param reading, diff computation

### Frontend: Card Detail Integration

- [x] 21.20 Update `frontend/src/components/card-detail/CardLinks.tsx` — fetch `artifactBaseUrl` from config, add "Open in Diff Viewer" button on vault artifact links

### Documentation

- [x] 21.21 Update `README.md` — add Diff Viewer to features list and API overview table
- [x] 21.22 Update `frontend/README.md` — add diff components to component tree and tech stack table
- [x] 21.23 Update `docs/SPECIFICATION.md` — add section 3.13 for new endpoints and update frontend architecture

### Follow-up: Generic naming

- [x] 21.24 Rename env vars `OBSIDIAN_BASE_URL`/`OBSIDIAN_VAULT_PATH` → `ARTIFACT_BASE_URL`/`ARTIFACT_BASE_PATH` across all code and docs

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

---
---

# Phase 22: Doc Manager — Markdown Viewer, Editor, Git Integration & File Browser

**Feature spec folder:** `docs/features/doc-manager/`

Merges VaultPad's Markdown viewer, editor, Git workflow, and file browser into DevPlanner's React 19 + Zustand + Tailwind CSS 4 architecture. Operates on vault artifact files under `ARTIFACT_BASE_PATH`. Includes enhancements to the existing Diff Viewer (Phase 21) with Git-aware comparison modes.

## Phase 22.1: App Navigation

**Spec:** `docs/features/doc-manager/01-navigation.md`

Top-level navigation bar enabling switching between Projects, View, Edit, and Compare views. Replaces the standalone `DiffHeader` with shared navigation.

- [x] 22.1.1 Create `AppNavBar` component — horizontal tab bar (Projects | View | Edit | Compare) with icons and `NavLink` active styling
- [x] 22.1.2 Create `AppShell` layout component — wraps Header + AppNavBar + route content + drawer slot
- [x] 22.1.3 Refactor `App.tsx` routing — add `/viewer`, `/editor` routes within `AppShell`, replace standalone diff page
- [x] 22.1.4 Modify `Header` for multi-view support — conditional project selector, file path display, git dot, save button
- [x] 22.1.5 Remove `DiffHeader` component — replaced by shared `AppNavBar`
- [x] 22.1.6 Route-aware `useWebSocket` behavior — project subscription only on Kanban view

## Phase 22.2: Markdown Viewer

**Spec:** `docs/features/doc-manager/02-markdown-viewer.md`

Read-only Markdown viewer with rich rendering: YAML frontmatter display, color-coded headings, syntax-highlighted code blocks, key-value pair styling. Reuses `marked` and `highlight.js` (existing deps).

- [x] 22.2.1 Create `MarkdownPreview` shared component — `marked` with custom renderer for headings, code, key-value lines
- [x] 22.2.2 Create frontmatter parser utility — `parseFrontmatter()` in `frontend/src/utils/frontmatter.ts`
- [x] 22.2.3 Create `FrontmatterDisplay` component — 2-column grid with styled key/value pairs
- [x] 22.2.4 Create `ViewerPage` — loads file from `?path=`, renders FrontmatterDisplay + MarkdownPreview
- [x] 22.2.5 Add `ViewerPage` to router — `/viewer` route within `AppShell`
- [x] 22.2.6 Add `docSlice` to Zustand store — `docFilePath`, `docContent`, `loadDocFile()`, `clearDoc()`
- [x] 22.2.7 Add vault file API methods — `getFile()` returning path + content + updatedAt

## Phase 22.3: Markdown Editor

**Spec:** `docs/features/doc-manager/03-markdown-editor.md`

Side-by-side Markdown editor (raw text left, live preview right) with save workflow, dirty detection, unsaved changes protection, and download.

- [x] 22.3.1 Create `EditorPane` component — monospace textarea, Tab key support, Ctrl+S intercept
- [x] 22.3.2 Create `EditorLayout` component — 2-column CSS grid with editor left, preview right, responsive stacking
- [x] 22.3.3 Create `EditorPage` — file loading, edit state, save workflow, dirty detection, `beforeunload` guard
- [x] 22.3.4 Add vault file save API — `PUT /api/vault/file` backend endpoint + `VaultService.writeArtifactContent()` + frontend `vaultApi.saveFile()`
- [x] 22.3.5 Extend `docSlice` for editor state — `docEditContent`, `docLastSavedContent`, `docIsDirty`, `docSaveState`, `saveDocFile()`
- [x] 22.3.6 Add `EditorPage` to router — `/editor` route within `AppShell`
- [x] 22.3.7 Wire save button in `Header` — save state indicator (idle/saving/saved/error), dirty indicator on tab
- [x] 22.3.8 Add download button — export current file as `.md` to local filesystem

## Phase 22.4: File Browser

**Spec:** `docs/features/doc-manager/04-file-browser.md`

Bottom slide-out file browser with 3-column layout (roots → subfolders → files). Shared across viewer, editor, and diff views. Dynamic root discovery from vault directory.

- [x] 22.4.1 Create vault tree API endpoint — `GET /api/vault/tree` + `VaultService.listTree()` + frontend `vaultApi.getTree()`
- [x] 22.4.2 Create `fileBrowserSlice` in Zustand store — drawer state, folder tree, active path, load/navigate actions
- [x] 22.4.3 Create `FileBrowserDrawer` component — animated bottom slide-up panel (Framer Motion)
- [x] 22.4.4 Create `FileBrowserColumns` component — 3-column CSS grid with root/subfolder/file columns
- [x] 22.4.5 Create `FolderColumn` component — folder list with count badges and active highlighting
- [x] 22.4.6 Create `FileColumn` component — file list with smart name display, timestamps, git status dots
- [x] 22.4.7 Create `FileBreadcrumb` component — clickable path segments with truncation
- [x] 22.4.8 Create filename parser utility — `parseVaultFilename()` for timestamped filenames
- [x] 22.4.9 Integrate drawer into `AppShell` — render below routes, toggle button in nav bar
- [x] 22.4.10 Add file navigation behavior — context-aware navigation (viewer/editor/diff/kanban)
- [x] 22.4.11 Add back/forward navigation history — `docBackHistory`, `docForwardHistory`, back/forward buttons in header

## Phase 22.5: Git Integration

**Spec:** `docs/features/doc-manager/05-git-integration.md`

Single-file Git operations: stage, unstage, commit, discard. Status indicators in header and file browser. Configurable auto-refresh.

### Backend
- [x] 22.5.1 Create `GitService` — `git status`, `git add`, `git reset`, `git restore`, `git commit` via `Bun.spawnSync` with path traversal guard
- [x] 22.5.2 Create vault git routes — `/api/vault/git/status`, `/api/vault/git/statuses`, `/api/vault/git/stage`, `/api/vault/git/unstage`, `/api/vault/git/discard`, `/api/vault/git/commit`
- [x] 22.5.3 Create git diff endpoint — `GET /api/vault/git/diff?path=&mode=working|staged`

### Frontend
- [x] 22.5.4 Add `gitSlice` to Zustand store — git statuses, commit panel state, actions for stage/unstage/commit/discard
- [x] 22.5.5 Add git API methods to client — `gitApi.getStatus()`, `.stage()`, `.unstage()`, `.discard()`, `.commit()`, `.getDiff()`
- [x] 22.5.6 Create `GitStatusDot` component — colored circle with tooltip, loading spinner
- [x] 22.5.7 Create `GitCommitPanel` component — floating panel with commit message, context-sensitive action buttons
- [x] 22.5.8 Integrate git status into header — dot + click-to-open commit panel
- [x] 22.5.9 Integrate git status into file browser — batch-fetch statuses, per-file dots
- [x] 22.5.10 Auto-refresh git statuses — interval timer with Page Visibility API, post-save/post-operation refresh
- [x] 22.5.11 Create `GitSettingsPanel` component — refresh interval slider, localStorage persistence

## Phase 22.6: Diff Viewer Enhancements

**Spec:** `docs/features/doc-manager/06-diff-viewer-enhancements.md`

Git-aware comparison modes for the existing Diff Viewer: working vs committed, staged vs committed, working vs staged. Mode selector in toolbar, auto-detection from file state.

### Backend
- [ ] 22.6.1 Add git file content endpoint — `GET /api/vault/git/show?path=&ref=HEAD|:0` for committed/staged content
- [ ] 22.6.2 Extend git diff endpoint — support `working`, `staged`, `working-staged` modes with labels

### Frontend
- [ ] 22.6.3 Add diff mode state — `DiffMode` type, mode selection and content fetching
- [ ] 22.6.4 Create `DiffModeSelector` component — segmented button group in toolbar
- [ ] 22.6.5 Add git content fetching to DiffViewerPage — fetch from git endpoints based on active mode
- [ ] 22.6.6 Update `DiffPaneHeader` for mode-aware labels — "HEAD (committed)", "Working tree", "Staged (index)"
- [ ] 22.6.7 Add "View Diff" button to editor/viewer — navigates to diff with auto-selected mode
- [ ] 22.6.8 Smart mode auto-selection — based on file git state when opening diff

## Phase 22.7: Theme Switcher (Low Priority)

**Spec:** `docs/features/doc-manager/07-theme-switcher.md`

Optional theme toggle between DevPlanner's default Tailwind dark theme and VaultPad's navy blue/cyan palette. Initially scoped to Doc Manager views only.

- [ ] 22.7.1 Define CSS custom properties for both themes — `index.css` variable definitions
- [ ] 22.7.2 Create `useTheme` hook — read/write theme preference, apply `data-theme` attribute
- [ ] 22.7.3 Create `ThemeToggle` component — header button to switch themes
- [ ] 22.7.4 Update Doc Manager components to use theme variables

---

## Phase 23: Multi-File Git & Source Control Panel (Future)

**Depends on:** Phase 22.5 (single-file Git)

VS Code-style source control interface for batch Git operations. Long-term goal building on Phase 22.5's single-file foundation.

- [ ] 23.1 Source Control Panel — sidebar/drawer showing all modified/staged/untracked files grouped by state
- [ ] 23.2 Multi-select staging — checkbox selection for batch stage/unstage
- [ ] 23.3 Batch commit — single commit message for all staged files
- [ ] 23.4 Diff preview in staging — click a file in staging panel to view its diff
- [ ] 23.5 Git log viewer — recent commits with messages, authors, timestamps
- [ ] 23.6 Branch display — current branch name in header
- [ ] 23.7 Stash support — stash/pop working changes

---

## Documentation Updates (Post-Phase 22 Implementation)

After Doc Manager features are implemented, update:

- [ ] `README.md` — Add Doc Manager to features list, new API endpoints, updated architecture diagram
- [ ] `frontend/README.md` — Add doc components to component tree, new routes, new store slices
- [ ] `docs/SPECIFICATION.md` — Add vault/git API endpoint specs, frontend architecture updates, env var docs
- [ ] `CLAUDE.md` — Update architecture section with Doc Manager routes, services, and components
- [ ] Template picker in `QuickAddCard` UI

---

## Future: Webhook / Event Sink

- [ ] POST events to a configured external URL (for CI, Slack, custom dashboards)
- [ ] Complements WebSocket for consumers that can't maintain a persistent connection

---

## Phase 24: Card Dispatch — AI Coding Agent Integration

**Goal:** Users can dispatch any card to Claude Code CLI or Gemini CLI from the board UI. The agent works in an isolated git worktree, updates the board via DevPlanner MCP in real time, and auto-completes the card on success.

### Phase 24.1 — Backend Types & Core Services

- [x] 24.1.1 Create `src/types/dispatch.ts` — adapter, process, request, record, and WS event types
- [x] 24.1.2 Extend `src/types/index.ts` — `ProjectConfig.repoPath`, dispatch fields in `CardFrontmatter`, dispatch prefs in `Preferences`, new WebSocket and HistoryActionType values
- [x] 24.1.3 Create `src/services/worktree.service.ts` — `validateRepo`, `branchExists`, `create`, `remove`, `list`
- [x] 24.1.4 Create `src/services/prompt.service.ts` — `buildSystemPrompt`, `buildUserPrompt`, `buildPrompts`
- [x] 24.1.5 Create `src/services/adapters/adapter.interface.ts` — adapter interface + `getAdapter` registry
- [x] 24.1.6 Create `src/services/adapters/claude-cli.adapter.ts` — Claude Code CLI spawn with stream-json, CLAUDE.md, .mcp.json
- [x] 24.1.7 Create `src/services/adapters/gemini-cli.adapter.ts` — Gemini CLI spawn with .gemini/settings.json
- [x] 24.1.8 Create `src/services/dispatch.service.ts` — singleton orchestrator: dispatch, cancel, handleCompletion, ring buffer, WS broadcasting

### Phase 24.2 — Backend Routes & Project Integration

- [x] 24.2.1 Create `src/routes/dispatch.ts` — POST dispatch, GET status, POST cancel, GET output, GET all active
- [x] 24.2.2 Register dispatch routes in `src/server.ts`
- [x] 24.2.3 Add `repoPath` field validation to `PATCH /api/projects/:slug` in `src/routes/projects.ts`

### Phase 24.3 — Frontend Types, API, & Store

- [x] 24.3.1 Extend `frontend/src/types/index.ts` — mirror all backend type changes, add dispatch-specific types
- [x] 24.3.2 Add `dispatchApi` to `frontend/src/api/client.ts`
- [x] 24.3.3 Create `frontend/src/store/slices/dispatchSlice.ts` — activeDispatches, dispatchOutputs, modal state, WS handlers
- [x] 24.3.4 Add `DispatchSlice` to `frontend/src/store/types.ts`
- [x] 24.3.5 Compose dispatch slice in `frontend/src/store/index.ts`
- [x] 24.3.6 Handle dispatch WS events in `frontend/src/hooks/useWebSocket.ts`

### Phase 24.4 — Frontend UI Components

- [x] 24.4.1 Create `frontend/src/components/dispatch/DispatchModal.tsx` — agent, model, auto-PR fields; saves preferences
- [x] 24.4.2 Create `frontend/src/components/dispatch/DispatchStatus.tsx` — compact status badge (running/completed/failed/review)
- [x] 24.4.3 Create `frontend/src/components/dispatch/AgentOutputPanel.tsx` — live terminal-style output viewer with auto-scroll, download
- [x] 24.4.4 Add Dispatch button + status indicator to `CardDetailHeader.tsx`
- [x] 24.4.5 Add dispatch status badge + pulsing border to `CardPreview.tsx`

### Phase 24.5 — Documentation & Tests

- [x] 24.5.1 Update `.env.example` with `DISPATCH_WORKTREE_BASE`, `DISPATCH_TIMEOUT_MS`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- [x] 24.5.2 Add Card Dispatch section to `README.md` (setup, adapters, completion behavior, auto-PR)
- [x] 24.5.3 Add Phase 24 to `docs/TASKS.md` (this file)
- [x] 24.5.4 Create `src/__tests__/worktree.service.test.ts`
- [x] 24.5.5 Create `src/__tests__/prompt.service.test.ts`
- [x] 24.5.6 Create `src/__tests__/dispatch.service.test.ts`

---

## Phase 25: Card Context Endpoint

**Feature doc:** `docs/features/card-context/card-context_plan.md`

Provides a single "pull" endpoint for AI coding agents to retrieve everything needed to implement a card: ID, slug, description, task checklist, and full contents of linked vault artifact files. Agents reference cards by card ID (e.g. `DEV-42`).

### Backend — REST

- [x] 25.1 Create `src/utils/card-context.ts` — shared `buildCardContext()` helper: detects vault artifact links by `ARTIFACT_BASE_URL` prefix, reads file content via `VaultService`, formats `contextText` markdown, returns structured `CardContextResult`
- [x] 25.2 Create `src/routes/card-context.ts` — `GET /api/projects/:projectSlug/cards/:cardSlug/context`
- [x] 25.3 Register `cardContextRoutes` in `src/server.ts`

### MCP

- [x] 25.4 Add `GET_CARD_CONTEXT_SCHEMA` to `src/mcp/schemas.ts` — accepts `cardId` (preferred) or `projectSlug` + `cardSlug`
- [x] 25.5 Add `GetCardContextInput` to `src/mcp/types.ts`
- [x] 25.6 Add `handleGetCardContext` to `src/mcp/tool-handlers.ts` — resolves `cardId` by scanning all projects
- [x] 25.7 Register `get_card_context` tool in `src/mcp-server.ts`

### Documentation

- [x] 25.8 Create `docs/features/card-context/card-context_plan.md`
- [ ] 25.9 Update `README.md` — add `get_card_context` to MCP tools list and REST API overview
- [ ] 25.10 Update `docs/SPECIFICATION.md` — add `GET /api/projects/:slug/cards/:card/context` contract

---

## Phase 26: Flexible Card Lookup — Slug or Card ID

**Feature doc:** `docs/features/flexible-card-lookup/flexible-card-lookup_plan.md`

Allows all card endpoints and MCP tools to accept either a card slug (e.g. `feature-auth`) or a card ID (e.g. `DEV-42`, `dev42`, `dev-42`). Improves AI agent ergonomics — agents can reference the card by the ID they see on the board without needing to know the slug.

### Core

- [x] 26.1 Create `src/utils/card-resolver.ts` — `resolveCardRef()` (slug-first then ID-based scan) and `slugExists()` (pure file existence for slug uniqueness checking)
- [x] 26.2 Update `src/services/card.service.ts` — `findCardLane` delegates to `resolveCardRef`, returns `{ lane, slug }`; all 4 callers use resolved slug; `generateUniqueSlug` uses `slugExists`; improved error messages
- [x] 26.3 Update `src/services/task.service.ts` — replace private `findCardLane` with `resolveCardRef`; update 4 callers
- [x] 26.4 Update `src/services/link.service.ts` — replace private `findCardLane` with `resolveCardRef`; update 3 callers
- [x] 26.5 Fix `src/services/dispatch.service.ts` — use `card.slug` (resolved canonical slug) for branch name, worktree creation, env var, stored record
- [x] 26.6 Fix `src/routes/dispatch.ts` — GET/cancel/output handlers resolve `cardRef` via `cardService.getCard` before dispatch record lookup

### Documentation

- [x] 26.7 Update `src/mcp/schemas.ts` — all `cardSlug` field descriptions note ID acceptance
- [x] 26.8 Update `docs/openapi.yaml` — `cardSlug` parameter description updated
- [x] 26.9 Update `docs/SPECIFICATION.md` — slug-matching note updated to cover card IDs
- [x] 26.10 Update `README.md` — note added to MCP Server section

### Tests

- [x] 26.11 Add `describe('ID-based card lookup')` to `src/__tests__/card.service.test.ts` (10 cases)
- [x] 26.12 Add `describe('ID-based card lookup')` to `src/__tests__/task.service.test.ts` (4 cases)
- [x] 26.13 Add `describe('ID-based card lookup')` to `src/__tests__/link.service.test.ts` (4 cases)
