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

- [ ] 6.0 Set up unified dev script — add `concurrently`, update `package.json` scripts
- [ ] 6.1 Set up `frontend/src/api/client.ts` — typed API client for all endpoints
- [ ] 6.2 Set up `frontend/src/types/index.ts` — mirror backend types
- [ ] 6.3 Set up `frontend/src/utils/cn.ts` — Tailwind classname merge utility
- [ ] 6.4 Install additional dependencies (`framer-motion`, `clsx`, `tailwind-merge`)
- [ ] 6.5 Set up Zustand store in `frontend/src/store/index.ts` — full `DevPlannerStore`
- [ ] 6.6 Update `frontend/src/index.css` — custom scrollbars, checkbox styles, focus rings
- [ ] 6.7 Update `frontend/tailwind.config.ts` — lane colors, animations, custom timing
- [ ] 6.8 Set up `App.tsx` with `MainLayout` structure

## Phase 7: UI Components & Layout Shell

- [ ] 7.1 Build `ui/Collapsible.tsx` — animated expand/collapse container (CSS grid technique)
- [ ] 7.2 Build `ui/Badge.tsx` — reusable badge for tags, priority, assignee
- [ ] 7.3 Build `ui/Button.tsx` and `ui/IconButton.tsx` — styled button variants
- [ ] 7.4 Build `layout/Header.tsx` — logo/title, sidebar toggle with animation
- [ ] 7.5 Build `layout/ProjectSidebar.tsx` — collapsible project list, active highlight
- [ ] 7.6 Build `layout/MainLayout.tsx` — CSS grid layout wrapper
- [ ] 7.7 Wire up project loading on mount, project switching

## Phase 8: Kanban Board & Cards

- [ ] 8.1 Build `kanban/LaneHeader.tsx` — color bar, display name, add button
- [ ] 8.2 Build `tasks/TaskProgressBar.tsx` — visual progress with animation
- [ ] 8.3 Build `tasks/TaskCheckbox.tsx` — interactive checkbox with check animation
- [ ] 8.4 Build `kanban/CardPreviewTasks.tsx` — collapsible pending tasks list
- [ ] 8.5 Build `kanban/CardPreview.tsx` — full card with collapsible tasks, hover effects
- [ ] 8.6 Build `kanban/CollapsedLaneTab.tsx` — vertical text label, click to expand
- [ ] 8.7 Build `kanban/CardList.tsx` — card container within lane
- [ ] 8.8 Build `kanban/Lane.tsx` — combines header + card list
- [ ] 8.9 Build `kanban/KanbanBoard.tsx` — renders lanes, handles collapsed state
- [ ] 8.10 Build `kanban/QuickAddCard.tsx` — inline title input with animation
- [ ] 8.11 Wire up card loading, display in lanes with `_order.json` ordering

## Phase 9: Card Detail Panel

- [ ] 9.1 Build `card-detail/CardDetailPanel.tsx` — slide-in panel with Framer Motion
- [ ] 9.2 Build `card-detail/CardDetailHeader.tsx` — title, close button, lane indicator
- [ ] 9.3 Build `card-detail/CardMetadata.tsx` — assignee, priority, tags, dates
- [ ] 9.4 Build `card-detail/CardContent.tsx` — render Markdown via `marked`
- [ ] 9.5 Build `tasks/TaskList.tsx` — full task list with add/remove animations
- [ ] 9.6 Build `tasks/AddTaskInput.tsx` — inline task creation
- [ ] 9.7 Add placeholder section for future attachments
- [ ] 9.8 Wire up panel open on card click, close on X/Escape/outside click

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

---

## Post-MVP (not in scope for initial build)

- [ ] MCP server (reuses service layer)
- [ ] Markdown editor for card content
- [ ] Search and filter
- [ ] Reference/file management
- [ ] File watching + live reload via WebSocket/SSE
- [ ] Optimistic locking conflict UI
