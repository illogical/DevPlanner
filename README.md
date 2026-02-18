# DevPlanner

A file-based Kanban board web app designed for iterative software development with AI agents. All project data is stored as plain-text Markdown and JSON files — no database required. Both humans and AI assistants can read, search, and modify project data directly through the filesystem or via the REST API.

## Purpose

DevPlanner bridges the gap between human developers and AI coding agents by providing a shared, transparent project management surface. Cards are Markdown files with YAML frontmatter, lanes are folders, and everything is version-controllable with git. The web UI provides a drag-and-drop Kanban board for visual management, while the file-based storage means any tool — from VS Code to Claude Code — can interact with the data natively.

## Architecture

```
DevPlanner/
├── src/                        # Backend (Bun + Elysia, port 17103)
│   ├── server.ts               # Elysia app setup, route registration
│   ├── routes/                 # Thin route handlers (projects, cards, tasks)
│   ├── services/               # Core business logic and file I/O
│   │   ├── markdown.service.ts # Frontmatter parsing, checklist manipulation
│   │   ├── project.service.ts  # Project CRUD
│   │   ├── card.service.ts     # Card CRUD, move, reorder
│   │   └── task.service.ts     # Checklist add/toggle
│   ├── types/                  # Shared TypeScript interfaces
│   ├── utils/                  # Slug generation
│   └── seed.ts                 # Seed data script
├── frontend/                   # Frontend (React 19 + Vite + Tailwind CSS 4)
│   └── src/
│       ├── api/client.ts       # API client functions
│       ├── store/index.ts      # Zustand state management
│       └── components/         # React components (Kanban board, lanes, cards)
└── workspace/                  # Project data directory (gitignored)
```

### Data Storage

Project data lives in `$DEVPLANNER_WORKSPACE` (configurable via env var):

```
workspace/
└── my-project/
    ├── _project.json           # Project metadata and lane config
    ├── 01-upcoming/
    │   ├── _order.json         # Card display order for drag-and-drop
    │   └── feature-card.md     # Card: YAML frontmatter + Markdown body
    ├── 02-in-progress/
    ├── 03-complete/
    └── 04-archive/
```

Cards are `.md` files with frontmatter for metadata (title, priority, assignee, tags) and standard Markdown checkboxes (`- [ ]` / `- [x]`) for task tracking.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Backend | Elysia |
| Markdown parsing | gray-matter |
| Frontend framework | React 19 |
| Build tool | Vite 6 |
| Styling | Tailwind CSS 4 (dark mode) |
| State management | Zustand |
| Drag-and-drop | @dnd-kit |
| Markdown rendering | marked |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (latest)

### Setup

```bash
# Install backend dependencies
bun install

# Install frontend dependencies
cd frontend && bun install && cd ..

# Create workspace directory
mkdir -p workspace
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEVPLANNER_WORKSPACE` | Yes | — | Absolute path to the workspace directory |
| `PORT` | No | `17103` | Backend server port |
| `DISABLE_FILE_WATCHER` | No | `false` | Set to `true` to disable file watching (useful for debugging WebSocket vs file watcher issues) |

### Running

```bash
# Start backend (with hot reload)
DEVPLANNER_WORKSPACE=$(pwd)/workspace bun run dev

# Start frontend (in a separate terminal)
bun run frontend

# Seed sample data (3 demo projects)
DEVPLANNER_WORKSPACE=$(pwd)/workspace bun run seed

# Run tests
bun test

# Verify WebSocket infrastructure (Phase 12)
bun run verify:websocket

# Run E2E demo (exercises real-time features — watch the UI!)
bun run demo:e2e

# Start MCP server (for AI agent integration)
DEVPLANNER_WORKSPACE=$(pwd)/workspace bun run mcp
```

The frontend dev server proxies `/api` requests to the backend at `http://localhost:17103`.

## MCP Server (AI Agent Integration)

DevPlanner provides a Model Context Protocol (MCP) server that enables AI coding assistants like Claude Code and GitHub Copilot to directly interact with projects.

### Running the MCP Server

```bash
# Start the MCP server with stdio transport
DEVPLANNER_WORKSPACE=$(pwd)/workspace bun run mcp
```

The server communicates via stdin/stdout and provides:

