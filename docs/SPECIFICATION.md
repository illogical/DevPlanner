# DevPlanner - Technical Specification

This document defines the exact file formats, API contracts, service layer architecture, frontend component structure, and implementation details for the DevPlanner MVP.

Refer to `BRAINSTORM.md` for the full context of design decisions and resolved questions.

---

## 1. Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEVPLANNER_WORKSPACE` | Yes | — | Absolute path to the workspace directory containing project folders |
| `PORT` | No | `17103` | Port for the Elysia backend server |
| `DEVPLANNER_BACKUP_DIR` | No | `{workspace}/_backups` | Directory for workspace backup archives |
| `DISABLE_FILE_WATCHER` | No | `false` | When `true`, disables filesystem monitoring. All real-time updates come from API WebSocket broadcasts instead |
| `ARTIFACT_BASE_URL` | No | — | Base URL prefix for vault artifact links (e.g. `https://viewer.example.com/view?path=10-Projects`). Required to enable vault artifact creation and the Diff Viewer. |
| `ARTIFACT_BASE_PATH` | No | — | Absolute path to the directory where artifact files are written. Required to enable vault artifact creation and the Diff Viewer. |

The backend validates that `DEVPLANNER_WORKSPACE` exists and is a readable directory on startup. If missing, the server exits with a clear error message.

### Real-Time Update Strategy

DevPlanner supports two modes for real-time updates:

1. **API-driven (recommended)**: When `DISABLE_FILE_WATCHER=true`, all data modifications go through the API, which broadcasts WebSocket events immediately after each operation. This ensures instant, synchronized updates across all connected clients.

2. **File watcher (legacy)**: When file watching is enabled (default), the backend monitors the workspace directory for external file changes and broadcasts WebSocket events. This adds ~100-200ms latency and is primarily useful if external tools (AI agents, file editors) modify cards directly on disk.

**Note**: The file watcher is being phased out in favor of API-only workflows with an MCP server for programmatic access. Set `DISABLE_FILE_WATCHER=true` for optimal performance.

---

## 2. File Format Schemas

### 2.1 Directory Structure

```
$DEVPLANNER_WORKSPACE/
├── _preferences.json                   # Workspace-level preferences
├── media-manager/                      # Project: folder name is the slug
│   ├── _project.json                   # Project metadata + card ID config
│   ├── _history.json                   # Persisted activity history events
│   ├── 01-upcoming/
│   │   ├── _order.json                 # Card display order within this lane
│   │   ├── user-auth.md
│   │   └── api-endpoints.md
│   ├── 02-in-progress/
│   │   ├── _order.json
│   │   └── ui-layout.md
│   ├── 03-complete/
│   │   ├── _order.json
│   │   └── project-setup.md
│   └── 04-archive/
│       └── _order.json
│
└── lm-api/
    ├── _project.json
    ├── 01-upcoming/
    │   └── _order.json
    └── ...
```

### 2.2 `_project.json` Schema

```jsonc
{
  // Display name for the UI (does not need to match folder name)
  "name": "Media Manager",

  // Optional project description
  "description": "Media asset management application",

  // Card ID prefix (uppercase, 1-5 chars). Used to generate cardId: "MM-1", "MM-2", etc.
  "prefix": "MM",

  // Next card number to assign (auto-incremented on card creation)
  "nextCardNumber": 5,

  // ISO 8601 timestamps, auto-managed
  "created": "2026-02-04T10:00:00Z",
  "updated": "2026-02-04T14:30:00Z",

  // Whether this project is archived (hidden from default list)
  "archived": false,

  // Lane configuration keyed by folder name
  "lanes": {
    "01-upcoming": {
      "displayName": "Upcoming",
      "color": "#6b7280",
      "collapsed": false
    },
    "02-in-progress": {
      "displayName": "In Progress",
      "color": "#3b82f6",
      "collapsed": false
    },
    "03-complete": {
      "displayName": "Complete",
      "color": "#22c55e",
      "collapsed": true
    },
    "04-archive": {
      "displayName": "Archive",
      "color": "#9ca3af",
      "collapsed": true
    }
  }
}
```

**TypeScript interface:**

```typescript
interface ProjectConfig {
  name: string;
  description?: string;
  prefix?: string;         // Card ID prefix (e.g., "MM"). Auto-generated from name if not set.
  nextCardNumber?: number;  // Next card number to assign (default: 1)
  created: string;          // ISO 8601
  updated: string;          // ISO 8601
  archived: boolean;
  lanes: Record<string, LaneConfig>;
}

interface LaneConfig {
  displayName: string;
  color: string;      // Hex color
  collapsed: boolean;
}
```

### 2.3 `_order.json` Schema

Each lane folder contains an `_order.json` file that defines the display order of cards within that lane. This enables drag-and-drop reordering.

```json
["user-auth.md", "api-endpoints.md"]
```

**Rules:**
- Array of card filenames (strings) in display order
- Cards present in the folder but absent from `_order.json` are appended to the end (sorted alphabetically) — this gracefully handles cards added externally by an AI agent or file editor
- Entries in `_order.json` for files that no longer exist in the folder are silently ignored
- Created automatically when a project is created (empty array `[]`)
- Updated by the API on card creation, deletion, and reorder operations

### 2.4 Card Markdown Format

Cards are individual `.md` files with YAML frontmatter.

**Filename**: Slugified from the card title at creation time. Lowercase, hyphens for spaces, alphanumeric and hyphens only. The title in frontmatter is the source of truth for display.

**Slug function**: `"My Card Title!" → "my-card-title"`

```markdown
---
title: User Authentication System
status: in-progress
priority: high
assignee: user
created: 2026-02-04T10:00:00Z
updated: 2026-02-04T14:30:00Z
tags:
  - feature
  - security
links:
  - id: 550e8400-e29b-41d4-a716-446655440000
    label: OIDC Core Specification
    url: https://openid.net/specs/openid-connect-core-1_0.html
    kind: spec
    createdAt: 2026-02-04T10:05:00Z
    updatedAt: 2026-02-04T10:05:00Z
  - id: 6ba7b810-9dad-11d1-80b4-00c04fd430c8
    label: Obsidian Auth Design Notes
    url: https://publish.obsidian.md/myvault/auth-design
    kind: doc
    createdAt: 2026-02-04T10:06:00Z
    updatedAt: 2026-02-04T10:06:00Z
---

Implement OAuth2 authentication flow with support for Google and GitHub providers.

## Tasks

- [ ] Set up OAuth2 client configuration
- [ ] Implement login redirect flow
- [x] Create user session management
- [ ] Add logout functionality
```

**TypeScript interfaces:**

```typescript
type LinkKind = 'doc' | 'spec' | 'ticket' | 'repo' | 'reference' | 'other';

interface CardLink {
  id: string;           // UUID v4
  label: string;        // Display label (e.g. "OIDC Specification")
  url: string;          // Normalized http/https URL
  kind: LinkKind;       // Semantic category
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}

interface CardFrontmatter {
  title: string;
  description?: string;  // Short 1–5 sentence summary of the card
  status?: 'in-progress' | 'blocked' | 'review' | 'testing';
  priority?: 'low' | 'medium' | 'high';
  assignee?: 'user' | 'agent';
  created: string;    // ISO 8601
  updated: string;    // ISO 8601
  tags?: string[];
  blockedReason?: string;  // Free-text reason when status is "blocked"
  taskMeta?: Array<{ addedAt: string; completedAt: string | null }>; // Per-task timestamps (index-aligned)
  links?: CardLink[];  // URL references attached to the card
}

interface Card {
  slug: string;           // Filename without .md extension
  filename: string;       // Full filename (e.g., "user-auth.md")
  lane: string;           // Lane folder name (e.g., "02-in-progress")
  cardId: string | null;  // Computed: "{prefix}-{cardNumber}" e.g. "DE-12". Null if either missing.
  frontmatter: CardFrontmatter;
  content: string;        // Markdown body (everything below frontmatter)
  tasks: TaskItem[];      // Parsed checklist items
}

interface CardSummary {
  slug: string;
  filename: string;
  lane: string;
  cardId: string | null;  // Computed: "{prefix}-{cardNumber}" e.g. "DE-12". Null if either missing.
  frontmatter: CardFrontmatter;
  taskProgress: { total: number; checked: number };
}

interface TaskItem {
  index: number;          // 0-based position in the checklist
  text: string;           // Task description text
  checked: boolean;       // true = [x], false = [ ]
  addedAt?: string;       // ISO 8601 timestamp when task was created via API
  completedAt?: string | null; // ISO 8601 timestamp when checked; null if unchecked
}
```

