# DevPlanner

**A human + AI project management platform where every piece of work lives as a plain-text file on disk.** Teams and AI coding agents share the same board, read and write the same Markdown cards, and both see live updates — no proprietary database, no sync conflicts, no silos.

> Built for the era where humans and AI agents collaborate on the same codebase, DevPlanner gives both sides a transparent, version-controllable surface for planning, tracking, and shipping software.

## Why DevPlanner?

Modern development increasingly involves AI agents — tools like Claude Code, GitHub Copilot, and custom automation — working alongside human developers. Most project management tools are built exclusively for humans: they hide data behind opaque APIs, require GUIs to interact with, and make it hard for agents to read or update task state.

DevPlanner is designed from the ground up for **human + agent collaboration**:

- **Plain text, always** — Cards are `.md` files with YAML frontmatter. Any tool — VS Code, `grep`, Claude Code, a shell script — can read and write them natively.
- **A live Kanban board** — Humans get a visual drag-and-drop UI with real-time updates, rich card editing, and inline diff viewing.
- **MCP-native for AI agents** — A Model Context Protocol server gives AI assistants structured access to every project, card, and task without screen-scraping.
- **Git-backed artifacts** — Documents produced during development are tracked in git; stage, commit, and diff from inside the UI.
- **Skill evaluation tooling** — Built-in framework to evaluate and refine how well AI models follow the DevPlanner skill instructions.

## Feature Highlights

| Feature | Description |
|---------|-------------|
| 🗂️ **Kanban Board** | Drag-and-drop lanes with collapsible columns and **lane focus mode** for deep dive card review |
| 📄 **Doc Manager** | Integrated Markdown viewer/editor with a hierarchical file browser for vault artifacts |
| 🔀 **Diff Viewer** | Split-pane comparison with inline word highlights; git-aware mode switcher (All / Staged / Unstaged) |
| 🔗 **Git Integration** | Per-file status dots, stage/unstage/discard/commit from the bottom bar without leaving the UI |
| 🔍 **Command Palette** | `Ctrl+K` / `Cmd+K` cross-project search across titles, tasks, tags, descriptions, and links |
| 🤖 **MCP Server** | 17 tools + 3 resources for AI agents (Claude Code, GitHub Copilot, etc.) |
| 🧪 **Skill Eval Framework** | Bun-based toolchain to score how well LLMs follow DevPlanner skill instructions; supports testing across multiple models and comparing runs over time |
| ⚡ **Real-time Sync** | WebSocket broadcasts card changes, moves, task updates, and git status to all connected clients |
| 🐳 **Docker** | Single-port containerised deployment (UI + API on port 17103) |

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
│       └── components/         # React components (Kanban, card detail, diff viewer, doc manager)
├── tools/
│   └── skill-evals/            # Skill evaluation framework (Bun)
│       ├── run-eval.ts         # Single-skill eval runner
│       ├── run-eval-models.ts  # Model sweep runner
│       ├── compare-runs.ts     # Cross-run comparison report generator
│       └── lib/                # Scorer, reporter, LM client, parser
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
| `OLLAMA_BASE_URL` | No | — | Ollama API base URL for skill evaluation (e.g. `http://localhost:11434`) |
| `OLLAMA_MODEL` | No | — | Default Ollama model for skill eval runs (e.g. `qwen2.5-coder:14b`) |
| `OLLAMA_FEEDBACK_MODEL` | No | `$OLLAMA_MODEL` | Separate model for LLM feedback step in skill evals |
| `OLLAMA_CALL_DELAY_MS` | No | `500` | Milliseconds to pause between scenario calls in skill evals |

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

# Run E2E demo (exercises real-time features — watch the UI!)
bun run demo:e2e

# Start MCP server (for AI agent integration)
DEVPLANNER_WORKSPACE=$(pwd)/workspace bun run mcp

# --- Skill Evaluation ---
# Run all devplanner skill eval scenarios
bun run eval:skill -- --skill .claude/skills/devplanner

# Run a model sweep across all configured Ollama models
bun run eval:models -- --skill .claude/skills/devplanner

# Compare all existing runs and generate a timeline report
bun run eval:compare -- --skill .claude/skills/devplanner
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
| `GET` | `/api/vault/git/status?path=` | Single-file git status |
| `POST` | `/api/vault/git/statuses` | Batch git status for multiple files |
| `POST` | `/api/vault/git/stage` | Stage a file (`git add`) |
| `POST` | `/api/vault/git/unstage` | Unstage a file (`git reset HEAD`) |
| `POST` | `/api/vault/git/discard` | Discard unstaged changes (`git restore --worktree`) |
| `POST` | `/api/vault/git/commit` | Commit staged changes with a message |
| `GET` | `/api/vault/git/diff?path=&mode=working\|staged` | Raw unified diff output |
| `GET` | `/api/vault/git/show?path=&ref=staged\|HEAD` | File content at a git ref (index or last commit) |
| `GET` | `/api/config/public` | Public server configuration (`artifactBaseUrl`) |
| `WS` | `/api/ws` | WebSocket connection for real-time updates |