**17 Tools** for project management:
- Core CRUD: `list_projects`, `get_project`, `create_project`, `list_cards`, `get_card`, `create_card`, `update_card`, `move_card`, `add_task`, `toggle_task`
- Smart/Workflow: `get_board_overview`, `get_next_tasks`, `batch_update_tasks`, `search_cards`, `update_card_content`, `get_project_progress`, `archive_card`

**3 Resources** for read-only access:
- `devplanner://projects` - List all projects
- `devplanner://projects/{slug}` - Project details with recent cards
- `devplanner://projects/{slug}/cards/{cardSlug}` - Full card details

### Using with Claude Code

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "devplanner": {
      "command": "bun",
      "args": ["run", "mcp"],
      "env": {
        "DEVPLANNER_WORKSPACE": "/absolute/path/to/workspace"
      }
    }
  }
}
```

Then restart Claude Desktop. The AI will have access to all DevPlanner tools and can manage projects, cards, and tasks directly.

### Example Agent Workflow

```
1. Agent: list_projects → discovers available work
2. Agent: get_next_tasks(assignee='agent') → finds uncompleted tasks
3. Agent: update_card(assignee='agent') → claims work
4. Agent: toggle_task(...) → reports progress as subtasks complete
5. Agent: move_card(targetLane='complete') → marks done
6. Agent: update_card_content(...) → adds implementation notes
```

All actions are tracked in DevPlanner's activity history and visible in the web UI.

## API Overview

All endpoints are under `/api` and return JSON.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List projects |
| `POST` | `/api/projects` | Create project |
| `PATCH` | `/api/projects/:slug` | Update project |
| `DELETE` | `/api/projects/:slug` | Archive project |
| `GET` | `/api/projects/:slug/cards` | List cards (all lanes) |
| `POST` | `/api/projects/:slug/cards` | Create card |
| `GET` | `/api/projects/:slug/cards/:card` | Get card details |
| `DELETE` | `/api/projects/:slug/cards/:card` | Archive card |
| `PATCH` | `/api/projects/:slug/cards/:card/move` | Move card to lane |
| `POST` | `/api/projects/:slug/cards/:card/tasks` | Add checklist item |
| `PATCH` | `/api/projects/:slug/cards/:card/tasks/:index` | Toggle task |
| `PATCH` | `/api/projects/:slug/lanes/:lane/order` | Reorder cards in lane |
| `GET` | `/api/projects/:slug/history` | Get activity history (last 10 events) |
| `WS` | `/api/ws` | WebSocket connection for real-time updates |

See [SPECIFICATION.md](SPECIFICATION.md) for full API contracts, request/response schemas, and validation rules.

## Features

### Current (Phase 18 Complete)
- ✅ **Kanban Board UI** - Drag-and-drop cards between lanes
- ✅ **Card Management** - Create, edit, archive cards with Markdown content
- ✅ **Task Tracking** - Checkbox-based task lists with progress visualization
- ✅ **Project Management** - Multi-project support with card counts
- ✅ **Real-time Sync** - WebSocket infrastructure for live updates
- ✅ **File Watching** - Automatic detection of external file changes
- ✅ **Activity History** - Track all card/task modifications with timestamps
- ✅ **Visual Indicators** - Animated feedback for background changes
- ✅ **Responsive Design** - Mobile, tablet, and desktop layouts
- ✅ **Preferences** - Last-selected project persistence
- ✅ **MCP Server** - Model Context Protocol integration for AI agents (17 tools, 3 resources)

### Planned (Post-MVP)
- 📋 **User Attribution** - Track who made each change
- 📋 **Task Status** - Mark tasks as in-progress, not just done/undone
- 📋 **History Persistence** - JSON file storage with write queue
- 📋 **Multi-Agent Support** - Coordinate multiple AI agents on different tasks
- 📋 **Markdown Editor** - Rich text editing for card content
- 📋 **Search & Filter** - Find cards and tasks across projects

## Project Documents

| File | Purpose |
|------|---------|
| [BRAINSTORM.md](BRAINSTORM.md) | Design decisions, resolved questions, future ideas |
| [SPECIFICATION.md](SPECIFICATION.md) | Technical spec — file formats, API contracts, component architecture |
| [TASKS.md](TASKS.md) | Phased build plan with task checklist |