### 2.5 Checklist Conventions

Checklists use standard Markdown checkbox syntax:

| Syntax | Meaning |
|--------|---------|
| `- [ ] Task` | Unchecked / not started |
| `- [x] Task` | Complete |

In-progress status is tracked at the **card level** via the frontmatter `status` field, not at the individual task level. This keeps the Markdown standard-compatible and avoids custom rendering for MVP.

---

## 3. Backend API

**Base URL**: `http://localhost:17103`
**Content-Type**: `application/json` for all requests and responses

All endpoints return JSON. Errors return a consistent error envelope.

### 3.1 Error Response Format

```typescript
interface ApiError {
  error: string;      // Machine-readable error code
  message: string;    // Human/AI-readable description of what went wrong
  expected?: string;  // What the correct format should be (for validation errors)
}
```

**HTTP Status Codes:**
- `200` — Success
- `201` — Created
- `400` — Validation error (with helpful `message` and `expected` fields)
- `404` — Project or card not found
- `409` — Conflict (optimistic locking failure)
- `500` — Internal server error

### 3.2 Project Endpoints

#### `GET /api/projects`

List all non-archived projects.

**Query Parameters:**
- `includeArchived` (boolean, default `false`) — Include archived projects

**Response `200`:**
```json
{
  "projects": [
    {
      "slug": "media-manager",
      "name": "Media Manager",
      "description": "Media asset management application",
      "created": "2026-02-04T10:00:00Z",
      "updated": "2026-02-04T14:30:00Z",
      "archived": false,
      "lanes": {
        "01-upcoming": { "displayName": "Upcoming", "color": "#6b7280", "collapsed": false },
        "02-in-progress": { "displayName": "In Progress", "color": "#3b82f6", "collapsed": false },
        "03-complete": { "displayName": "Complete", "color": "#22c55e", "collapsed": true },
        "04-archive": { "displayName": "Archive", "color": "#9ca3af", "collapsed": true }
      },
      "cardCounts": {
        "01-upcoming": 3,
        "02-in-progress": 1,
        "03-complete": 5,
        "04-archive": 2
      }
    }
  ]
}
```

#### `POST /api/projects`

Create a new project.

**Request Body:**
```json
{
  "name": "Media Manager",
  "description": "Media asset management application"
}
```

**Behavior:**
1. Slugify `name` to create the folder name
2. Create project folder in `$DEVPLANNER_WORKSPACE`
3. Create `_project.json` with default lane configuration
4. Create the 4 default lane subfolders, each with an empty `_order.json`

**Response `201`:**
```json
{
  "slug": "media-manager",
  "name": "Media Manager",
  "description": "Media asset management application",
  "created": "2026-02-04T10:00:00Z",
  "updated": "2026-02-04T10:00:00Z",
  "archived": false,
  "lanes": { ... }
}
```

**Errors:**
- `400` if `name` is empty or slug already exists

#### `PATCH /api/projects/:projectSlug`

Update project metadata (name, description) or archive/unarchive.