See [SPECIFICATION.md](docs/SPECIFICATION.md) for full API contracts, request/response schemas, and validation rules.

## Features

### Current

#### Kanban & Cards
- ✅ **Kanban Board UI** — Drag-and-drop cards between lanes with collapsible lanes and animated transitions
- ✅ **Lane Focus Mode** — Click any lane header to enter focus mode: full-height expanded card list with rich metadata, keyboard Escape to exit
- ✅ **Card Management** — Create, edit, archive cards with Markdown content; description, `blockedReason` field, inline title/metadata editing
- ✅ **Card IDs** — Unique identifiers (e.g., `DEV-42`) with project-configurable prefix
- ✅ **Card Links** — Attach structured URL references to cards (docs, specs, tickets, repos) with kind classification
- ✅ **Task Tracking** — Checkbox-based task lists with progress visualization; per-task `addedAt`/`completedAt` timestamps; inline task editing and deletion

#### Doc Manager & Artifacts
- ✅ **Doc Manager** — Integrated Markdown viewer/editor with a full-screen bottom-drawer panel; hierarchical folder tree for navigating vault artifact directories; breadcrumb path display and "go up" navigation
- ✅ **Vault Artifacts** — Write Markdown files directly to an Obsidian Vault and auto-attach as card links; upload files from the card detail panel via `UploadLinkForm`
- ✅ **Git Integration** — Per-file git status tracking with color-coded pills (clean / untracked / unstaged / staged / staged-new / partial-staged); stage, unstage, discard, and commit from the bottom bar without leaving the editor; status refreshes immediately on save and file selection; batch status fetch for all visible files
- ✅ **Diff Viewer** — Split-pane file comparison with syntax highlighting and inline word-level highlights for precise change spotting; left pane = older version, right pane = newer version; git-aware mode switcher shows available comparisons (All changes / Staged diff / Unstaged changes) based on the file's git state; quick-access diff buttons in the bottom bar; opens vault artifact files directly from card links; manual mode supports drag-and-drop, paste, and file picker

#### Search & Discovery
- ✅ **Search & Filter** — Command-palette overlay (`Ctrl+K` / `Cmd+K`) with real-time search across card titles, tasks, descriptions, tags, assignees, and links; keyboard navigation; type-filter tabs; scope toggle (this project / all projects); matched text highlighted in results

#### Infrastructure
- ✅ **Real-time Sync** — WebSocket infrastructure for live updates across all connected clients
- ✅ **File Watching** — Automatic detection of external file changes (e.g., edits made in VS Code or via AI agents)
- ✅ **Activity History** — Per-project history with `?since=` filter; cross-project `/api/activity` feed
- ✅ **Project Stats** — Health metrics endpoint (WIP count, backlog depth, completion velocity)
- ✅ **Digest Checkpoint** — `digestAnchor` preference for precise time-bounded agent queries
- ✅ **Visual Indicators** — Animated feedback for background changes
- ✅ **Responsive Design** — Mobile, tablet, and desktop layouts
- ✅ **Preferences** — Last-selected project and digest anchor persistence
- ✅ **Backup** — Workspace backup to zip via API
- ✅ **MCP Server** — Model Context Protocol integration for AI agents (17 tools, 3 resources)
- ✅ **Docker** — Containerized deployment with single-port serving (UI + API)
- ✅ **Project Management** — Multi-project support with card counts and per-project prefix configuration

#### Skill Evaluation Framework
- ✅ **Skill Eval Runner** (`bun run eval:skill`) — Completion-only harness: sends SKILL.md + scenario prompts to an Ollama model, parses the JSON plan of API calls, and scores against expected criteria (endpoint, method, body fields, ordering, NEVER violations); saves timestamped run folder with raw responses, scored results, and HTML report
- ✅ **Model Sweep** (`bun run eval:models`) — Runs the same eval across multiple Ollama models in sequence; produces a ranked comparison table; `--wait` flag to evict prior model from GPU before the next loads
- ✅ **Run Comparison** (`bun run eval:compare`) — Generates a visual HTML timeline across all runs for a skill with color-coded pass rates, skill-snapshot diff markers, and model column; pinpoints when a SKILL.md edit helped or hurt

### Planned (Post-MVP)
- 📋 **User Attribution** — Track who made each change (agent identity via `X-DevPlanner-Actor` header)
- 📋 **WebSocket Smart Merge** — Prevent edit interruptions when agents update cards being edited
- 📋 **Multi-Agent Support** — Coordinate multiple AI agents with claim/release, session registry
- 📋 **Sub-task Support** — Nested checklists with indentation
- 📋 **Dashboard View** — Project health metrics at a glance

## Project Documents

| File | Purpose |
|------|---------|
| [BRAINSTORM.md](BRAINSTORM.md) | Design decisions, resolved questions, future ideas |
| [SPECIFICATION.md](SPECIFICATION.md) | Technical spec — file formats, API contracts, component architecture |
| [TASKS.md](TASKS.md) | Phased build plan with task checklist |
| [tools/skill-evals/README.md](tools/skill-evals/README.md) | Skill Eval Framework — running evals, model sweeps, comparing runs, adding new skills |
