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

The backend validates that `DEVPLANNER_WORKSPACE` exists and is a readable directory on startup. If missing, the server exits with a clear error message.

---

## 2. File Format Schemas

### 2.1 Directory Structure

```
$DEVPLANNER_WORKSPACE/
├── media-manager/                      # Project: folder name is the slug
│   ├── _project.json                   # Project metadata
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
  created: string;    // ISO 8601
  updated: string;    // ISO 8601
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
interface CardFrontmatter {
  title: string;
  status?: 'in-progress' | 'blocked' | 'review' | 'testing';
  priority?: 'low' | 'medium' | 'high';
  assignee?: 'user' | 'agent';
  created: string;    // ISO 8601
  updated: string;    // ISO 8601
  tags?: string[];
}

interface Card {
  slug: string;           // Filename without .md extension
  filename: string;       // Full filename (e.g., "user-auth.md")
  lane: string;           // Lane folder name (e.g., "02-in-progress")
  frontmatter: CardFrontmatter;
  content: string;        // Markdown body (everything below frontmatter)
  tasks: TaskItem[];      // Parsed checklist items
}

interface TaskItem {
  index: number;          // 0-based position in the checklist
  text: string;           // Task description text
  checked: boolean;       // true = [x], false = [ ]
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

**Response `200`:** Updated project object.

#### `DELETE /api/projects/:projectSlug`

Archive a project (sets `archived: true` in `_project.json`). Does **not** delete files.

**Response `200`:**
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

**Response `200`:**
```json
{
  "cards": [
    {
      "slug": "user-auth",
      "filename": "user-auth.md",
      "lane": "01-upcoming",
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
  "lane": "01-upcoming",
  "priority": "high",
  "assignee": "user",
  "tags": ["feature", "security"],
  "content": "Optional initial markdown body content."
}
```

Only `title` is required. Defaults: `lane` → `"01-upcoming"`, others omitted from frontmatter if not provided.

**Behavior:**
1. Slugify `title` to create filename
2. If slug already exists in any lane, append a numeric suffix (`-2`, `-3`, etc.)
3. Create `.md` file with frontmatter in the target lane folder
4. Append filename to that lane's `_order.json`

**Response `201`:**
```json
{
  "slug": "user-authentication",
  "filename": "user-authentication.md",
  "lane": "01-upcoming",
  "frontmatter": {
    "title": "User Authentication",
    "priority": "high",
    "assignee": "user",
    "created": "2026-02-04T10:00:00Z",
    "updated": "2026-02-04T10:00:00Z",
    "tags": ["feature", "security"]
  },
  "content": "Optional initial markdown body content.",
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

**Note:** The `cardSlug` parameter matches against the filename without the `.md` extension. The API searches across all lanes to find the card.

#### `DELETE /api/projects/:projectSlug/cards/:cardSlug`

Move card to the archive lane.

**Behavior:**
1. Move the `.md` file from its current lane to `04-archive/`
2. Remove from source lane's `_order.json`, append to archive's `_order.json`
3. Update the card's `updated` timestamp

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

**Response `200`:** Full updated card object.

### 3.4 Task Endpoints

#### `POST /api/projects/:projectSlug/cards/:cardSlug/tasks`

Add a new checklist item to a card.

**Request Body:**
```json
{
  "text": "Implement logout functionality"
}
```

**Behavior:**
1. Parse the card's Markdown content
2. Find the last checklist item (line matching `- [ ] ` or `- [x] `) or the end of a `## Tasks` section
3. Append `- [ ] {text}` as a new line after the last checklist item
4. If no checklist exists yet, append a `## Tasks` section with the new item
5. Update the card's `updated` timestamp
6. Write the modified Markdown file

**Response `201`:**
```json
{
  "index": 4,
  "text": "Implement logout functionality",
  "checked": false,
  "taskProgress": { "total": 5, "checked": 1 }
}
```

#### `PATCH /api/projects/:projectSlug/cards/:cardSlug/tasks/:taskIndex`

Toggle a task's checked state.

**Request Body:**
```json
{
  "checked": true
}
```

**Behavior:**
1. Parse the card's Markdown content
2. Find the checklist item at the given 0-based index
3. Replace `- [ ]` with `- [x]` (or vice versa)
4. Update the card's `updated` timestamp
5. Write the modified Markdown file

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

**Response `200`:**
```json
{
  "lane": "01-upcoming",
  "order": ["api-endpoints.md", "user-auth.md"]
}
```

---

## 4. Service Layer Architecture

The service layer is a set of TypeScript classes that encapsulate all file I/O and business logic. The Elysia routes are thin wrappers that delegate to these services.

```
src/
├── server.ts                   # Elysia app setup, route registration
├── routes/
│   ├── projects.ts             # Project route handlers
│   ├── cards.ts                # Card route handlers
│   └── tasks.ts                # Task route handlers
├── services/
│   ├── project.service.ts      # Project CRUD operations
│   ├── card.service.ts         # Card CRUD + move operations
│   ├── task.service.ts         # Checklist manipulation
│   └── markdown.service.ts     # Frontmatter parsing, checklist parsing, slug generation
├── types/
│   └── index.ts                # Shared TypeScript interfaces
├── utils/
│   └── slug.ts                 # Slugify function
├── seed.ts                     # Seed data script
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

  listCards(projectSlug: string, lane?: string): Promise<CardSummary[]>;
  getCard(projectSlug: string, cardSlug: string): Promise<Card>;
  createCard(projectSlug: string, data: CreateCardInput): Promise<Card>;
  archiveCard(projectSlug: string, cardSlug: string): Promise<void>;
  moveCard(projectSlug: string, cardSlug: string, targetLane: string, position?: number): Promise<Card>;
  reorderCards(projectSlug: string, laneSlug: string, order: string[]): Promise<void>;
}
```

#### `TaskService`

```typescript
class TaskService {
  constructor(workspacePath: string);

  addTask(projectSlug: string, cardSlug: string, text: string): Promise<TaskItem>;
  setTaskChecked(projectSlug: string, cardSlug: string, taskIndex: number, checked: boolean): Promise<TaskItem>;
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
| Tailwind CSS | 4.x | Styling (dark mode first) |
| `marked` | latest | Markdown → HTML rendering |
| `@dnd-kit/core` | latest | Drag-and-drop |
| `@dnd-kit/sortable` | latest | Sortable lists within lanes |
| Zustand | latest | State management |

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
App
├── Header
│   ├── Logo / Title
│   └── SidebarToggleButton
├── ProjectSidebar (collapsible left panel)
│   ├── ProjectList
│   │   └── ProjectItem (per project)
│   └── CreateProjectButton → CreateProjectModal
├── KanbanBoard
│   ├── Lane (per visible lane)
│   │   ├── LaneHeader (display name + color bar + [+] button)
│   │   ├── CardList (sortable via @dnd-kit)
│   │   │   └── CardPreview (per card)
│   │   │       ├── CardTitle
│   │   │       ├── TaskProgressBadge ("3/5")
│   │   │       └── AssigneeBadge
│   │   └── QuickAddCard (inline input, appears on [+] click)
│   └── CollapsedLaneTab (per collapsed lane, vertical text label)
└── CardDetailPanel (slides in from right, overlay)
    ├── CardDetailHeader (title, metadata badges)
    ├── CardMetadata (assignee, priority, tags, dates)
    ├── CardContent (rendered Markdown via `marked`)
    └── TaskList (interactive checkboxes)
        └── TaskCheckbox (per task)
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

  // Lane visibility
  laneCollapsedState: Record<string, boolean>;
  toggleLaneCollapsed: (laneSlug: string) => void;

  // Sidebar
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
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

### 5.8 Attachments (Future)

**Card Detail Panel - Attachments Section:**
- Collapsible section between metadata and content
- Lists linked files with icons by type
- "Add attachment" with autocomplete search of project files
- Click to open file in editor or preview

**CardPreview - Attachment Indicator:**
- Small paperclip icon with count when attachments exist
- Shown in card footer alongside tags

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