**Request Body (all fields optional):**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "archived": true
}
```

**Behavior:**
1. Read existing project configuration
2. Merge provided fields into configuration
3. Update the project's `updated` timestamp
4. Write modified configuration to `_project.json`
5. Broadcast `project:updated` WebSocket event to subscribed clients

**Response `200`:** Updated project object.

#### `DELETE /api/projects/:projectSlug`

Archive a project (sets `archived: true` in `_project.json`). Does **not** delete files.

**Behavior:**
1. Set `archived: true` in `_project.json`
2. Update the project's `updated` timestamp
3. Broadcast `project:updated` WebSocket event to subscribed clients

**Response `200`:****
```json
{
  "slug": "media-manager",
  "archived": true
}
```

### 3.3 Card Endpoints

#### `GET /api/projects/:projectSlug/cards`

List all cards across all lanes for a project.

**Query Parameters:**
- `lane` (string, optional) — Filter by lane folder name (e.g., `02-in-progress`)
- `since` (ISO 8601 string, optional) — Return only cards with `updated >= since`. Useful for finding recently changed cards (e.g., `?lane=03-complete&since=2026-02-18T07:50:00Z`)
- `staleDays` (integer, optional) — Return only cards whose `updated` is older than N days. Useful for detecting stale WIP (e.g., `?lane=02-in-progress&staleDays=3`)

**Response `200`:**
```json
{
  "cards": [
    {
      "slug": "user-auth",
      "filename": "user-auth.md",
      "lane": "01-upcoming",
      "cardId": "MM-1",
      "frontmatter": {
        "title": "User Authentication",
        "status": null,
        "priority": "high",
        "assignee": "user",
        "created": "2026-02-04T10:00:00Z",
        "updated": "2026-02-04T14:30:00Z",
        "tags": ["feature", "security"]
      },
      "taskProgress": {
        "total": 4,
        "checked": 1
      }
    }
  ]
}
```

Note: The list endpoint returns `taskProgress` summary but not the full `content` or `tasks` array. Use the individual card endpoint for full details.

#### `POST /api/projects/:projectSlug/cards`

Create a new card.

**Request Body:**
```json
{
  "title": "User Authentication",
  "description": "Implement OAuth2 login with Google and GitHub providers, including session management and token refresh.",
  "lane": "01-upcoming",
  "priority": "high",
  "assignee": "user",
  "tags": ["feature", "security"],
  "blockedReason": "Waiting for design sign-off"
}
```

Only `title` is required. Defaults: `lane` → `"01-upcoming"`, others omitted from frontmatter if not provided. The card body (Markdown content) starts empty; use the task endpoints to add checklist items.

**Behavior:**
1. Slugify `title` to create filename
2. If slug already exists in any lane, append a numeric suffix (`-2`, `-3`, etc.)
3. Create `.md` file with frontmatter in the target lane folder (body starts empty)
4. Append filename to that lane's `_order.json`
5. Broadcast `card:created` WebSocket event to subscribed clients

**Response `201`:**
```json
{
  "slug": "user-authentication",
  "filename": "user-authentication.md",
  "lane": "01-upcoming",
  "frontmatter": {
    "title": "User Authentication",
    "description": "Implement login with flexible providers, including session management and token refresh.",
    "priority": "high",
    "assignee": "user",
    "created": "2026-02-04T10:00:00Z",
    "updated": "2026-02-04T10:00:00Z",
    "tags": ["feature", "security"]
  },
  "content": "",
  "tasks": [],
  "taskProgress": { "total": 0, "checked": 0 }
}
```

#### `GET /api/projects/:projectSlug/cards/:cardSlug`

Get full card details.

**Response `200`:**
```json
{
  "slug": "user-auth",
  "filename": "user-auth.md",
  "lane": "02-in-progress",
  "cardId": "MM-1",
  "frontmatter": {
    "title": "User Authentication System",
    "status": "in-progress",
    "priority": "high",
    "assignee": "user",
    "created": "2026-02-04T10:00:00Z",
    "updated": "2026-02-04T14:30:00Z",
    "tags": ["feature", "security"]
  },
  "content": "Implement OAuth2 authentication flow...\n\n## Tasks\n\n- [ ] Set up OAuth2 client configuration\n- [x] Create user session management",
  "tasks": [
    { "index": 0, "text": "Set up OAuth2 client configuration", "checked": false },
    { "index": 1, "text": "Create user session management", "checked": true }
  ],
  "taskProgress": { "total": 2, "checked": 1 }
}
```

**Note:** The `cardSlug` parameter accepts either the card slug (filename without `.md`, e.g. `feature-auth`) or a card ID (e.g. `DEV-42`, `dev42`, `dev-42`). Card IDs are matched case-insensitively by card number within the project. When a card ID is supplied the API resolves it to the canonical slug automatically.

#### `DELETE /api/projects/:projectSlug/cards/:cardSlug`

Move card to the archive lane.

**Behavior:**
1. Move the `.md` file from its current lane to `04-archive/`
2. Remove from source lane's `_order.json`, append to archive's `_order.json`
3. Update the card's `updated` timestamp
4. Broadcast `card:moved` WebSocket event to subscribed clients

**Response `200`:**
```json
{
  "slug": "user-auth",
  "lane": "04-archive"
}
```

#### `PATCH /api/projects/:projectSlug/cards/:cardSlug/move`

Move a card to a different lane.

**Request Body:**
```json
{
  "lane": "02-in-progress",
  "position": 0
}
```

- `lane` (required): Target lane folder name
- `position` (optional): 0-based index in the target lane's order. If omitted, card is appended to the end.

**Behavior:**
1. Move the `.md` file from current lane folder to target lane folder
2. Remove from source lane's `_order.json`
3. Insert into target lane's `_order.json` at the specified position (or append)
4. Update the card's `updated` timestamp
5. Broadcast `card:moved` WebSocket event to subscribed clients

**Response `200`:** Full updated card object.

#### `PATCH /api/projects/:projectSlug/cards/:cardSlug`

Update card metadata. The Markdown body (including tasks) is **read-only** via this endpoint — use the task endpoints to add or modify checklist items.

**Request Body (all fields optional):**
```json
{
  "title": "Updated Card Title",
  "description": "Updated 1–5 sentence summary of the card.",
  "status": "blocked",
  "priority": "high",
  "assignee": "agent",
  "tags": ["feature", "urgent"],
  "blockedReason": "Waiting for design review"
}
```

To remove an optional field, set it to `null`:
```json
{
  "description": null,
  "priority": null,
  "status": null,
  "blockedReason": null
}
```

**Behavior:**
1. Read the existing card from disk
2. Merge provided fields into frontmatter (undefined fields are preserved, null removes the field)
3. Update the card's `updated` timestamp
4. Write the modified card back to disk (body content unchanged)
5. Broadcast `card:updated` WebSocket event to subscribed clients

**Response `200`:** Full updated card object with all fields.

**Note:** This endpoint does NOT move the card between lanes. Use `PATCH /cards/:cardSlug/move` for that.

#### `GET /api/projects/:projectSlug/cards/search`

Search cards by title, description, and task text.

**Query Parameters:**
- `q` (required): Search query string

**Response `200`:**
```json
{
  "cards": [
    {
      "slug": "user-auth",
      "filename": "user-auth.md",
      "lane": "02-in-progress",
      "cardId": "MM-1",
      "frontmatter": { ... },
      "taskProgress": { "total": 4, "checked": 1 }
    }
  ]
}
```

Cards are returned if the query matches (case-insensitive) the card title, description, or any task text.

### 3.4 Task Endpoints

#### `POST /api/projects/:projectSlug/cards/:cardSlug/tasks`

Add a new checklist item to a card.

**Request Body:**
```json
{
  "text": "Implement logout functionality"
}
```

Do **not** include leading `- [ ]` or `- ` in `text` — these are stripped automatically if present.

**Behavior:**
1. Strip any leading Markdown checkbox/list prefix from `text` (e.g. `"- [ ] Do X"` → `"Do X"`)
2. Parse the card's Markdown content
3. Find the last checklist item (line matching `- [ ] ` or `- [x] `) or the end of a `## Tasks` section
4. Append `- [ ] {text}` as a new line after the last checklist item
5. If no checklist exists yet, append a `## Tasks` section with the new item
6. Update the card's `updated` timestamp and append a new entry to `taskMeta` in frontmatter
7. Write the modified Markdown file
8. Broadcast `card:updated` WebSocket event to subscribed clients

**Response `201`:**
```json
{
  "index": 4,
  "text": "Implement logout functionality",
  "checked": false,
  "addedAt": "2026-02-20T10:00:00Z",
  "completedAt": null,
  "taskProgress": { "total": 5, "checked": 1 }
}
```

#### `PATCH /api/projects/:projectSlug/cards/:cardSlug/tasks/:taskIndex`

Toggle a task's checked state or update its text.

**Request Body (at least one field required):**
```json
{
  "checked": true,
  "text": "Updated task description"
}
```

- `checked` (optional): Set the task's checked state
- `text` (optional): Update the task's text content

**Behavior:**
1. Parse the card's Markdown content
2. Find the checklist item at the given 0-based index
3. If `checked` is provided: replace `- [ ]` with `- [x]` (or vice versa)
4. If `text` is provided: replace the task's text content
5. Update the card's `updated` timestamp
6. Write the modified Markdown file
7. Broadcast `task:toggled` WebSocket event to subscribed clients

**Response `200`:**
```json
{
  "index": 0,
  "text": "Set up OAuth2 client configuration",
  "checked": true,
  "taskProgress": { "total": 4, "checked": 2 }
}
```

**Errors:**
- `404` if task index is out of bounds

#### `DELETE /api/projects/:projectSlug/cards/:cardSlug/tasks/:taskIndex`

Delete a task from a card's checklist.

**Behavior:**
1. Parse the card's Markdown content
2. Find and remove the checklist item at the given 0-based index
3. Remove the corresponding entry from `taskMeta` array in frontmatter
4. Update the card's `updated` timestamp
5. Write the modified Markdown file
6. Broadcast `card:updated` WebSocket event to subscribed clients

**Response `200`:**
```json
{
  "tasks": [
    { "index": 0, "text": "Remaining task", "checked": false }
  ],
  "taskProgress": { "total": 1, "checked": 0 }
}
```

**Errors:**
- `404` if task index is out of bounds

### 3.5 Card Reorder Endpoint

#### `PATCH /api/projects/:projectSlug/lanes/:laneSlug/order`

Reorder cards within a lane (for drag-and-drop within the same lane).

**Request Body:**
```json
{
  "order": ["api-endpoints.md", "user-auth.md"]
}
```

**Behavior:**
1. Validate all filenames exist in the lane folder
2. Replace the lane's `_order.json` with the new order
3. Files in the folder but missing from `order` are appended alphabetically
4. Broadcast `lane:reordered` WebSocket event to subscribed clients

**Response `200`:**
```json
{
  "lane": "01-upcoming",
  "order": ["api-endpoints.md", "user-auth.md"]
}
```

---

### 3.6 Link Endpoints

#### `POST /api/projects/:projectSlug/cards/:cardSlug/links`

Add a URL link to a card.

**Request Body:**
```json
{
  "label": "OIDC Core Specification",
  "url": "https://openid.net/specs/openid-connect-core-1_0.html",
  "kind": "spec"
}
```

- `label` (required): Display label, 1–200 characters
- `url` (required): Must start with `http://` or `https://`
- `kind` (optional): One of `doc`, `spec`, `ticket`, `repo`, `reference`, `other`. Defaults to `other`.

