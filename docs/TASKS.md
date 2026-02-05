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
- [ ] 1.6 Configure Tailwind CSS (dark mode palette from spec section 5.5)
- [ ] 1.7 Configure Vite proxy (`/api` → `http://localhost:17103`)
- [ ] 1.8 Add `package.json` scripts: `dev`, `test`, `seed`, `frontend`
- [ ] 1.9 Create `workspace/` directory, add to `.gitignore`
- [ ] 1.10 Create backend directory structure (`src/routes/`, `src/services/`, `src/types/`, `src/utils/`, `src/__tests__/`)

## Phase 2: Shared Types & Utilities

- [ ] 2.1 Define shared TypeScript interfaces in `src/types/index.ts` (`ProjectConfig`, `LaneConfig`, `CardFrontmatter`, `Card`, `CardSummary`, `TaskItem`, `ApiError`, etc.)
- [ ] 2.2 Implement `slugify()` in `src/utils/slug.ts` with unit tests

## Phase 3: Backend Services

Build from the bottom up — `MarkdownService` has no dependencies, then `ProjectService`, `CardService`, and `TaskService` layer on top.

- [ ] 3.1 Implement `MarkdownService.parse()` — parse frontmatter + content + tasks from raw Markdown string
- [ ] 3.2 Implement `MarkdownService.serialize()` — serialize frontmatter + content back to Markdown string
- [ ] 3.3 Implement `MarkdownService.parseTasks()` — extract `TaskItem[]` from Markdown content
- [ ] 3.4 Implement `MarkdownService.setTaskChecked()` — toggle a task's checked state in Markdown content
- [ ] 3.5 Implement `MarkdownService.appendTask()` — add a new checklist item to Markdown content
- [ ] 3.6 Implement `MarkdownService.taskProgress()` — compute `{ total, checked }` summary
- [ ] 3.7 Write unit tests for `MarkdownService` (parsing, serialization, task manipulation, edge cases)
- [ ] 3.8 Implement `ProjectService.listProjects()` — scan workspace, read `_project.json` files, compute card counts
- [ ] 3.9 Implement `ProjectService.getProject()` — read single project config
- [ ] 3.10 Implement `ProjectService.createProject()` — create folder, `_project.json`, lane subfolders with `_order.json`
- [ ] 3.11 Implement `ProjectService.updateProject()` — update `_project.json` fields
- [ ] 3.12 Implement `ProjectService.archiveProject()` — set `archived: true`
- [ ] 3.13 Write unit tests for `ProjectService`
- [ ] 3.14 Implement `CardService.listCards()` — read all lanes, parse frontmatter, respect `_order.json` ordering
- [ ] 3.15 Implement `CardService.getCard()` — find card across lanes, return full parsed content
- [ ] 3.16 Implement `CardService.createCard()` — slugify title, handle duplicate slugs, write `.md` file, update `_order.json`
- [ ] 3.17 Implement `CardService.moveCard()` — move file between lane folders, update both `_order.json` files
- [ ] 3.18 Implement `CardService.archiveCard()` — move card to `04-archive/`
- [ ] 3.19 Implement `CardService.reorderCards()` — replace `_order.json` for a lane
- [ ] 3.20 Write unit tests for `CardService`
- [ ] 3.21 Implement `TaskService.addTask()` — append checklist item to card
- [ ] 3.22 Implement `TaskService.setTaskChecked()` — toggle task checked state
- [ ] 3.23 Write unit tests for `TaskService`

## Phase 4: Backend API Routes & Server

- [ ] 4.1 Set up Elysia server in `src/server.ts` with `DEVPLANNER_WORKSPACE` validation and CORS
- [ ] 4.2 Implement project routes in `src/routes/projects.ts` (`GET /api/projects`, `POST /api/projects`, `PATCH /api/projects/:projectSlug`, `DELETE /api/projects/:projectSlug`)
- [ ] 4.3 Implement card routes in `src/routes/cards.ts` (`GET /api/projects/:projectSlug/cards`, `POST /api/projects/:projectSlug/cards`, `GET /api/projects/:projectSlug/cards/:cardSlug`, `DELETE /api/projects/:projectSlug/cards/:cardSlug`, `PATCH /api/projects/:projectSlug/cards/:cardSlug/move`)
- [ ] 4.4 Implement task routes in `src/routes/tasks.ts` (`POST /api/projects/:projectSlug/cards/:cardSlug/tasks`, `PATCH /api/projects/:projectSlug/cards/:cardSlug/tasks/:taskIndex`)
- [ ] 4.5 Implement reorder route (`PATCH /api/projects/:projectSlug/lanes/:laneSlug/order`)
- [ ] 4.6 Add input validation with descriptive error responses (`ApiError` with `message` + `expected`)
- [ ] 4.7 Verify all endpoints work end-to-end with manual testing or a quick smoke test

## Phase 5: Seed Data

- [ ] 5.1 Implement `src/seed.ts` — idempotent script that creates the 3 seed projects (Media Manager, LM API, Memory API) with all cards and tasks from the spec
- [ ] 5.2 Run seed script and verify data structure on disk

## Phase 6: Frontend Foundation

- [ ] 6.1 Set up `frontend/src/api/client.ts` — API client functions for all backend endpoints
- [ ] 6.2 Set up Zustand store in `frontend/src/store/index.ts` — full `DevPlannerStore` interface from spec section 5.4
- [ ] 6.3 Set up base styles in `frontend/src/styles/index.css` — Tailwind imports, dark mode defaults, custom colors
- [ ] 6.4 Set up `App.tsx` with top-level layout structure (Header + Sidebar + Board + DetailPanel)

## Phase 7: Frontend Components — Shell & Navigation

- [ ] 7.1 Build `Header` component (logo/title, sidebar toggle button)
- [ ] 7.2 Build `ProjectSidebar` component (project list, active project highlight, collapsible)
- [ ] 7.3 Build `CreateProjectModal` (name + description form, calls store action)
- [ ] 7.4 Wire up project loading on mount, project switching via sidebar

## Phase 8: Frontend Components — Kanban Board

- [ ] 8.1 Build `KanbanBoard` component (renders lanes from active project, handles layout)
- [ ] 8.2 Build `Lane` component (header with color bar + add button, card list area)
- [ ] 8.3 Build `CardPreview` component (title, task progress bar, assignee badge, tags)
- [ ] 8.4 Build `CollapsedLaneTab` component (vertical text label, click to expand)
- [ ] 8.5 Build `QuickAddCard` component (inline title input, appears on lane [+] click)
- [ ] 8.6 Wire up card loading when active project changes, display cards in correct lanes with `_order.json` ordering

## Phase 9: Frontend Components — Card Detail Panel

- [ ] 9.1 Build `CardDetailPanel` (slide-in from right, overlay)
- [ ] 9.2 Build `CardDetailHeader` (title, metadata badges)
- [ ] 9.3 Build `CardMetadata` (assignee, priority, tags, dates display)
- [ ] 9.4 Build `CardContent` (render Markdown body via `marked`)
- [ ] 9.5 Build `TaskList` and `TaskCheckbox` (interactive checkboxes, calls toggle API)
- [ ] 9.6 Wire up opening panel on card click, closing on X or clicking outside

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
