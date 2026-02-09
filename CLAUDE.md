# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DevPlanner is a file-based Kanban board for iterative software development with AI agents. All project data is stored as plain-text Markdown and JSON files — no database. Both humans and AI can read/modify project data through the filesystem or the REST API.

## Commands

```bash
# Install dependencies (must do both)
bun install
cd frontend && bun install && cd ..

# Run full stack (backend + frontend with concurrently)
bun run dev

# Run separately
bun run dev:backend        # Bun with --watch on src/server.ts
bun run dev:frontend       # Vite dev server

# MCP Server (AI agent integration)
bun run mcp                # Start MCP server with stdio transport

# Tests (Bun test runner, backend only)
bun test                   # Run all tests
bun test --filter "card"   # Run tests matching pattern

# Frontend lint
cd frontend && bun run lint

# Build frontend for production
bun run build              # Runs tsc -b && vite build in frontend/

# Start production server
bun run start

# Seed demo data (idempotent, creates 3 sample projects)
bun run seed

# Verify WebSocket and file watching (Phase 12)
bun run verify:websocket

# Run E2E demo (exercises real-time features)
bun run demo:e2e
```

## Architecture

**Monorepo** with backend at root and frontend in `frontend/`.

### Backend (Bun + Elysia)

- **Entry**: `src/server.ts` — Elysia app setup, error handler, route registration
- **MCP Server**: `src/mcp-server.ts` — Model Context Protocol server for AI agents (stdio transport)
- **Routes** (`src/routes/`): Thin handlers that delegate to services. Resources: projects, cards, tasks
- **Services** (`src/services/`): All business logic and file I/O
  - `config.service.ts` — Singleton, loads `DEVPLANNER_WORKSPACE` and `PORT` from env
  - `markdown.service.ts` — Pure functions for frontmatter parsing (`gray-matter`), checklist manipulation
  - `project.service.ts` — Project CRUD against `_project.json` files
  - `card.service.ts` — Card CRUD, lane moves, reordering via `_order.json`
  - `task.service.ts` — Checklist add/toggle within card Markdown files
  - `history.service.ts` — Activity tracking (Phase 16)
  - `file-watcher.service.ts` — External file change detection (Phase 13)
  - `websocket.service.ts` — Real-time updates (Phase 12)
- **MCP** (`src/mcp/`): MCP server implementation (Phase 18)
  - `tool-handlers.ts` — 17 tool implementations (CRUD + smart/workflow)
  - `resource-providers.ts` — 3 resource providers (projects, cards)
  - `types.ts` — MCP-specific type definitions
  - `schemas.ts` — JSON schemas for all tool inputs
  - `errors.ts` — LLM-friendly error messages with suggestions
- **Tests** (`src/__tests__/` and `src/mcp/__tests__/`): Unit tests for all services and utilities

### Frontend (React 19 + Vite + Tailwind 4)

- **State**: Single Zustand store (`frontend/src/store/index.ts`) — all project/card/task state and actions
- **API client** (`frontend/src/api/client.ts`): Typed fetch wrappers for all endpoints
- **Layout**: CSS grid with collapsible sidebar (`MainLayout` > `Header` + `ProjectSidebar` + content)
- **Kanban**: `KanbanBoard` renders `Lane` components (expanded) and `CollapsedLaneTab` (collapsed)
- **Card detail**: Slide-in panel from right using Framer Motion
- **Styling**: Tailwind CSS v4, dark mode by default (class-based)
- **Vite proxy**: `/api` requests proxy to backend at `http://localhost:17103`

### Data Storage (Workspace)

Configured via `DEVPLANNER_WORKSPACE` env var (see `.env`). Structure:

```
workspace/
└── project-slug/
    ├── _project.json          # Project metadata + lane config
    ├── 01-upcoming/
    │   ├── _order.json        # Card display order
    │   └── card-slug.md       # YAML frontmatter + Markdown body + checklist
    ├── 02-in-progress/
    ├── 03-complete/
    └── 04-archive/
```

Cards are `.md` files with YAML frontmatter (title, status, priority, assignee, tags, dates) and a `## Tasks` section with `- [ ]`/`- [x]` checklists. Card slugs are unique across all lanes in a project — the card service searches all lane directories to locate a card by slug.

### API

REST endpoints under `/api`:
- `/api/projects` — CRUD, archive via DELETE
- `/api/projects/:slug/cards` — Card CRUD, `GET` supports `?lane=` filter
- `/api/projects/:slug/cards/:cardSlug/move` — PATCH to move between lanes
- `/api/projects/:slug/cards/:cardSlug/tasks` — POST to add, PATCH `/:index` to toggle
- `/api/projects/:slug/lanes/:lane/order` — PATCH to reorder cards

Error responses follow: `{ error: string, message: string, expected?: string }`

## Key Patterns

- **Slug generation** (`src/utils/slug.ts`): Lowercase, replace non-word chars with hyphens, trim. Duplicate slugs get numeric suffix (`my-card-2.md`).
- **Lane directories** are numbered for natural sort order (`01-upcoming`, `02-in-progress`, etc.).
- **Config singleton**: `ConfigService.getInstance()` — validates env vars once at startup.
- **Frontend state flow**: Components call Zustand actions → actions call API client → update store → components re-render.
- Default lanes: Upcoming, In Progress, Complete, Archive (defined in `src/constants.ts`).

## Environment

- Runtime: **Bun** (not Node.js)
- Backend port: `17103` (configured via `PORT` env var)
- `DEVPLANNER_WORKSPACE`: Required env var pointing to the workspace directory