**Behavior:**
1. Validate `url` (must be parseable and http/https protocol)
2. Validate `label` (must be non-empty, trimmed)
3. Check for duplicate URL on this card — reject with `409` if found
4. Assign a UUID v4 `id`, set `createdAt` and `updatedAt` to current time
5. Append to `frontmatter.links` array in the card file
6. Update card's `updated` timestamp

**Response `201`:**
```json
{
  "link": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "label": "OIDC Core Specification",
    "url": "https://openid.net/specs/openid-connect-core-1_0.html",
    "kind": "spec",
    "createdAt": "2026-02-28T10:00:00Z",
    "updatedAt": "2026-02-28T10:00:00Z"
  }
}
```

**Errors:**
- `400 INVALID_URL` — URL is missing, malformed, or not http/https
- `400 INVALID_LABEL` — Label is empty or whitespace-only
- `404` — Project or card not found
- `409 DUPLICATE_LINK` — This URL already exists on the card

#### `PATCH /api/projects/:projectSlug/cards/:cardSlug/links/:linkId`

Partially update an existing link.

**Request Body (all fields optional):**
```json
{
  "label": "Updated Label",
  "url": "https://new-url.example.com",
  "kind": "reference"
}
```

**Behavior:**
1. Find link by `linkId` in the card's `frontmatter.links`
2. Validate any provided `url` or `label`
3. Check for duplicate URL if `url` is changing
4. Merge changes; update `updatedAt` on the link
5. Write card file

**Response `200`:**
```json
{ "link": { /* Updated CardLink */ } }
```

**Errors:** Same as POST plus `404 LINK_NOT_FOUND`.

#### `DELETE /api/projects/:projectSlug/cards/:cardSlug/links/:linkId`

Remove a link from a card.

**Response `200`:**
```json
{ "success": true }
```

**Errors:**
- `404 LINK_NOT_FOUND` — Link ID does not exist on the card

---

### 3.7 Activity History Endpoints

#### `GET /api/projects/:projectSlug/history`

Retrieve activity history for a project (recent card/task modifications).

**Query Parameters:**
- `limit` (optional): Number of events to return (default: 50, max: 500)
- `since` (ISO 8601 string, optional): Return only events at or after this timestamp (e.g., `?since=2026-02-18T07:50:00Z`)

**Response `200`:**
```json
{
  "events": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "projectSlug": "my-project",
      "timestamp": "2026-02-08T07:00:00.000Z",
      "action": "card:moved",
      "description": "Card \"Auth System\" moved to In Progress",
      "metadata": {
        "cardSlug": "auth-system",
        "cardTitle": "Auth System",
        "sourceLane": "01-upcoming",
        "targetLane": "02-in-progress"
      }
    }
  ],
  "total": 1
}
```

**Action Types:**
- `task:completed` - Task marked as done
- `task:uncompleted` - Task marked as not done
- `task:added` - New task added to a card
- `card:created` - New card added
- `card:moved` - Card moved between lanes
- `card:updated` - Card content or metadata changed
- `card:archived` - Card moved to archive
- `card:deleted` - Card permanently deleted
- `project:created` / `project:updated` / `project:archived` - Project lifecycle
- `link:added` / `link:updated` / `link:deleted` - Link operations

#### `GET /api/activity`

Cross-project activity feed — merges history from all (non-archived) projects in a single call.

**Query Parameters:**
- `limit` (optional): Number of events to return (default: 50, max: 500)
- `since` (ISO 8601 string, optional): Return only events at or after this timestamp

**Response `200`:** Same shape as `/history` — `{ events, total }`. Each event already contains `projectSlug`.

**Usage example (digest agent):**
```
GET /api/activity?since=2026-02-19T07:52:00Z
```

---

### 3.8 Project Stats Endpoint

#### `GET /api/projects/:projectSlug/stats`

Returns aggregated health metrics for a project in a single call.

**Response `200`:**
```json
{
  "slug": "my-project",
  "completionsLast7Days": 4,
  "completionsLast30Days": 18,
  "avgDaysInProgress": 2.3,
  "wipCount": 3,
  "backlogDepth": 12,
  "blockedCount": 1
}
```

| Field | Description |
|-------|-------------|
| `completionsLast7Days` | Cards in `03-complete` whose `updated` is within the last 7 days |
| `completionsLast30Days` | Same, within the last 30 days |
| `avgDaysInProgress` | Average `(updated - created)` in days for completed cards |
| `wipCount` | Number of cards in `02-in-progress` |
| `backlogDepth` | Number of cards in `01-upcoming` |
| `blockedCount` | In-progress cards with `status: "blocked"` |

---

### 3.9 Preferences Endpoint

#### `GET /api/preferences` / `PATCH /api/preferences`

Workspace-level preferences persisted to `_preferences.json`.

**PATCH Request Body (all fields optional):**
```json
{
  "lastSelectedProject": "my-project",
  "digestAnchor": "2026-02-20T07:52:00Z"
}
```

| Field | Description |
|-------|-------------|
| `lastSelectedProject` | Last project selected in the UI (string or null) |
| `digestAnchor` | ISO 8601 timestamp of the last successful digest run. Used by the digest skill as the `since` parameter for all "since last digest" queries. Set to `null` to reset. |

**Response `200`:** Full preferences object.

---

### 3.10 Vault Artifact Endpoint

Writes a Markdown file to the artifact vault directory and attaches a link to the card. Requires `ARTIFACT_BASE_URL` and `ARTIFACT_BASE_PATH` in the server environment.

#### `POST /api/projects/:projectSlug/cards/:cardSlug/artifacts`

**Request Body:**
```json
{
  "label": "Implementation Spec",
  "content": "# Implementation Spec\n\n...",
  "kind": "spec"
}
```

- `label` (required) — Display label for the link and source for the filename slug
- `content` (required) — UTF-8 text content written to the file
- `kind` (optional, default `"doc"`) — Link kind: `doc | spec | ticket | repo | reference | other`

**Behavior:**
1. Validate `ARTIFACT_BASE_URL` and `ARTIFACT_BASE_PATH` are configured
2. Generate filename: `{YYYY-MM-DD_HH-MM-SS}_{UPPERCASE-LABEL-SLUG}.md`
3. Write file to `{ARTIFACT_BASE_PATH}/{projectSlug}/{cardSlug}/{filename}`
4. Construct URL: `{ARTIFACT_BASE_URL}%2F{encoded-relative-path}`
5. Add link to card via `LinkService`
6. Broadcast `link:added` WebSocket event

**Response `201`:**
```json
{
  "link": {
    "id": "uuid",
    "label": "Implementation Spec",
    "url": "https://viewer.example.com/view?path=10-Projects%2Fhex%2Fmy-card%2F2026-03-05_14-00-00_IMPLEMENTATION-SPEC.md",
    "kind": "spec",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "filePath": "C:\\...\\10-Projects\\hex\\my-card\\2026-03-05_14-00-00_IMPLEMENTATION-SPEC.md"
}
```

**Errors:**
- `400 ARTIFACT_NOT_CONFIGURED` — `ARTIFACT_BASE_URL` or `ARTIFACT_BASE_PATH` is not set
- `400 INVALID_LABEL` — Label is empty or whitespace
- `404` — Project or card not found
- `409 DUPLICATE_LINK` — A link with this URL already exists on the card

---

### 3.11 Backup Endpoint

#### `POST /api/backup`

Create a zip backup of the entire workspace.

**Response `200`:**
```json
{
  "filename": "devplanner-backup-2026-02-28T10-00-00.zip",
  "path": "/path/to/backups/devplanner-backup-2026-02-28T10-00-00.zip",
  "size": 1048576
}
```

The backup is saved to the directory specified by `DEVPLANNER_BACKUP_DIR` (defaults to `{workspace}/_backups`).

---

