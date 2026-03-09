# DevPlanner Frontend

React 19 single-page application for the DevPlanner Kanban board. Dark mode by default, built with Vite 6 and Tailwind CSS 4.

## Architecture

```
frontend/src/
├── api/
│   └── client.ts              # Typed fetch wrappers for all REST endpoints
├── services/
│   └── websocket.service.ts   # WebSocket client for real-time updates
├── store/
│   └── index.ts               # Zustand store — single source of truth
├── hooks/
│   └── useSyncScroll.ts       # Synchronized scroll hook for Diff Viewer
├── utils/
│   └── diffUrl.ts             # buildDiffUrl() helper for vault link → diff URL
├── pages/
│   └── DiffViewerPage.tsx     # Top-level Diff Viewer page (route: /diff)
├── components/
│   ├── diff/                  # Diff Viewer components
│   │   ├── DiffHeader.tsx     # Page title + "Back to DevPlanner" link
│   │   ├── DiffToolbar.tsx    # Language, wrap, sync-scroll, swap, clear controls
│   │   ├── DiffLayout.tsx     # Two-pane CSS grid container
│   │   ├── DiffPane.tsx       # Single pane (header + dropzone/content)
│   │   ├── DiffPaneHeader.tsx # Filename display, copy, file-picker button
│   │   ├── DiffContent.tsx    # Scrollable line list container
│   │   ├── DiffLine.tsx       # Individual line: number + highlight.js + change color
│   │   └── DropZone.tsx       # Drag-and-drop / paste / file-picker input
│   ├── kanban/                # Board, lanes, card previews, drag-and-drop
│   ├── card-detail/           # Slide-in detail panel (header, content, metadata, tasks, links)
│   ├── tasks/                 # Task checkbox, progress bar, add-task input
│   ├── activity/              # Activity log, activity panel, sidebar
│   ├── animations/            # Animated card wrapper (change indicators)
│   ├── layout/                # Header, MainLayout, ProjectSidebar
│   └── ui/                    # Shared primitives (Badge, Button, etc.)
└── App.tsx                    # Root component with React Router routes
```

### Component tree

```
App (React Router)
├── Route "/" → KanbanApp
│   └── MainLayout (CSS grid: sidebar + content)
│       ├── Header (project selector, search, activity toggle)
│       ├── ProjectSidebar (project list with card counts)
│       ├── KanbanBoard
│       │   ├── Lane (expanded, with drag-and-drop via @dnd-kit)
│       │   │   ├── LaneHeader (card count, collapse toggle)
│       │   │   ├── CardPreview (title, priority badge, task progress)
│       │   │   └── QuickAddCard (inline card creation)
│       │   └── CollapsedLaneTab (minimized lane)
│       ├── CardDetailPanel (slide-in from right, Framer Motion)
│       │   ├── CardDetailHeader (title editing, card ID, lane move)
│       │   ├── CardMetadata (priority, assignee, tags, dates, blocked reason)
│       │   ├── CardContent (description editing, markdown body)
│       │   ├── TaskList (checkboxes with inline editing and deletion)
│       │   └── CardLinks (URL references + vault artifact upload; "Open in Diff Viewer" button for vault links)
│       └── ActivityPanel (slide-out history log)
└── Route "/diff" → DiffViewerPage
    ├── DiffHeader (title + "Back to DevPlanner" link)
    ├── DiffToolbar (language selector, wrap, sync-scroll, swap, clear)
    └── DiffLayout (CSS grid: left | right)
        ├── DiffPane (left)
        │   ├── DiffPaneHeader (filename, copy button)
        │   ├── DropZone (drag-and-drop / paste / file picker — shown when empty)
        │   └── DiffContent (scrollable line list)
        │       └── DiffLine[] (line number + highlight.js + added/removed/unchanged color)
        └── DiffPane (right)
            ├── DiffPaneHeader (filename, copy button, file-picker button)
            ├── DropZone (shown when empty)
            └── DiffContent (synchronized scroll)
                └── DiffLine[]
```

