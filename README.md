# DevPlanner

A file-based Kanban board web app designed for iterative software development with AI agents. All project data is stored as plain-text Markdown and JSON files — no database required. Both humans and AI assistants can read, search, and modify project data directly through the filesystem or via the REST API.

## Purpose

DevPlanner bridges the gap between human developers and AI coding agents by providing a shared, transparent project management surface. Cards are Markdown files with YAML frontmatter, lanes are folders, and everything is version-controllable with git. The web UI provides a drag-and-drop Kanban board for visual management, while the file-based storage means any tool — from VS Code to Claude Code — can interact with the data natively.

## Architecture

```
DevPlanner/
├── src/                        # Backend (Bun + Elysia, port 17103)
│   ├── server.ts               # Elysia app setup, error handler, route registration
│   ├── mcp-server.ts           # MCP server entry point (stdio transport)
│   ├── routes/                 # Thin route handlers
│   │   ├── projects.ts         # Project CRUD
│   │   ├── cards.ts            # Card CRUD, search
│   │   ├── tasks.ts            # Task add, toggle, edit, delete
│   │   ├── links.ts            # Card URL link CRUD
│   │   ├── artifacts.ts        # Vault artifact creation
│   │   ├── history.ts          # Per-project activity history
│   │   ├── activity.ts         # Cross-project activity feed
│   │   ├── stats.ts            # Project health metrics
│   │   ├── preferences.ts      # Workspace preferences
│   │   ├── backup.ts           # Workspace backup
│   │   ├── search.ts           # Global and per-project search
│   │   ├── vault.ts            # Vault file content serving (`GET /api/vault/content`)
│   │   ├── config.ts           # Public config endpoint (`GET /api/config/public`)
│   │   └── websocket.ts        # WebSocket upgrade handler
│   ├── services/               # Core business logic and file I/O
│   │   ├── card.service.ts     # Card CRUD, move, reorder, search
│   │   ├── task.service.ts     # Checklist add/toggle/edit/delete (per-card mutex)
│   │   ├── link.service.ts     # Card URL link management
│   │   ├── vault.service.ts    # Obsidian vault artifact creation
│   │   ├── project.service.ts  # Project CRUD
│   │   ├── markdown.service.ts # Frontmatter parsing, checklist manipulation
│   │   ├── history.service.ts  # In-memory activity event tracking
│   │   ├── history-persistence.service.ts # History JSON file persistence
│   │   ├── websocket.service.ts    # WebSocket connection management, broadcasting
│   │   ├── file-watcher.service.ts # External file change detection
│   │   ├── backup.service.ts   # Workspace backup to zip
│   │   ├── preferences.service.ts  # Workspace preferences (digestAnchor, etc.)
│   │   └── config.service.ts   # Singleton env var loader
│   ├── mcp/                    # MCP server for AI agents
│   │   ├── tool-handlers.ts    # 17 tool implementations
│   │   ├── resource-providers.ts # 3 resource providers
│   │   ├── schemas.ts          # JSON schemas for tool inputs
│   │   ├── errors.ts           # LLM-friendly error messages
│   │   └── types.ts            # MCP-specific type definitions
│   ├── types/                  # Shared TypeScript interfaces
│   ├── utils/                  # Slug generation, prefix utilities
│   └── seed.ts                 # Seed data script
├── frontend/                   # Frontend (React 19 + Vite + Tailwind CSS 4)
│   └── src/
│       ├── api/client.ts       # Typed fetch wrappers for all endpoints
│       ├── services/           # WebSocket client
│       ├── store/index.ts      # Zustand state management
│       └── components/         # React components (Kanban, card detail, activity)
└── workspace/                  # Project data directory (gitignored)
```

### Data Storage

Project data lives in `$DEVPLANNER_WORKSPACE` (configurable via env var):

```
workspace/
└── my-project/
    ├── _project.json           # Project metadata, lane config, card ID prefix
    ├── _history.json           # Persisted activity history events
    ├── 01-upcoming/
    │   ├── _order.json         # Card display order for drag-and-drop
    │   └── feature-card.md     # Card: YAML frontmatter + Markdown body
    ├── 02-in-progress/
    ├── 03-complete/
    └── 04-archive/
```

Cards are `.md` files with YAML frontmatter for metadata (title, description, priority, assignee, tags, cardNumber, blockedReason) and standard Markdown checkboxes (`- [ ]` / `- [x]`) for task tracking. Each card has a unique `cardId` (e.g., `DEV-42`) composed from the project prefix and card number.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Backend | Elysia |
| Markdown parsing | gray-matter |
| AI agent protocol | @modelcontextprotocol/sdk (MCP) |
| Frontend framework | React 19 |
| Build tool | Vite 6 |
| Styling | Tailwind CSS 4 (dark mode) |
| State management | Zustand |
| Drag-and-drop | @dnd-kit |
| Animations | Framer Motion |
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
| `DEVPLANNER_BACKUP_DIR` | No | `{workspace}/_backups` | Directory for workspace backups |
| `DISABLE_FILE_WATCHER` | No | `false` | Set to `true` to disable file watching (useful for debugging WebSocket vs file watcher issues) |
| `ARTIFACT_BASE_URL` | No | — | Base URL prefix for vault artifact links (e.g. `https://viewer.example.com/view?path=10-Projects`). Required for vault artifact creation and the Diff Viewer. |
| `ARTIFACT_BASE_PATH` | No | — | Absolute path to the directory where artifact files are written. Required for vault artifact creation and the Diff Viewer. |