### 3.12 WebSocket Endpoint

#### `WS /api/ws`

WebSocket connection for real-time updates. Clients subscribe to project-specific events.

**Client → Server Messages:**

Subscribe to project:
```json
{
  "type": "subscribe",
  "projectSlug": "my-project"
}
```

Unsubscribe from project:
```json
{
  "type": "unsubscribe",
  "projectSlug": "my-project"
}
```

Heartbeat:
```json
{
  "type": "ping"
}
```

**Server → Client Messages:**

Subscription confirmed:
```json
{
  "type": "subscribed",
  "projectSlug": "my-project"
}
```

Event broadcast:
```json
{
  "type": "event",
  "event": {
    "type": "card:moved",
    "projectSlug": "my-project",
    "timestamp": "2026-02-08T07:00:00.000Z",
    "data": {
      "slug": "auth-system",
      "sourceLane": "01-upcoming",
      "targetLane": "02-in-progress"
    }
  }
}
```

History event:
```json
{
  "type": "event",
  "event": {
    "type": "history:event",
    "projectSlug": "my-project",
    "timestamp": "2026-02-08T07:00:00.000Z",
    "data": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "action": "card:moved",
      "description": "Card \"Auth System\" moved to In Progress",
      "metadata": { ... }
    }
  }
}
```

Heartbeat response:
```json
{
  "type": "pong"
}
```

**Event Types:**
- `card:created` - New card added to a lane
- `card:updated` - Card frontmatter or content changed
- `card:moved` - Card moved between lanes
- `card:deleted` - Card removed/archived
- `task:toggled` - Task checked/unchecked
- `lane:reordered` - Cards reordered within a lane
- `project:updated` - Project metadata changed
- `link:added` - URL link added to a card
- `link:updated` - URL link updated on a card
- `link:deleted` - URL link removed from a card
- `history:event` - Activity history event recorded

**Behavior:**
- Server sends ping every 30 seconds
- Client disconnected if no pong received within 5 seconds
- Clients only receive events for subscribed projects
- File watcher detects changes and broadcasts to subscribed clients

---

### 3.13 Vault Content Endpoint

#### `GET /api/vault/content`

Serves raw file content from the artifact base directory. Used by the Diff Viewer to load vault artifact files for comparison.

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | Yes | Relative path within `ARTIFACT_BASE_PATH` (URL-encoded). Example: `my-project%2Fmy-card%2Ffile.md` |

**Behavior:**
1. Returns `400 ARTIFACT_NOT_CONFIGURED` if `ARTIFACT_BASE_PATH` is not set.
2. Returns `400 INVALID_PATH` if `path` is empty or contains a traversal attempt (`../`).
3. Resolves the absolute path as `path.resolve(ARTIFACT_BASE_PATH, decodedPath)`.
4. Verifies the resolved path is inside `ARTIFACT_BASE_PATH` (path traversal guard).
5. Returns `404 FILE_NOT_FOUND` if the file does not exist.
6. Returns the raw file content with `Content-Type: text/plain; charset=utf-8`.

**Response `200`:** Raw file text (not JSON).

**Error responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| `400` | `ARTIFACT_NOT_CONFIGURED` | `ARTIFACT_BASE_PATH` env var not set |
| `400` | `INVALID_PATH` | Empty path or path traversal detected |
| `404` | `FILE_NOT_FOUND` | File not found at resolved path |

---

### 3.14 Public Config Endpoint

#### `GET /api/config/public`

Returns safe public configuration values for the frontend. The frontend uses `artifactBaseUrl` to detect which card links are vault artifact links (those whose URL starts with `artifactBaseUrl`) and to build the `/diff?left=<path>` Diff Viewer URL. Exposing this via an API endpoint keeps configuration centralised on the backend and avoids baking server-side env vars into the frontend bundle at build time.

**Response `200`:**
```json
{
  "artifactBaseUrl": "https://viewer.example.com/view?path=10-Projects"
}
```

If `ARTIFACT_BASE_URL` is not configured, `artifactBaseUrl` is `null`.

---

## 4. Service Layer Architecture

The service layer is a set of TypeScript classes that encapsulate all file I/O and business logic. The Elysia routes are thin wrappers that delegate to these services.

```
src/
├── server.ts                       # Elysia app setup, error handler, route registration
├── mcp-server.ts                   # MCP server entry point (stdio transport)
├── routes/
│   ├── projects.ts                 # Project route handlers
│   ├── cards.ts                    # Card route handlers (CRUD + search)
│   ├── tasks.ts                    # Task route handlers (add, toggle, edit, delete)
│   ├── links.ts                    # Card URL link handlers
│   ├── artifacts.ts                # Vault artifact creation handlers
│   ├── history.ts                  # Per-project activity history handlers
│   ├── activity.ts                 # Cross-project activity feed
│   ├── stats.ts                    # Project health metrics
│   ├── preferences.ts              # Workspace preferences
│   ├── backup.ts                   # Workspace backup
│   ├── vault.ts                    # Vault file content serving (GET /api/vault/content)
│   ├── config.ts                   # Public config endpoint (GET /api/config/public)
│   └── websocket.ts                # WebSocket connection handlers
├── services/
│   ├── project.service.ts          # Project CRUD operations
│   ├── card.service.ts             # Card CRUD, move, reorder, search
│   ├── task.service.ts             # Checklist add/toggle/edit/delete (per-card mutex)
│   ├── link.service.ts             # Card URL link management
│   ├── vault.service.ts            # Obsidian vault artifact creation
│   ├── markdown.service.ts         # Frontmatter parsing, checklist parsing
│   ├── history.service.ts          # In-memory activity event tracking
│   ├── history-persistence.service.ts # History JSON file persistence
│   ├── websocket.service.ts        # WebSocket connection management, broadcasting
│   ├── file-watcher.service.ts     # File system monitoring
│   ├── backup.service.ts           # Workspace backup to zip
│   ├── preferences.service.ts      # Workspace preferences (digestAnchor, etc.)
│   └── config.service.ts           # Singleton environment configuration
├── mcp/                            # MCP server for AI agents
│   ├── tool-handlers.ts            # Tool implementations
│   ├── resource-providers.ts       # 3 resource providers
│   ├── schemas.ts                  # JSON schemas for tool inputs
│   ├── errors.ts                   # LLM-friendly error messages
│   └── types.ts                    # MCP-specific type definitions
├── types/
│   └── index.ts                    # Shared TypeScript interfaces
├── utils/
│   ├── slug.ts                     # Slugify function
│   ├── prefix.ts                   # Card ID prefix generation
│   └── history-helper.ts           # History event formatting
├── seed.ts                         # Seed data script
└── __tests__/
    ├── project.service.test.ts
    ├── card.service.test.ts
    ├── task.service.test.ts
    └── markdown.service.test.ts
```

### 4.1 Service Classes

#### `MarkdownService`

Pure functions for parsing and serializing Markdown with frontmatter.

```typescript
class MarkdownService {
  // Parse a .md file string into frontmatter + content + tasks
  static parse(raw: string): { frontmatter: CardFrontmatter; content: string; tasks: TaskItem[] };

  // Serialize frontmatter + content back into a .md file string
  static serialize(frontmatter: CardFrontmatter, content: string): string;

  // Parse checklist items from Markdown content
  static parseTasks(content: string): TaskItem[];

  // Set a specific task's checked state in Markdown content, returns updated content
  static setTaskChecked(content: string, taskIndex: number, checked: boolean): string;

  // Append a new checklist item to the content, returns updated content
  static appendTask(content: string, text: string): string;

  // Compute task progress summary
  static taskProgress(tasks: TaskItem[]): { total: number; checked: number };
}
```

#### `ProjectService`

