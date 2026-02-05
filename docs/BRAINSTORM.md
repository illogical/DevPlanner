# DevPlanner - AI-Collaborative Kanban Board

A file-based Kanban board web app designed for iterative software development with AI agents. Plain-text storage using Markdown and JSON enables both humans and AI assistants to read, search, and modify project data directly.

---

## Core Philosophy

- **Plain-text first**: All data stored as Markdown and JSON files - no database required
- **AI-native**: Designed from the ground up for AI agents to read, search, and update
- **Human-readable**: File structure that makes sense when browsing in a file manager or code editor and versioned with git
- **Convention-based**: YAML frontmatter and folder structure follow industry-standard patterns (Jekyll, Hugo, static site generators)

---

## File Structure Architecture

The **workspace base path** is user-configurable via environment variable (`DEVPLANNER_WORKSPACE`). All projects live under this path.

```
$DEVPLANNER_WORKSPACE/
└── <project-name>/                         # Each folder is a project
    ├── _project.json                       # Project metadata & lane configuration
    │
    ├── 01-upcoming/                        # Kanban lanes as numbered folders
    │   ├── user-auth.md                    # Cards: slugified title
    │   └── api-endpoints.md
    │
    ├── 02-in-progress/
    │   └── ui-layout.md
    │
    ├── 03-complete/
    │   └── project-setup.md
    │
    ├── 04-archive/                         # Archived/closed cards
    │
    └── _references/                        # (Post-MVP) Project-level files and links
        ├── links.json
        └── <attached files>
```

### Card Filename Convention

Format: `slugified-title.md`

- **Slugified title**: Lowercase, hyphens for spaces, alphanumeric only - provides human-readable browsing
- **Title in frontmatter is source of truth**: If the card title changes, the filename does NOT need to change. This avoids broken references and unnecessary file renames.
- Example: A card titled "User Authentication System" → `user-authentication-system.md`

### Lane Ordering Strategy

Numbered prefixes on lane folders (e.g., `01-upcoming`, `02-in-progress`).

- Natural sort order works in file managers, terminals, and code
- No separate config file needed to track order
- Easy to insert new lanes by renumbering or adding e.g. `05-review`
- `_project.json` stores display names, colors, and visibility so the UI hides the numeric prefixes

### Default Lanes (MVP)

| Folder | Display Name | Default Visibility |
|--------|-------------|-------------------|
| `01-upcoming` | Upcoming | Visible |
| `02-in-progress` | In Progress | Visible |
| `03-complete` | Complete | Hidden by default |
| `04-archive` | Archive | Hidden by default |

Complete and Archive lanes are hidden by default to save screen space. Users can toggle their visibility.

---

## Project Metadata (`_project.json`)

```json
{
  "name": "DevPlanner",
  "description": "AI-collaborative Kanban board for software development",
  "created": "2024-01-15T10:30:00Z",
  "updated": "2024-01-20T14:22:00Z",
  "lanes": {
    "01-upcoming": { "displayName": "Upcoming", "color": "#6b7280" },
    "02-in-progress": { "displayName": "In Progress", "color": "#3b82f6" },
    "03-complete": { "displayName": "Complete", "color": "#22c55e", "collapsed": true },
    "04-archive": { "displayName": "Archive", "hidden": true }
  },
  "defaultLane": "01-upcoming",
  "references": []
}
```

**Why JSON for project metadata**:
- Structured data that benefits from schema validation
- Easy to parse programmatically
- Lane configuration with colors, visibility, display names
- Not primarily human-authored content

---

## Card Format (Markdown with YAML Frontmatter)

Individual cards use **YAML frontmatter** for structured metadata, with free-form Markdown below. Frontmatter is the industry standard used by Jekyll, Hugo, Astro, and most static site generators. `gray-matter` provides mature parsing support.

### Example Card: `user-authentication-system.md`

