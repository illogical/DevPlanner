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
├── components/
│   ├── kanban/                # Board, lanes, card previews, drag-and-drop
│   ├── card-detail/           # Slide-in detail panel (header, content, metadata, tasks, links)
│   ├── tasks/                 # Task checkbox, progress bar, add-task input
│   ├── activity/              # Activity log, activity panel, sidebar
│   ├── animations/            # Animated card wrapper (change indicators)
│   ├── layout/                # Header, MainLayout, ProjectSidebar
│   └── ui/                    # Shared primitives (Badge, Button, etc.)
└── App.tsx                    # Root component
```

### Component tree

```
App
└── MainLayout (CSS grid: sidebar + content)
    ├── Header (project selector, search, activity toggle)
    ├── ProjectSidebar (project list with card counts)
    ├── KanbanBoard
    │   ├── Lane (expanded, with drag-and-drop via @dnd-kit)
    │   │   ├── LaneHeader (card count, collapse toggle)
    │   │   ├── CardPreview (title, priority badge, task progress)
    │   │   └── QuickAddCard (inline card creation)
    │   └── CollapsedLaneTab (minimized lane)
    ├── CardDetailPanel (slide-in from right, Framer Motion)
    │   ├── CardDetailHeader (title editing, card ID, lane move)
    │   ├── CardMetadata (priority, assignee, tags, dates, blocked reason)
    │   ├── CardContent (description editing, markdown body)
    │   ├── TaskList (checkboxes with inline editing and deletion)
    │   └── CardLinks (URL references + vault artifact upload with kind classification)
    └── ActivityPanel (slide-out history log)
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

## Tech stack

| Concern | Library |
|---------|---------|
| Framework | React 19 |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 (dark mode, class-based) |
| State | Zustand 5 |
| Drag-and-drop | @dnd-kit |
| Animations | Framer Motion |
| Markdown | marked |