```typescript
class ProjectService {
  constructor(workspacePath: string);

  listProjects(includeArchived?: boolean): Promise<ProjectSummary[]>;
  getProject(slug: string): Promise<ProjectConfig>;
  createProject(name: string, description?: string): Promise<ProjectConfig>;
  updateProject(slug: string, updates: Partial<ProjectConfig>): Promise<ProjectConfig>;
  archiveProject(slug: string): Promise<void>;
}
```

#### `CardService`

```typescript
class CardService {
  constructor(workspacePath: string);

  listCards(projectSlug: string, lane?: string, options?: { since?: string; staleDays?: number }): Promise<CardSummary[]>;
  getCard(projectSlug: string, cardSlug: string): Promise<Card>;
  createCard(projectSlug: string, data: CreateCardInput): Promise<Card>;
  updateCard(projectSlug: string, cardSlug: string, updates: Partial<CardFrontmatter>): Promise<Card>;
  archiveCard(projectSlug: string, cardSlug: string): Promise<void>;
  moveCard(projectSlug: string, cardSlug: string, targetLane: string, position?: number): Promise<Card>;
  reorderCards(projectSlug: string, laneSlug: string, order: string[]): Promise<void>;
  searchCards(projectSlug: string, query: string): Promise<CardSummary[]>;
}
```

#### `TaskService`

```typescript
class TaskService {
  constructor(workspacePath: string);

  addTask(projectSlug: string, cardSlug: string, text: string): Promise<TaskItem>;
  setTaskChecked(projectSlug: string, cardSlug: string, taskIndex: number, checked: boolean): Promise<TaskItem>;
  updateTaskText(projectSlug: string, cardSlug: string, taskIndex: number, text: string): Promise<TaskItem>;
  deleteTask(projectSlug: string, cardSlug: string, taskIndex: number): Promise<{ tasks: TaskItem[]; taskProgress: { total: number; checked: number } }>;
}
```

#### `LinkService`

```typescript
class LinkService {
  constructor(workspacePath: string);

  addLink(projectSlug: string, cardSlug: string, data: { label: string; url: string; kind?: LinkKind }): Promise<CardLink>;
  updateLink(projectSlug: string, cardSlug: string, linkId: string, updates: Partial<{ label: string; url: string; kind: LinkKind }>): Promise<CardLink>;
  deleteLink(projectSlug: string, cardSlug: string, linkId: string): Promise<void>;
}
```

#### `VaultService`

Writes Markdown artifact files to the artifact vault directory and attaches them as links to cards.

```typescript
class VaultService {
  constructor(workspacePath: string, vaultPath: string, artifactBaseUrl: string);

  createArtifact(
    projectSlug: string,
    cardSlug: string,
    label: string,
    kind: LinkKind,
    content: string
  ): Promise<{ link: CardLink; filePath: string }>;

  readArtifactContent(relativePath: string): Promise<string>;
}
```

Files are written to `{vaultPath}/{projectSlug}/{cardSlug}/{YYYY-MM-DD_HH-MM-SS}_{UPPERCASE-LABEL-SLUG}.md`. The URL is constructed as `{artifactBaseUrl}%2F{url-encoded-relative-path}`.

#### `HistoryService`

```typescript
class HistoryService {
  // In-memory event store, max 50 events per project
  record(event: Omit<HistoryEvent, 'id' | 'timestamp'>): HistoryEvent;
  getHistory(projectSlug: string, options?: { limit?: number; since?: string }): HistoryEvent[];
  getAllHistory(options?: { limit?: number; since?: string }): HistoryEvent[];
}
```

#### `BackupService`

```typescript
class BackupService {
  constructor(workspacePath: string, backupDir: string);

  createBackup(): Promise<{ filename: string; path: string; size: number }>;
}
```

#### `PreferencesService`

```typescript
class PreferencesService {
  constructor(workspacePath: string);

  getPreferences(): Promise<WorkspacePreferences>;
  updatePreferences(updates: Partial<WorkspacePreferences>): Promise<WorkspacePreferences>;
}
```

### 4.2 Slug Generation

```typescript
function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // Remove non-alphanumeric (except spaces and hyphens)
    .replace(/[\s]+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')             // Collapse multiple hyphens
    .replace(/^-|-$/g, '');          // Trim leading/trailing hyphens
}
```

Examples:
- `"User Authentication System"` → `"user-authentication-system"`
- `"LM API"` → `"lm-api"`
- `"My Card Title!"` → `"my-card-title"`

### 4.3 Card Location Resolution

Since `cardSlug` is unique across the entire project (not scoped to a lane), the service must search all lane directories to find a card. The search order follows the directory sort order (01-upcoming, 02-in-progress, etc.).

---

## 5. Frontend Architecture

### 5.1 Tech Stack

| Library | Version | Purpose |
|---------|---------|---------|
| React | 19.x | UI framework |
| Vite | 6.x | Build tool + dev server |
| react-router-dom | 7.x | URL-based routing (`/` Kanban, `/diff` Diff Viewer) |
| Tailwind CSS | 4.x | Styling (dark mode first) |
| Zustand | 5.x | State management |
| Framer Motion | 12.x | Animations (panel transitions, card effects) |
| `@dnd-kit/core` | latest | Drag-and-drop |
| `@dnd-kit/sortable` | latest | Sortable lists within lanes |
| `marked` | latest | Markdown → HTML rendering |
| `highlight.js` | 11.x | Syntax highlighting for Diff Viewer |
| `diff` (jsdiff) | 7.x | Line diff algorithm for Diff Viewer |