#### Using a `.env` file

A `.env.example` file is included in the repository with all variables documented. Copy it to `.env` and edit the values before starting the server:

```bash
cp .env.example .env
# Edit .env — at minimum set DEVPLANNER_WORKSPACE to an absolute path
```

> **Note:** The `.env` file is gitignored. Never commit local paths or secrets. Bun loads `.env` automatically when you run any `bun run …` command.

### Running

```bash
# Start both backend and frontend (with hot reload)
bun run dev

# Or start them separately in two terminals:
DEVPLANNER_WORKSPACE=$(pwd)/workspace bun run dev:backend
DEVPLANNER_WORKSPACE=$(pwd)/workspace bun run dev:frontend

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

### Running with Docker

DevPlanner ships with a `Dockerfile` and `docker-compose.yml` for containerised use — ideal for self-hosting on a home server or making DevPlanner accessible across a local network or via Tailscale.

The Docker image builds the React frontend and serves it as static files from the Elysia backend. Both the UI and the API are available on a **single port (17103)** — no separate frontend server needed.

#### Quick start

```bash
# 1. Copy and edit the environment file
cp .env.example .env
# Edit .env — set DEVPLANNER_WORKSPACE to an absolute path on the host, e.g.:
#   DEVPLANNER_WORKSPACE=/home/alice/devplanner-workspace

# 2. Create the workspace directory if it doesn't exist
mkdir -p /home/alice/devplanner-workspace

# 3. Build and start (frontend is built during the Docker build)
docker compose up --build
```

Everything is then available at **`http://localhost:17103`** — the Kanban UI, the REST API, and the WebSocket endpoint.

#### Local network and Tailscale access

The backend binds to all network interfaces (`0.0.0.0`), so once the container is running you can access DevPlanner from any machine on the same local network **or** via Tailscale by replacing `localhost` with the host machine's local IP or Tailscale IP/hostname:

```
http://<tailscale-hostname>:17103
```

No additional proxy or VPN configuration is required when using Tailscale.

#### Port remapping

To expose DevPlanner on a different host port, set `PORT` in your `.env`:

```bash
# .env
PORT=8080
```

Or edit `docker-compose.yml` directly:

```yaml
ports:
  - "8080:17103"   # DevPlanner accessible at :8080 on the host
```

#### Workspace persistence

The workspace directory is bind-mounted from the host (the value of `DEVPLANNER_WORKSPACE` in `.env`), so all project data persists across container restarts and rebuilds. You can also edit card files directly on the host and the file watcher inside the container will detect the changes in real time.

## MCP Server (AI Agent Integration)

DevPlanner provides a Model Context Protocol (MCP) server that enables AI coding assistants like Claude Code and GitHub Copilot to directly interact with projects.

### Running the MCP Server

```bash
# Start the MCP server with stdio transport
DEVPLANNER_WORKSPACE=$(pwd)/workspace bun run mcp
```

The server communicates via stdin/stdout and provides:

**Tools** for project management:
- Core CRUD: `list_projects`, `get_project`, `create_project`, `list_cards`, `get_card`, `create_card`, `update_card`, `move_card`, `add_task`, `toggle_task`
- Smart/Workflow: `get_board_overview`, `get_next_tasks`, `batch_update_tasks`, `search_cards`, `update_card_content`, `get_project_progress`, `archive_card`
- Vault: `create_vault_artifact` — writes a Markdown file to the Obsidian Vault and attaches it as a link

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
| `GET` | `/api/projects/:slug/cards` | List cards (`?lane=`, `?since=`, `?staleDays=`) |
| `POST` | `/api/projects/:slug/cards` | Create card |
| `GET` | `/api/projects/:slug/cards/:card` | Get card details |
| `DELETE` | `/api/projects/:slug/cards/:card` | Archive card |
| `PATCH` | `/api/projects/:slug/cards/:card` | Update card metadata |
| `PATCH` | `/api/projects/:slug/cards/:card/move` | Move card to lane |
| `POST` | `/api/projects/:slug/cards/:card/tasks` | Add checklist item |
| `PATCH` | `/api/projects/:slug/cards/:card/tasks/:index` | Toggle or edit task |
| `DELETE` | `/api/projects/:slug/cards/:card/tasks/:index` | Delete task |
| `POST` | `/api/projects/:slug/cards/:card/links` | Add a URL link to a card |
| `PATCH` | `/api/projects/:slug/cards/:card/links/:linkId` | Update a link |
| `DELETE` | `/api/projects/:slug/cards/:card/links/:linkId` | Delete a link |
| `POST` | `/api/projects/:slug/cards/:card/artifacts` | Write Markdown file to Obsidian Vault and attach as link |
| `GET` | `/api/projects/:slug/cards/search?q=` | Search cards by title, tasks, description (legacy) |
| `GET` | `/api/projects/:slug/search?q=` | Palette search — cards, tasks, descriptions, tags, assignees, links |
| `GET` | `/api/search?q=&projects=` | Global cross-project palette search |
| `PATCH` | `/api/projects/:slug/lanes/:lane/order` | Reorder cards in lane |
| `GET` | `/api/projects/:slug/stats` | Project health stats |
| `GET` | `/api/projects/:slug/history` | Activity history (`?limit=`, `?since=`) |
| `GET` | `/api/activity` | Cross-project activity feed (`?since=`, `?limit=`) |
| `GET` | `/api/preferences` | Get workspace preferences |
| `PATCH` | `/api/preferences` | Update preferences (incl. `digestAnchor`) |
| `POST` | `/api/backup` | Create workspace backup (zip) |
| `GET` | `/api/vault/content?path=` | Read raw vault artifact file content (requires `ARTIFACT_BASE_PATH`) |
| `GET` | `/api/config/public` | Public server configuration (`artifactBaseUrl`) |
| `WS` | `/api/ws` | WebSocket connection for real-time updates |

See [SPECIFICATION.md](docs/SPECIFICATION.md) for full API contracts, request/response schemas, and validation rules.

## Features

### Current
- ✅ **Diff Viewer** — Split-pane file comparison with syntax highlighting; opens vault artifact files directly from card links
- ✅ **Kanban Board UI** - Drag-and-drop cards between lanes with collapsible lanes
- ✅ **Card Management** - Create, edit, archive cards with Markdown content; description, `blockedReason` field, inline title/metadata editing
- ✅ **Card IDs** - Unique identifiers (e.g., `DEV-42`) with project-configurable prefix
- ✅ **Card Links** - Attach structured URL references to cards (docs, specs, tickets, repos) with kind classification
- ✅ **Vault Artifacts** - Write Markdown files directly to an Obsidian Vault and auto-attach as links; upload files from the card detail panel via `UploadLinkForm`
- ✅ **Task Tracking** - Checkbox-based task lists with progress visualization; per-task `addedAt`/`completedAt` timestamps; inline task editing and deletion
- ✅ **Project Management** - Multi-project support with card counts
- ✅ **Search & Filter** - Command-palette overlay (`Ctrl+K`/`Cmd+K`) with real-time search across card titles, tasks, descriptions, tags, assignees, and links; keyboard navigation; type-filter tabs; scope toggle (this project / all projects); matched text highlighted in results
- ✅ **Real-time Sync** - WebSocket infrastructure for live updates across clients
- ✅ **File Watching** - Automatic detection of external file changes
- ✅ **Activity History** - Per-project history with `?since=` filter; cross-project `/api/activity` feed
- ✅ **Project Stats** - Health metrics endpoint (WIP count, backlog depth, completion velocity)
- ✅ **Digest Checkpoint** - `digestAnchor` preference for precise time-bounded agent queries
- ✅ **Visual Indicators** - Animated feedback for background changes
- ✅ **Responsive Design** - Mobile, tablet, and desktop layouts
- ✅ **Preferences** - Last-selected project and digest anchor persistence
- ✅ **Backup** - Workspace backup to zip via API
- ✅ **MCP Server** - Model Context Protocol integration for AI agents (17 tools, 3 resources)
- ✅ **Docker** - Containerized deployment with single-port serving (UI + API)

### Planned (Post-MVP)
- 📋 **Concurrency Guard** - Per-resource locking and operation queue for multi-agent safety ([spec](docs/features/concurrency-operation-queue.md))
- 📋 **User Attribution** - Track who made each change (agent identity via `X-DevPlanner-Actor` header)
- 📋 **WebSocket Smart Merge** - Prevent edit interruptions when agents update cards being edited
- 📋 **History Persistence** - Durable JSON file storage with write queue and rotation
- 📋 **Multi-Agent Support** - Coordinate multiple AI agents with claim/release, session registry
- 📋 **Sub-task Support** - Nested checklists with indentation
- 📋 **Dashboard View** - Project health metrics at a glance
- 📋 **Markdown Editor** - Rich text editing for card content

## Project Documents

| File | Purpose |
|------|---------|
| [BRAINSTORM.md](BRAINSTORM.md) | Design decisions, resolved questions, future ideas |
| [SPECIFICATION.md](SPECIFICATION.md) | Technical spec — file formats, API contracts, component architecture |
| [TASKS.md](TASKS.md) | Phased build plan with task checklist |