```markdown
---
title: User Authentication System
status: in-progress
priority: high
assignee: user
created: 2024-01-15T10:30:00Z
updated: 2024-01-20T14:22:00Z
tags:
  - feature
  - security
---

Implement OAuth2 authentication flow with support for Google and GitHub providers.

## Tasks

- [ ] Set up OAuth2 client configuration
- [ ] Implement login redirect flow
- [x] Create user session management
- [ ] Add logout functionality
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Display title (source of truth, filename may differ) |
| `status` | string | No | Sub-state within a lane: `blocked`, `review`, `testing` |
| `priority` | string | No | `low`, `medium`, `high` |
| `assignee` | string | No | `user` or `agent` - who is responsible for this card |
| `created` | ISO 8601 | Yes | Auto-set on card creation |
| `updated` | ISO 8601 | Yes | Auto-set on any modification |
| `tags` | string[] | No | Categorization tags |
| `references` | string[] | No | (Post-MVP) Associated files and URLs |

---

## Card Status Conventions

Cards can have status tracked in two ways:

### 1. Lane-based Status (Primary)
The folder a card lives in determines its primary status:
- `01-upcoming/` → Not started
- `02-in-progress/` → Active work
- `03-complete/` → Done

### 2. Frontmatter Status (Secondary/Granular)
For more nuanced tracking within a lane:
```yaml
status: in-progress      # or: blocked, review, testing
```

**Suggestion**: The frontmatter `status` field allows sub-states like `blocked` or `needs-review` while the card remains in the "In Progress" lane. This gives flexibility without requiring many lanes.

---

## Backend API

**Runtime**: Bun + Elysia on port `17103`
**Architecture**: REST API → Service layer → File I/O. The service layer is the core logic for reading/writing Markdown and JSON. Both the REST API and the future MCP server will use the same service layer.

### MVP Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all projects in `$DEVPLANNER_WORKSPACE` |
| `POST` | `/api/projects` | Create new project (folder + `_project.json`) |
| `DELETE` | `/api/projects/:project` | Archive a project |
| `GET` | `/api/projects/:project/cards` | List all cards across all lanes |
| `POST` | `/api/projects/:project/cards` | Add new card (title only → creates .md file) |
| `GET` | `/api/projects/:project/cards/:card` | Get card content and parsed frontmatter |
| `DELETE` | `/api/projects/:project/cards/:card` | Move card to archive lane |
| `POST` | `/api/projects/:project/cards/:card/tasks` | Add a new checklist item to a card |
| `PATCH` | `/api/projects/:project/cards/:card/tasks/:index` | Set task status (unchecked / in-progress / complete) |
| `PATCH` | `/api/projects/:project/cards/:card/move` | Move card to a different lane |

### Service Layer

The service layer handles all file I/O and Markdown parsing. Key responsibilities:
- Parse YAML frontmatter with `gray-matter`
- Read/write Markdown files with checklist manipulation
- Create folder structures for new projects and lanes
- Move files between lane directories
- Auto-update the `updated` timestamp in frontmatter on any write

### Unit Tests

- Unit tests for each service layer method
- Test Markdown parsing, frontmatter extraction, checklist toggling
- Test file creation, file moves between lanes, project scaffolding
- Test edge cases: special characters in titles, empty cards, missing frontmatter

### Seed Data Script

TypeScript script to generate sample data for development and manual verification:
- Creates seed projects: "Media Manager", "LM API", "Memory API"
- Adds sample cards with checklist items in various lanes
- Provides realistic data to verify frontend rendering and checkbox toggling

### Conflict Handling

For the edge case where a card is edited in the web UI and by an AI agent simultaneously:
- **Optimistic locking**: When a user opens a card for editing, the UI holds the `updated` timestamp. On save, the backend checks if the file's timestamp has changed. If it has, the user is shown a conflict notice with the option to review the external changes before saving.
- **Future enhancement**: Queue up agent changes for review when the user has a card open in edit mode.


## Web Frontend Features

**Design**: Dark mode from the start, modern interface, responsive layout, mouse-friendly (no keyboard shortcuts for MVP).

### MVP Features

#### Project Sidebar / Navigation
- [ ] List all projects from the workspace
- [ ] Create new project (title + optional description)
- [ ] Delete/archive projects

#### Kanban Board View
- [ ] Display lanes left-to-right based on folder order
- [ ] Render card previews within each lane (title, task progress indicator, assignee badge)
- [ ] Complete and Archive lanes hidden by default, toggleable
- [ ] Drag-and-drop cards between lanes (moves the .md file via API)
- [ ] Plus button at the top of each lane to quick-add a card to that lane

#### Card Interactions
- [ ] Click card to open a detail/read view (rendered Markdown via `marked`)
- [ ] Quick-add card: enter title only, card created in that lane via API
- [ ] Checkbox toggling directly on the card detail view (calls `PATCH .../tasks/:index`)
- [ ] Move card to a different lane (dropdown or drag-and-drop)
- [ ] Delete card (moves to archive lane)
- [ ] Card preview shows: title, checklist progress (e.g., "3/5"), assignee icon

#### Card Detail View (Read + Task Toggle)
- [ ] Render card Markdown content as read-only HTML
- [ ] Interactive checkboxes that toggle task status via API
- [ ] Display frontmatter metadata (assignee, priority, tags, dates)
- [ ] Card content is edited externally (in a code editor or by an AI agent) for now

### Future Features

#### Markdown Editor (Post-MVP)
- [ ] Rich Markdown editing with live preview or split view
- [ ] Button to add checklist item
- [ ] Button to insert code block with language picker
- [ ] Syntax highlighting in code blocks (Prism.js or highlight.js)
- [ ] Auto-save on save button click

#### Search & Filter
- [ ] Full-text search across all cards
- [ ] Filter by tags, assignee, priority
- [ ] Filter by status/lane
- [ ] Search within a single project

#### Reference Management (Post-MVP)
- [ ] Panel showing project-level references (files + links)
- [ ] Add link via URL paste
- [ ] Browse/upload file to `_references/` folder
- [ ] Associate references with specific cards via frontmatter

#### Collaboration Indicators
- [ ] Show "last modified by" (user vs agent) based on assignee or commit info
- [ ] Activity log/history for cards
- [ ] Visual indicator when card was modified externally since last viewed

#### Additional Views
- [ ] List view (alternative to Kanban)

---

## AI Agent Integration

### Integration Approaches

#### Option 1: Direct File Access
AI agents with filesystem access can read/write the Markdown and JSON files directly.

**Pros**: Simple, no additional infrastructure
**Cons**: No validation, potential for malformed files, no real-time sync

#### Option 2: MCP Server (Recommended)
Build an MCP (Model Context Protocol) server that exposes the Kanban board as tools.

```typescript
// Example MCP tools
tools: [
  {
    name: "list_projects",
    description: "List all projects in the Kanban board"
  },
  {
    name: "search_cards",
    description: "Search cards by keyword across projects",
    parameters: { query: string, project?: string }
  },
  {
    name: "get_card",
    description: "Get full content of a specific card",
    parameters: { project: string, card: string }
  },
  {
    name: "update_card_status",
    description: "Move a card to a different lane",
    parameters: { project: string, card: string, lane: string }
  },
  {
    name: "add_card",
    description: "Create a new card in a project",
    parameters: { project: string, title: string, content?: string, lane?: string }
  },
  {
    name: "update_card_checklist",
    description: "Toggle a checklist item in a card",
    parameters: { project: string, card: string, itemIndex: number, checked: boolean }
  },
  {
    name: "get_card_context",
    description: "Get card content plus contents of referenced files and summaries of linked URLs",
    parameters: { project: string, card: string, includeFileContents?: boolean, fetchLinks?: boolean }
  },
  {
    name: "get_project_references",
    description: "List all files and links associated with a project",
    parameters: { project: string }
  }
]
```

**Pros**: Structured access, validation, atomic operations, works with any MCP-compatible agent
**Cons**: Additional server to run

#### Option 3: Agent Skill/Slash Command
For Claude Code specifically, create a skill that provides specialized prompts and file patterns.

**Pros**: Lightweight, no server needed
**Cons**: Only works in Claude Code, less structured

#### Recommendation: Hybrid Approach
1. **Primary**: MCP server for structured, validated access
2. **Fallback**: Direct file access patterns documented for agents without MCP
3. **Enhancement**: Claude Code skill for convenient slash commands

### AI-Specific Features

#### Search Capabilities
- Keyword search across project names, card titles, and content
- Tag-based filtering
- Status-based queries ("show me all in-progress cards")
- Return results with file paths for direct access

#### Update Operations
- Create new cards with proper frontmatter
- Move cards between lanes (file move operation)
- Update card content while preserving frontmatter
- Toggle checklist items
- Add/remove tags
- Update status and priority

#### Context Gathering
- "Get project context" - returns project metadata + all card titles + references
- "Get card with related files" - returns card content + contents of referenced files
- "Get project progress" - summary of cards by status/lane

#### File & Link Review (AI Context Loading)
A key capability for AI-assisted development: the agent should be able to **review all files and links associated with a card** before working on that task.

**Use Case**: When an AI agent picks up a card like "Implement user authentication", it needs to:
1. Read the card's Markdown content (requirements, checklist, notes)
2. Access referenced local files (e.g., `src/auth/oauth.ts`, design diagrams)
3. Fetch and summarize referenced URLs (e.g., OAuth documentation, API specs)
4. Understand the broader project context (other related cards, project-level references)

**MCP Tools for Context Loading**:
```typescript
{
  name: "get_card_context",
  description: "Get a card's full context including referenced file contents and link summaries",
  parameters: {
    project: string,
    card: string,
    includeFileContents: boolean,  // Read and include local file contents
    fetchLinks: boolean,           // Fetch and summarize URLs
    includeRelatedCards: boolean   // Include cards with overlapping tags/references
  }
}
```

**Reference Types to Support**:
- **Local files**: Read contents directly (code files, configs, docs)
- **Local images/diagrams**: Return file path for display or describe if AI has vision
- **URLs**: Fetch and summarize web content (docs, specs, issues, PRs)
- **GitHub links**: Parse and fetch via GitHub API (issues, PRs, code permalinks)

**Workflow Example**:
1. AI calls `get_card_context` for the task it's working on
2. Receives: card content + file contents + link summaries + related cards
3. AI now has full context to implement the feature or answer questions
4. After completing work, AI updates the card (checklist, status, adds notes)

---

## Technical Stack

### Backend
- **Runtime**: Bun
- **Framework**: Elysia
- **Markdown parsing**: `gray-matter` (frontmatter), raw string manipulation for checklists
- **File watching**: Bun native watch or `chokidar` (for pushing live updates to frontend)

### Frontend
- **Framework**: React (via Vite)
- **Styling**: Tailwind CSS
- **Markdown rendering**: `marked` (read-only card detail view)
- **Drag-and-drop**: `@dnd-kit/core` (actively maintained, accessible)
- **State management**: Zustand (lightweight, minimal boilerplate)

### MCP Server (Post-MVP)
- TypeScript-based MCP server
- Reuses the same service layer as the Elysia backend
- No duplicated file I/O logic

---

## Summary of Suggestions

1. **Numbered folder prefixes for lane ordering** - natural sort, no config file needed
2. **YAML frontmatter** - industry standard, cleaner than JSON code blocks, mature library support
3. **Dual status tracking** - lane = primary status, frontmatter `status` = sub-states (blocked, review)
4. **`_project.json` for project config** - structured data separate from content
5. **Archive lane instead of deletion** - preserve history, allow restoration
6. **Slugified filenames** - `slugified-title.md` with title in frontmatter as source of truth
7. **Assignee field** - `user` or `agent` to track who owns each card
8. **API-first architecture** - service layer shared between REST API and future MCP server
9. **Optimistic locking** - timestamp-based conflict detection for concurrent edits
10. **AI context loading** - agent can fetch all referenced files and links before working on a task
11. **Shared service layer for MCP** - MCP server reuses the same service classes as the REST API, no duplicated logic

### Additional Suggestions Based on Feedback

12. **Checklist task states**: Consider supporting three checklist states in Markdown: `- [ ]` (unchecked), `- [~]` or `- [/]` (in-progress), `- [x]` (complete). This maps to the three states you want for task tracking. Standard Markdown renderers only know `[ ]` and `[x]`, so the in-progress marker would need custom rendering in the frontend. Alternative: use `- [ ] 🔄 Task description` with an emoji prefix, or track in-progress state separately in frontmatter.

13. **Card progress on board view**: Show a progress indicator on each card preview in the Kanban board (e.g., "3/5 tasks" or a small progress bar). This gives at-a-glance visibility without opening the card.

14. **Seed script as dev tool**: The seed script should be idempotent (safe to re-run) and should clean up before recreating. Consider making it a `bun run seed` command in package.json.

15. **File watching for live reload**: Use `chokidar` or Bun's native `watch` to detect external file changes (AI agent edits, manual file edits). Push updates to the frontend via WebSocket or Server-Sent Events so the board reflects changes in real time without manual refresh.

---

## Resolved Decisions

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Base path config | User-configurable via `DEVPLANNER_WORKSPACE` env var |
| 2 | File naming | Auto-generated slugified filename from title, title in frontmatter is source of truth |
| 3 | Conflict handling | Optimistic locking with timestamp check; future: queue agent changes during user edits |
| 4 | Initial lanes | 4 lanes: Upcoming, In Progress, Complete (hidden), Archive (hidden) |
| 5 | Reference files | Post-MVP |
| 6 | Mobile support | Responsive design from the start |
| 7 | MCP server timing | After web UI is functional |
| 8 | AI feature priority | Card creation → status updates → search |
| 9 | Context loading | Return URLs for agent to fetch selectively (no auto-fetch) |
| 10 | Offline support | Not needed |
| 11 | Multi-user | Single user; assignee is `user` or `agent` |
| 12 | Version control | Manual (user manages git) |
| 13 | Quick-add flow | Plus button at top of each lane, card added to that lane |
| 14 | Keyboard shortcuts | Not needed for MVP; mouse-friendly first |
| 15 | Dark mode | From the start, modern interface |
| 16 | Markdown editor | Post-MVP; card content edited externally for now; UI provides read view + task toggling |

---

## Open Question: Validation Strictness for AI Operations

**Permissive (auto-fix malformed input)**:
- Pros: Less friction for AI, faster operations, graceful degradation
- Cons: May mask bugs in AI integration, silent corrections could produce unexpected data, harder to debug

**Strict (reject and explain)**:
- Pros: Catches integration bugs early, maintains data integrity, clear error messages help the AI self-correct on retry
- Cons: More round-trips if the AI makes formatting mistakes

**Recommendation**: Strict with helpful error messages. AI agents (especially Claude) are good at self-correcting when they get a clear error explaining what went wrong. This catches malformed data early and keeps the files clean. The error responses should include what was wrong and what the expected format is.

---

## Follow-Up Questions for Specification

### API Design
1. **Task status representation in Markdown**: For in-progress tasks, which convention do you prefer?
   - Option A: `- [~] Task description` (custom marker, needs custom rendering)
   - Option B: `- [-] Task description` (another common convention)
   - Option C: Track in-progress at the card level only (frontmatter), keep checkboxes binary `[ ]`/`[x]`

Use option C

2. **Card ordering within a lane**: Should cards have a sort order? Options: explicit order in a lane config, or drag-and-drop order stored somewhere?

We could use either a JSON file for this or a hidden Markdown file to track the order of the cards and support drag and drop.

3. **Project deletion**: Hard delete vs soft delete (rename folder with a `_deleted_` prefix or move to a top-level archive)?
No need for a delete; instead, make it an archive feature and move the card to the archive lane.

### Frontend
4. **Card detail view**: Should it be a modal/overlay on the Kanban board, or a full-page view (navigates away from the board)?
It should be an overlay, ideally a panel that slides in from the right side
5. **Lane visibility toggle**: Should the hidden lanes (Complete, Archive) appear as collapsed columns or be completely absent until toggled on via a button in the header?
They should be collapsed, and their titles should be out of the way until clicked, and then their lane will be added as the right-most lane. It will need a small glyph button to be able to minimize it out of the way again.

6. **Project switching**: Sidebar that's always visible, or a dropdown/selector in the top nav?
A sidebar that is displayed by default but can be toggled to be hidden away on the left side

### AI Agent
7. **Agent assignment flow**: When an AI agent is assigned a card, should the card auto-move to "In Progress", or should the agent explicitly move it?
Wait for the agent to move the card to In Progress.
8. **Validation strictness**: Based on the pros/cons above, do you want strict (recommended) or permissive?
Strict

---

## Next Steps

1. Resolve remaining follow-up questions
2. Create `SPECIFICATION.md` with exact file formats, API contracts, and component structure
3. Set up project scaffolding (Bun + Vite + React + Elysia)
4. Implement service layer + API endpoints with unit tests
5. Run seed script to generate test data
6. Build Kanban frontend against the API
7. Add MCP server (post-MVP, reusing service layer)