### 5.2 Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  Header: DevPlanner logo / title              [Toggle Sidebar]      │
├──────────┬──────────────────────────────────────────────────────────┤
│          │                                                          │
│ Project  │   ┌─────────┐  ┌─────────┐   ┌─┐  ┌─┐                  │
│ Sidebar  │   │ Upcoming │  │In Prog  │   │C│  │A│  ← collapsed     │
│          │   │ [+]      │  │ [+]     │   │o│  │r│    lane tabs      │
│ - Proj A │   │          │  │         │   │m│  │c│                   │
│ - Proj B │   │ ┌──────┐ │  │ ┌──────┐│   │p│  │h│                   │
│ - Proj C │   │ │Card 1│ │  │ │Card 3││   │l│  │i│                   │
│          │   │ └──────┘ │  │ └──────┘│   │e│  │v│                   │
│ [+ New]  │   │ ┌──────┐ │  │         │   │t│  │e│                   │
│          │   │ │Card 2│ │  │         │   │e│  │ │                   │
│          │   │ └──────┘ │  │         │   └─┘  └─┘                   │
│          │   └─────────┘  └─────────┘                               │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
```

**When a collapsed lane is clicked, it expands as the rightmost full column:**

```
├──────────┬──────────────────────────────────────────────────────────┤
│          │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─┐           │
│ Sidebar  │   │ Upcoming │  │In Prog  │  │Complete  │  │A│           │
│          │   │ [+]      │  │ [+]     │  │   [−]    │  │r│           │
│          │   │          │  │         │  │          │  │c│           │
│          │   │ ...      │  │ ...     │  │ ┌──────┐ │  │h│           │
│          │   │          │  │         │  │ │Card 5│ │  │i│           │
│          │   │          │  │         │  │ └──────┘ │  │v│           │
│          │   └─────────┘  └─────────┘  └─────────┘  └─┘           │
```

**Card detail panel (slides in from right):**

```
├──────────┬──────────────────────────────┬───────────────────────────┤
│          │   ┌─────────┐  ┌─────────┐  │  Card Detail Panel        │
│ Sidebar  │   │ Upcoming │  │In Prog  │  │                           │
│          │   │ ...      │  │ ...     │  │  Title: User Auth          │
│          │   │          │  │         │  │  Assignee: user            │
│          │   │          │  │         │  │  Priority: high            │
│          │   │          │  │         │  │                           │
│          │   │          │  │         │  │  [rendered markdown]       │
│          │   │          │  │         │  │                           │
│          │   │          │  │         │  │  ☐ Task 1                 │
│          │   │          │  │         │  │  ☑ Task 2                 │
│          │   │          │  │         │  │  ☐ Task 3                 │
│          │   └─────────┘  └─────────┘  │                  [Close ×] │
├──────────┴──────────────────────────────┴───────────────────────────┤
```

### 5.3 Component Tree

```
App (React Router)
├── Route "/" → KanbanApp
│   └── MainLayout (CSS grid: sidebar + content)
│       ├── Header
│       │   ├── Logo / Title
│       │   ├── SearchInput (cross-card search with highlighting)
│       │   ├── ActivityToggleButton
│       │   └── SidebarToggleButton
│       ├── ProjectSidebar (collapsible left panel)
│       │   ├── ProjectList (with card counts per project)
│       │   │   └── ProjectItem (per project)
│       │   └── CreateProjectButton → CreateProjectModal
│       ├── KanbanBoard
│       │   ├── Lane (per visible lane)
│       │   │   ├── LaneHeader (display name + color bar + card count + collapse toggle)
│       │   │   ├── CardList (sortable via @dnd-kit)
│       │   │   │   └── AnimatedCardWrapper (change indicators with auto-expiry)
│       │   │   │       └── CardPreview (per card)
│       │   │   │           ├── CardTitle (with cardId badge)
│       │   │   │           ├── CardPreviewTasks (expandable pending tasks)
│       │   │   │           ├── TaskProgressBar + count ("3/5")
│       │   │   │           └── AssigneeBadge + Tags
│       │   │   └── QuickAddCard (inline input, appears on [+] click)
│       │   └── CollapsedLaneTab (per collapsed lane, vertical text label)
│       ├── CardDetailPanel (slides in from right via Framer Motion)
│       │   ├── CardDetailHeader (inline title editing, cardId, lane move dropdown)
│       │   ├── CardMetadata (inline editing: priority, assignee, tags, dates, blockedReason)
│       │   ├── CardContent (description editing, rendered Markdown body via `marked`)
│       │   ├── TaskList (interactive checkboxes with inline editing and deletion)
│       │   │   ├── TaskCheckbox (per task)
│       │   │   └── AddTaskInput
│       │   └── CardLinks (URL references + vault artifact upload; "Open in Diff Viewer" button on vault links)
│       └── ActivityPanel (slide-out panel with time-grouped history events)
│           └── ActivityLog (grouped: Today, Yesterday, This Week, etc.)
└── Route "/diff" → DiffViewerPage
    ├── DiffHeader (page title + "Back to DevPlanner" link)
    ├── DiffToolbar (language selector, wrap, sync-scroll, swap, clear)
    └── DiffLayout (CSS grid: left | right)
        ├── DiffPane (left)
        │   ├── DiffPaneHeader (filename, copy button)
        │   ├── DropZone (drag-and-drop / paste / file picker — shown when empty)
        │   └── DiffContent (scrollable; synchronized scroll via useSyncScroll hook)
        │       └── DiffLine[] (line number + highlight.js + added/removed/unchanged color)
        └── DiffPane (right)
            ├── DiffPaneHeader (filename, copy button, file-picker button)
            ├── DropZone (shown when empty)
            └── DiffContent (synchronized scroll)
                └── DiffLine[]
```

### 5.4 Zustand Store

```typescript
interface DevPlannerStore {
  // Projects
  projects: ProjectSummary[];
  activeProjectSlug: string | null;
  loadProjects: () => Promise<void>;
  createProject: (name: string, description?: string) => Promise<void>;
  archiveProject: (slug: string) => Promise<void>;
  setActiveProject: (slug: string) => void;

  // Cards
  cards: CardSummary[];
  loadCards: (projectSlug: string) => Promise<void>;
  createCard: (projectSlug: string, title: string, lane: string) => Promise<void>;
  updateCard: (projectSlug: string, cardSlug: string, updates: Partial<CardFrontmatter>) => Promise<void>;
  archiveCard: (projectSlug: string, cardSlug: string) => Promise<void>;
  moveCard: (projectSlug: string, cardSlug: string, targetLane: string, position?: number) => Promise<void>;
  reorderCards: (projectSlug: string, laneSlug: string, order: string[]) => Promise<void>;

  // Card Detail Panel
  activeCard: Card | null;
  isDetailPanelOpen: boolean;
  openCardDetail: (projectSlug: string, cardSlug: string) => Promise<void>;
  closeCardDetail: () => void;
  toggleTask: (projectSlug: string, cardSlug: string, taskIndex: number, checked: boolean) => Promise<void>;
  addTask: (projectSlug: string, cardSlug: string, text: string) => Promise<void>;
  editTask: (projectSlug: string, cardSlug: string, taskIndex: number, text: string) => Promise<void>;
  deleteTask: (projectSlug: string, cardSlug: string, taskIndex: number) => Promise<void>;

  // Links
  addLink: (projectSlug: string, cardSlug: string, data: { label: string; url: string; kind?: LinkKind }) => Promise<void>;
  updateLink: (projectSlug: string, cardSlug: string, linkId: string, updates: Partial<CardLink>) => Promise<void>;
  deleteLink: (projectSlug: string, cardSlug: string, linkId: string) => Promise<void>;
  createVaultArtifact: (cardSlug: string, file: File, label: string, kind: LinkKind) => Promise<void>;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Activity History
  historyEvents: HistoryEvent[];
  loadHistory: (projectSlug: string) => Promise<void>;

  // Lane visibility
  laneCollapsedState: Record<string, boolean>;
  toggleLaneCollapsed: (laneSlug: string) => void;

  // Sidebar & Panels
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  isActivityPanelOpen: boolean;
  toggleActivityPanel: () => void;

  // WebSocket
  wsConnected: boolean;
}
```

### 5.5 Styling

**Dark mode color palette** (Tailwind custom theme):

| Element | Color token | Hex |
|---------|------------|-----|
| Background (page) | `bg-gray-950` | `#030712` |
| Background (surface) | `bg-gray-900` | `#111827` |
| Background (card) | `bg-gray-800` | `#1f2937` |
| Background (card hover) | `bg-gray-750` | `#283141` |
| Text (primary) | `text-gray-100` | `#f3f4f6` |
| Text (secondary) | `text-gray-400` | `#9ca3af` |
| Border | `border-gray-700` | `#374151` |
| Accent (interactive) | `text-blue-400` | `#60a5fa` |
| Lane: Upcoming | — | `#6b7280` |
| Lane: In Progress | — | `#3b82f6` |
| Lane: Complete | — | `#22c55e` |
| Lane: Archive | — | `#9ca3af` |

### 5.6 Card Preview Component

Each card in the Kanban lane shows a compact preview:

```
┌──────────────────────────┐
│ User Authentication      │
│                          │
│ ██████░░░░  3/5    👤    │
│ ───────────────────────  │
│ #feature  #security      │
└──────────────────────────┘
```

- **Title**: First line, truncated with ellipsis if too long
- **Progress bar**: Small bar + fraction (checked / total tasks)
- **Assignee icon**: User or robot icon for `user` / `agent`
- **Tags**: Shown as small chips at the bottom (optional, hide if space is tight)

### 5.6.1 Collapsible Task Preview

Each card preview includes an expandable section showing pending (unchecked) tasks:

- **Collapsed state**: Shows task progress bar + count (e.g., "3/5") with chevron toggle
- **Expanded state**: Lists up to 5 pending tasks with interactive checkboxes
- **Behavior**: Checking a task updates immediately via API, progress bar animates
- **"All done"**: When all tasks complete, shows celebratory message