## State management

A single Zustand store (`store/index.ts`) holds all application state:

- **Projects**: list, active project, CRUD actions
- **Cards**: per-project card lists, detail selection, CRUD + move + reorder
- **Tasks**: add, toggle, edit, delete (with optimistic updates)
- **Links**: add, update, delete URL references on cards; `createVaultArtifact` for Obsidian Vault uploads
- **History**: activity events with time-based grouping
- **WebSocket**: connection status, real-time event handlers

Actions call the API client, update local state, and the WebSocket client pushes server-originated changes back into the store. Self-echo deduplication prevents double-processing when an action triggers both a local update and a WebSocket broadcast.

## Development

```bash
# Start frontend dev server (Vite on port 5173, proxies /api to backend)
bun run dev

# Lint (ESLint with TypeScript rules)
bun run lint

# Build for production (tsc + Vite)
bun run build
```

The Vite dev server proxies all `/api` requests to the backend at `http://localhost:17103`.

## Key patterns

- **Self-echo deduplication**: WebSocket events include a `clientId`. The store skips events that originated from this client to avoid applying changes twice.
- **Change indicators**: Cards flash briefly when updated by external sources (other clients, file watcher, agents). Indicators auto-expire after a short delay.
- **Framer Motion transitions**: The card detail panel and activity panel use spring animations for slide-in/slide-out. Cards animate on reorder.
- **Optimistic updates**: Task toggles and card moves update the store immediately, then sync with the server. On failure, the store rolls back.

## Git Integration

The editor and file browser include a full single-file Git workflow. Each open file shows a status pill in the bottom bar that refreshes immediately after save and on file selection (no polling delay for these events).

### Status colors

| Color | State | Meaning |
|---|---|---|
| Emerald | Clean | All changes committed |
| Red | Untracked | New file, not yet added to git |
| Red | Unstaged | Tracked file with working-tree changes, nothing staged |
| Blue | Staged | All changes staged, ready to commit |
| Blue + Red (two dots) | Partial staged | Staged changes AND additional unstaged changes exist |
| Gray | Ignored / Outside repo / Unknown | Git not applicable |

### Git Actions panel

Click the status pill to open the Git Actions panel, which shows context-sensitive buttons:

- **Stage** — add working-tree changes to the index (`git add`)
- **Unstage** — remove staged changes from the index (`git reset HEAD`)
- **Discard** — revert unstaged working-tree changes to the staged/committed version (`git restore --worktree`)
- **Commit** — commit staged changes with a message (Enter to submit, Shift+Enter for newline)

> **Partial staged state**: When both staged and unstaged changes exist, an amber warning is shown. Only the staged portion will be committed — unstaged changes remain in the working tree.

### Diff views

Diff buttons appear in the Git Actions panel based on the current state:

| State | Button | What it shows |
|---|---|---|
| `modified` (unstaged) | View changes | Last commit (HEAD) vs current working tree |
| `staged` | View staged diff | Last commit (HEAD) vs staged index — exactly what will be committed |
| `modified-staged` | View unstaged changes | Staged index vs working tree — what will NOT be in the next commit |
| `modified-staged` | View all changes | Last commit (HEAD) vs current working tree |

The Diff Viewer is opened pre-loaded via URL params: `/diff?gitPath=<path>&leftRef=HEAD|staged&rightRef=working|staged`.

## Tech stack

| Concern | Library |
|---------|---------|
| Framework | React 19 |
| Build | Vite 6 |
| Routing | react-router-dom v7 |
| Styling | Tailwind CSS 4 (dark mode, class-based) |
| State | Zustand 5 |
| Drag-and-drop | @dnd-kit |
| Animations | Framer Motion |
| Markdown | marked |
| Syntax highlighting | highlight.js |
| Diff algorithm | diff (jsdiff) |