```
┌──────────────────────────┐
│ User Authentication      │
│                          │
│ ██████░░░░  3/5    ▼     │  ← Chevron toggles expansion
├──────────────────────────┤
│ ☐ Set up OAuth2 config   │  ← Pending tasks (expandable)
│ ☐ Implement login flow   │
│ ☐ Add logout             │
├──────────────────────────┤
│ #feature  #security  👤  │
└──────────────────────────┘
```

### 5.6.2 Animation Specifications

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Task area expand/collapse | Height + opacity | 300ms | ease-out |
| Chevron rotation | Transform rotate | 200ms | ease-out |
| Checkbox check | Scale bounce | 200ms | ease-out |
| Task text strikethrough | Color + decoration | 200ms | ease |
| Card hover | Translate Y + shadow | 150ms | ease-out |
| Detail panel slide | Transform X | 300ms | spring |
| Task add/remove | Height + opacity + X | 200ms | ease-out |

### 5.7 Responsive Behavior

| Breakpoint | Sidebar | Lanes | Detail Panel |
|------------|---------|-------|--------------|
| Desktop (≥1280px) | Visible, collapsible | All visible lanes side by side | Slides in from right, overlays board |
| Tablet (768–1279px) | Hidden by default, overlay | Horizontal scroll | Full-width overlay |
| Mobile (<768px) | Hidden, hamburger menu | Stacked vertically or swipeable | Full-screen overlay |

### 5.8 Vault Artifact Upload

The **CardLinks** section in the card detail panel includes an "Upload File" button alongside "+ Add Link". Clicking it opens an `UploadLinkForm` with:

- File picker (accepts `.md`, `.txt`, `.json`, `.ts`, `.tsx`, `.js`, `.jsx`, `.yaml`, `.yml`, `.csv`)
- Label field (pre-filled from filename without extension, editable)
- Kind selector (same options as the URL link form)

On save, the file content is read client-side and sent to `POST /api/projects/:slug/cards/:card/artifacts`. The API writes the file to the artifact vault directory and returns a link object that is immediately appended to `activeCard.frontmatter.links`.

If `ARTIFACT_BASE_URL` or `ARTIFACT_BASE_PATH` is not configured, a friendly error is shown.

---

## 6. Seed Data Script

**Command**: `bun run seed`

The script is idempotent: it deletes any existing seed projects and recreates them from scratch.

### 6.1 Seed Projects

#### Project: "Media Manager"

| Card | Lane | Tasks |
|------|------|-------|
| Video Upload Pipeline | 01-upcoming | `[ ] Implement chunked upload`, `[ ] Add progress tracking`, `[ ] Support MP4 and WebM` |
| Image Thumbnail Generation | 02-in-progress | `[x] Set up Sharp library`, `[x] Create thumbnail sizes config`, `[ ] Generate on upload`, `[ ] Cache generated thumbnails` |
| Media Library UI | 01-upcoming | `[ ] Design grid view`, `[ ] Add search/filter bar`, `[ ] Implement lazy loading` |
| File Storage Service | 03-complete | `[x] Configure S3 bucket`, `[x] Implement upload service`, `[x] Add download endpoint` |

#### Project: "LM API"

| Card | Lane | Tasks |
|------|------|-------|
| Prompt Template System | 01-upcoming | `[ ] Design template schema`, `[ ] Implement variable substitution`, `[ ] Add template versioning` |
| Streaming Response Handler | 02-in-progress | `[x] Set up SSE endpoint`, `[ ] Implement token streaming`, `[ ] Add error recovery` |
| Rate Limiting | 01-upcoming | `[ ] Choose rate limit strategy`, `[ ] Implement middleware`, `[ ] Add per-user limits` |
| Authentication Middleware | 03-complete | `[x] Implement API key validation`, `[x] Add request signing`, `[x] Create auth tests` |

#### Project: "Memory API"

| Card | Lane | Tasks |
|------|------|-------|
| Vector Store Integration | 02-in-progress | `[x] Choose embedding model`, `[ ] Set up vector database`, `[ ] Implement similarity search` |
| Memory CRUD Endpoints | 01-upcoming | `[ ] Design memory schema`, `[ ] Create REST endpoints`, `[ ] Add pagination` |
| Conversation History | 01-upcoming | `[ ] Define history format`, `[ ] Implement sliding window`, `[ ] Add token counting` |

### 6.2 Seed Script Behavior

```typescript
// seed.ts
// 1. Read DEVPLANNER_WORKSPACE from env
// 2. For each seed project:
//    a. Delete existing project folder if it exists
//    b. Create project folder structure (folder + _project.json + lane folders + _order.json files)
//    c. Create card .md files with frontmatter + checklists
//    d. Populate _order.json in each lane
// 3. Log summary of created projects and cards
```

---

## 7. Validation Rules (Strict Mode)

All API inputs are validated strictly. On failure, the response includes a clear `message` and `expected` format.

### 7.1 Project Validation

| Field | Rules |
|-------|-------|
| `name` | Required, non-empty string, 1–100 characters |
| `description` | Optional string, max 500 characters |

### 7.2 Card Validation

| Field | Rules |
|-------|-------|
| `title` | Required, non-empty string, 1–200 characters |
| `lane` | Must match an existing lane folder name in the project |
| `priority` | If provided, must be one of: `low`, `medium`, `high` |
| `assignee` | If provided, must be one of: `user`, `agent` |
| `tags` | If provided, must be an array of non-empty strings |

### 7.3 Task Validation

| Field | Rules |
|-------|-------|
| `text` | Required, non-empty string, 1–500 characters |
| `checked` | Required, must be boolean |
| `taskIndex` | Must be a non-negative integer within the range of existing tasks |

### 7.4 Move/Reorder Validation

| Field | Rules |
|-------|-------|
| `lane` (move) | Must match an existing lane folder name |
| `position` (move) | If provided, must be a non-negative integer |
| `order` (reorder) | Must be an array of strings, each must match a file in the lane |

---

## 8. Development Setup

### 8.1 Project Scaffolding

```bash
# Initialize monorepo-style project
bun init

# Backend dependencies
bun add elysia gray-matter
bun add -d @types/bun typescript

# Frontend (via Vite)
bun create vite frontend --template react-ts
cd frontend
bun add marked zustand @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
bun add -d tailwindcss @tailwindcss/vite
```

### 8.2 Project Structure

```
DevPlanner/
├── BRAINSTORM.md
├── SPECIFICATION.md
├── TASKS.md
├── package.json                # Root: backend scripts
├── tsconfig.json
├── src/                        # Backend (Elysia)
│   ├── server.ts
│   ├── routes/
│   ├── services/
│   ├── types/
│   ├── utils/
│   ├── seed.ts
│   └── __tests__/
├── frontend/                   # Frontend (React + Vite)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── store/
│       │   └── index.ts        # Zustand store
│       ├── api/
│       │   └── client.ts       # API client functions
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── ProjectSidebar.tsx
│       │   ├── KanbanBoard.tsx
│       │   ├── Lane.tsx
│       │   ├── CardPreview.tsx
│       │   ├── CardDetailPanel.tsx
│       │   ├── QuickAddCard.tsx
│       │   ├── CollapsedLaneTab.tsx
│       │   └── TaskCheckbox.tsx
│       └── styles/
│           └── index.css
└── workspace/                  # Default dev workspace (gitignored)
```

### 8.3 Package.json Scripts

```json
{
  "scripts": {
    "dev": "bun --watch src/server.ts",
    "test": "bun test",
    "seed": "bun src/seed.ts",
    "frontend": "cd frontend && bun run dev"
  }
}
```

### 8.4 Vite Proxy Configuration

The frontend dev server proxies API requests to the Elysia backend:

```typescript
// frontend/vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:17103'
    }
  }
});
```
