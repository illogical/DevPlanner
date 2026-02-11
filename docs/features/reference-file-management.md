# Reference/File Management

Project-level file storage with many-to-many card associations, MCP integration for LLM agents, and two UI surfaces (card detail panel + sidebar files panel).

---

## Overview

Files are **copied into the workspace** and tracked via a JSON manifest (`_files.json`). Each file exists at the project level and can be associated with zero or more cards. LLM agents discover files via MCP tools and read content on demand.

URL references are a future enhancement and are **not in scope** for this feature.

---

## 1. Data Model

### 1.1 Types

```typescript
// src/types/index.ts

export interface ProjectFileEntry {
  filename: string;        // Stored filename (unique within project _files/ dir)
  originalName: string;    // Original filename at upload time
  description: string;     // User-provided description (empty string if none)
  mimeType: string;        // e.g. "application/pdf", "text/markdown"
  size: number;            // File size in bytes
  created: string;         // ISO 8601 timestamp
  cardSlugs: string[];     // Associated card slugs (many-to-many)
}

export interface ProjectFilesManifest {
  files: ProjectFileEntry[];
}
```

### 1.2 Storage Structure

```
workspace/
└── project-slug/
    ├── _project.json
    ├── _files.json              # File metadata & associations
    ├── _files/                  # Actual stored files (gitignored)
    │   ├── design-spec.pdf
    │   ├── design-spec-2.pdf   # Deduped if duplicate uploaded
    │   └── api-docs.md
    ├── 01-upcoming/
    ├── 02-in-progress/
    ├── 03-complete/
    └── 04-archive/
```

### 1.3 Example `_files.json`

```json
{
  "files": [
    {
      "filename": "design-spec.pdf",
      "originalName": "Design Spec v2.pdf",
      "description": "UI wireframes and component hierarchy for the dashboard feature",
      "mimeType": "application/pdf",
      "size": 245832,
      "created": "2026-02-10T12:00:00.000Z",
      "cardSlugs": ["dashboard-ui", "auth-system"]
    },
    {
      "filename": "api-docs.md",
      "originalName": "api-docs.md",
      "description": "",
      "mimeType": "text/markdown",
      "size": 1523,
      "created": "2026-02-10T13:00:00.000Z",
      "cardSlugs": []
    }
  ]
}
```

### 1.4 Association Strategy

Associations live in `_files.json` as `cardSlugs: string[]` per file entry:

- **Centralized**: All file metadata in one place, consistent with `_project.json` / `_order.json` patterns.
- **Card frontmatter stays unchanged**: No migration scripts, no changes to existing `.md` files.
- **File-to-cards lookup**: Direct from the entry.
- **Card-to-files lookup**: Filter the files array by `cardSlugs.includes(cardSlug)`. The list is typically small (tens of files).
- **Card deletion cleanup**: Scan `_files.json` and remove the deleted card slug from all entries.

### 1.5 Filename Deduplication

Follow the same pattern as `CardService` slug deduplication. When uploading `design-spec.pdf` and it already exists:
1. Check if `design-spec.pdf` exists in `_files/`
2. If so, try `design-spec-2.pdf`, `design-spec-3.pdf`, etc.
3. Store the deduplicated name as `filename`, preserve the original as `originalName`.

---

## 2. Backend Service

### 2.1 `src/services/file.service.ts`

Constructor pattern matching `CardService` — takes `workspacePath`.

```typescript
export class FileService {
  constructor(workspacePath: string);

  // --- Core CRUD ---
  listFiles(projectSlug: string): Promise<ProjectFileEntry[]>;
  getFile(projectSlug: string, filename: string): Promise<ProjectFileEntry>;
  listCardFiles(projectSlug: string, cardSlug: string): Promise<ProjectFileEntry[]>;

  addFile(
    projectSlug: string,
    originalName: string,
    fileBuffer: Buffer | ArrayBuffer,
    description?: string
  ): Promise<ProjectFileEntry>;

  deleteFile(projectSlug: string, filename: string): Promise<{ associatedCards: string[] }>;

  updateFileDescription(
    projectSlug: string,
    filename: string,
    description: string
  ): Promise<ProjectFileEntry>;

  // --- Associations ---
  associateFile(projectSlug: string, filename: string, cardSlug: string): Promise<ProjectFileEntry>;
  disassociateFile(projectSlug: string, filename: string, cardSlug: string): Promise<ProjectFileEntry>;
  removeCardFromAllFiles(projectSlug: string, cardSlug: string): Promise<void>;

  // --- File access ---
  getFilePath(projectSlug: string, filename: string): Promise<string>;
  getFileContent(projectSlug: string, filename: string): Promise<{ content: string; mimeType: string }>;
}
```

**Implementation notes:**

- `addFile`: Creates `_files/` dir via `mkdir({ recursive: true })`, generates unique filename, writes buffer with `Bun.write()`, updates `_files.json`.
- `deleteFile`: Returns `associatedCards` array so the caller can warn. Removes from `_files.json` and `unlink`s the physical file.
- `getFileContent`: Reads file as UTF-8 text. Check MIME type first — refuse binary files with a descriptive error: "File is binary (application/pdf). Cannot read as text."
- `removeCardFromAllFiles`: Called when a card is deleted. Iterates all entries, removes the card slug from `cardSlugs` arrays, writes back.

### 2.2 MIME Type Detection

Use file extension mapping (no external dependency needed):

```typescript
function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
  };
  return mimeMap[ext] || 'application/octet-stream';
}
```

### 2.3 Text vs Binary Detection

For MCP `read_file_content`:

```typescript
function isTextFile(mimeType: string): boolean {
  if (mimeType.startsWith('text/')) return true;
  const textTypes = [
    'application/json', 'application/javascript', 'application/typescript',
    'application/xml', 'application/yaml',
  ];
  return textTypes.includes(mimeType);
}
```

---

## 3. REST API Routes

### 3.1 `src/routes/files.ts`

Exports `fileRoutes(workspacePath)` returning an Elysia instance. Register in `src/server.ts` via `.use(fileRoutes(workspacePath))`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:projectSlug/files` | List all project files |
| POST | `/api/projects/:projectSlug/files` | Upload file (multipart) |
| GET | `/api/projects/:projectSlug/files/:filename` | Get file metadata |
| PATCH | `/api/projects/:projectSlug/files/:filename` | Update description |
| DELETE | `/api/projects/:projectSlug/files/:filename` | Delete file |
| POST | `/api/projects/:projectSlug/files/:filename/associate` | Associate with card |
| DELETE | `/api/projects/:projectSlug/files/:filename/associate/:cardSlug` | Disassociate from card |
| GET | `/api/projects/:projectSlug/cards/:cardSlug/files` | List card's files |
| GET | `/api/projects/:projectSlug/files/:filename/download` | Download/serve file |

**Upload endpoint** uses Elysia's `t.File()` for multipart form data:
```typescript
body: t.Object({
  file: t.File(),
  description: t.Optional(t.String()),
})
```

**Download endpoint** serves the file with `Content-Disposition` header using `Bun.file(path)`.

### 3.2 WebSocket Broadcasting

All mutation endpoints broadcast events:
- Upload → `file:added` with `{ file: ProjectFileEntry }`
- Delete → `file:deleted` with `{ filename: string }`
- Update description → `file:updated` with `{ file: ProjectFileEntry }`
- Associate → `file:associated` with `{ filename, cardSlug }`
- Disassociate → `file:disassociated` with `{ filename, cardSlug }`

### 3.3 Card DELETE Cleanup

In `src/routes/cards.ts`, the DELETE handler must call `fileService.removeCardFromAllFiles(projectSlug, cardSlug)` to clean up file associations. Instantiate `FileService` at the top of `cardRoutes` alongside `CardService`.

### 3.4 File Opening Strategy

Since DevPlanner is a web app (not Electron), "open with OS handler" means:
- **Download endpoint**: Browser opens it (PDFs, images) or downloads it
- The frontend creates a temporary `<a>` element with the download URL and triggers a click
- For local dev use, a "Copy path" option could be provided as a convenience

---

## 4. MCP Integration

### 4.1 LLM File Consumption Strategy

The recommended workflow for LLM agents:

1. **Agent calls `get_card`** → response includes `files[]` with filenames and descriptions (metadata only, NOT content)
2. **Agent reviews descriptions** to decide which files are relevant
3. **Agent calls `read_file_content`** for each relevant text file
4. Binary files return an error with a helpful message suggesting the agent rely on the description

**Key principles:**
- Descriptions are strongly encouraged but not required (empty string is valid)
- File content is NEVER included in `get_card` responses — always fetched individually
- This prevents bloating card responses and gives agents selective control

### 4.2 New MCP Tools (3)

#### `list_project_files`

```
Name: list_project_files
Description: "List all files in a project with their descriptions and card associations. Use this to discover available reference materials before reading specific files."

Input:  { projectSlug: string }
Output: {
  files: Array<{
    filename: string;
    originalName: string;
    description: string;
    mimeType: string;
    size: number;
    created: string;
    associatedCards: string[];
  }>;
  total: number;
}
```

#### `list_card_files`

```
Name: list_card_files
Description: "List files associated with a specific card. Returns filenames, descriptions, and metadata. Call read_file_content to read the actual content of text-based files."

Input:  { projectSlug: string; cardSlug: string }
Output: {
  files: Array<{
    filename: string;
    originalName: string;
    description: string;
    mimeType: string;
    size: number;
  }>;
  total: number;
}
```

#### `read_file_content`

```
Name: read_file_content
Description: "Read the text content of a file in a project. Only works for text-based files (markdown, plain text, JSON, code files, etc.). Returns an error for binary files like PDFs and images."

Input:  { projectSlug: string; filename: string }
Output: {
  filename: string;
  mimeType: string;
  size: number;
  content: string;
}
```

### 4.3 Enhance `get_card` Response

Modify `handleGetCard` in `tool-handlers.ts` to include associated file metadata:

```typescript
async function handleGetCard(input: GetCardInput): Promise<GetCardOutput> {
  const card = await cardService.getCard(input.projectSlug, input.cardSlug);
  const files = await fileService.listCardFiles(input.projectSlug, input.cardSlug);

  return {
    card,
    files: files.map(f => ({
      filename: f.filename,
      description: f.description,
      mimeType: f.mimeType,
      size: f.size,
    })),
  };
}
```

### 4.4 MCP Schema Additions (`src/mcp/schemas.ts`)

Follow naming convention `UPPER_SNAKE_CASE` with `_SCHEMA` suffix:
- `LIST_PROJECT_FILES_SCHEMA`
- `LIST_CARD_FILES_SCHEMA`
- `READ_FILE_CONTENT_SCHEMA`

### 4.5 MCP Type Additions (`src/mcp/types.ts`)

Follow naming convention `PascalCase` with `Input`/`Output` suffix:
- `ListProjectFilesInput` / `ListProjectFilesOutput`
- `ListCardFilesInput` / `ListCardFilesOutput`
- `ReadFileContentInput` / `ReadFileContentOutput`

### 4.6 MCP Error Helpers (`src/mcp/errors.ts`)

```typescript
fileNotFoundError(filename, projectSlug, availableFiles?)
  → Suggests calling list_project_files, shows similar filenames

binaryFileError(filename, mimeType, size)
  → Explains the file is binary, suggests relying on description
```

### 4.7 Service Cache Update

In `tool-handlers.ts`, add `FileService` to the `getServices()` cache alongside `ProjectService`, `CardService`, `TaskService`.

### 4.8 Tool Registration

Register all 3 new tools in `src/mcp-server.ts` in the `ListToolsRequestSchema` handler, and add routing in the `CallToolRequestSchema` handler.

---

## 5. Frontend

### 5.1 Types (`frontend/src/types/index.ts`)

Mirror backend types:

```typescript
export interface ProjectFileEntry {
  filename: string;
  originalName: string;
  description: string;
  mimeType: string;
  size: number;
  created: string;
  cardSlugs: string[];
}

export interface FilesResponse {
  files: ProjectFileEntry[];
}
```

Add to `WebSocketEventType` union:
```typescript
| 'file:added' | 'file:deleted' | 'file:updated' | 'file:associated' | 'file:disassociated'
```

Add WebSocket event data interfaces: `FileAddedData`, `FileDeletedData`, `FileUpdatedData`, `FileAssociatedData`, `FileDisassociatedData`.

### 5.2 API Client (`frontend/src/api/client.ts`)

New `filesApi` object:

```typescript
export const filesApi = {
  list: (projectSlug) => fetchJSON<FilesResponse>(`/api/projects/${projectSlug}/files`),
  get: (projectSlug, filename) => fetchJSON<ProjectFileEntry>(`/api/projects/${projectSlug}/files/${encodeURIComponent(filename)}`),
  listForCard: (projectSlug, cardSlug) => fetchJSON<FilesResponse>(`/api/projects/${projectSlug}/cards/${cardSlug}/files`),
  upload: async (projectSlug, file: File, description?) => { /* FormData POST */ },
  delete: (projectSlug, filename) => fetchJSON(`...`, { method: 'DELETE' }),
  updateDescription: (projectSlug, filename, description) => fetchJSON(`...`, { method: 'PATCH', body: ... }),
  associate: (projectSlug, filename, cardSlug) => fetchJSON(`...`, { method: 'POST', body: ... }),
  disassociate: (projectSlug, filename, cardSlug) => fetchJSON(`...`, { method: 'DELETE' }),
  getDownloadUrl: (projectSlug, filename) => `/api/projects/${projectSlug}/files/${encodeURIComponent(filename)}/download`,
};
```

**Important:** Use `encodeURIComponent(filename)` for filenames with special characters. The upload method uses `FormData` (do NOT set `Content-Type` header — browser sets it with boundary).

### 5.3 Zustand Store (`frontend/src/store/index.ts`)

**New state:**
```typescript
projectFiles: ProjectFileEntry[];
activeCardFiles: ProjectFileEntry[];
isFilesPanelOpen: boolean;
isLoadingFiles: boolean;
isLoadingCardFiles: boolean;
```

**New actions:**
```typescript
loadFiles: () => Promise<void>;
uploadFile: (file: File, description?: string) => Promise<void>;
deleteFile: (filename: string) => Promise<void>;
updateFileDescription: (filename: string, description: string) => Promise<void>;
associateFile: (filename: string, cardSlug: string) => Promise<void>;
disassociateFile: (filename: string, cardSlug: string) => Promise<void>;
toggleFilesPanel: () => void;
setFilesPanelOpen: (open: boolean) => void;
loadCardFiles: (cardSlug: string) => Promise<void>;
```

**Integration points:**
- `openCardDetail` → also calls `loadCardFiles(cardSlug)`
- `toggleFilesPanel` → closes Activity panel (mutual exclusivity)
- `toggleActivityPanel` → closes Files panel (mutual exclusivity)
- Self-echo deduplication: `_recordLocalAction` / `_isRecentLocalAction` for file operations

**WebSocket handlers:**
```typescript
wsHandleFileAdded: (data: FileAddedData) => void;
wsHandleFileDeleted: (data: FileDeletedData) => void;
wsHandleFileUpdated: (data: FileUpdatedData) => void;
wsHandleFileAssociated: (data: FileAssociatedData) => void;
wsHandleFileDisassociated: (data: FileDisassociatedData) => void;
```

Register all handlers in `useWebSocket` hook via `client.on(eventType, handler)`.

### 5.4 Card Detail Panel — Files Section

**File:** Replace the placeholder at lines 92-113 of `frontend/src/components/card-detail/CardDetailPanel.tsx`

**New component:** `frontend/src/components/card-detail/CardFiles.tsx`

Features:
- **File list**: Shows `activeCardFiles` — each item has clickable filename (opens via download URL), inline-editable description, file size, MIME type indicator, remove button (disassociates, does NOT delete)
- **"Add existing file" control**: Dropdown listing project files not already associated with this card. Clicking one calls `associateFile(filename, cardSlug)`.
- **Upload zone**: Drag-and-drop area using native HTML5 `onDragOver`/`onDrop` (NOT `@dnd-kit` — different use case). Also includes hidden `<input type="file">` triggered by an "Upload" button.
- **Auto-associate**: Files uploaded from within a card detail panel are automatically associated with that card.

**Click to open**: `window.open(filesApi.getDownloadUrl(projectSlug, filename))` — browser opens (PDFs, images) or downloads the file.

### 5.5 Sidebar Files Panel

**New components:**
- `frontend/src/components/files/FilesPanel.tsx` — slide-in panel modeled after `ActivityPanel` (Framer Motion, right-side)
- `frontend/src/components/files/FileUploadZone.tsx` — drag-drop area + file picker button
- `frontend/src/components/files/ProjectFilesList.tsx` — file list with management controls

**Header integration:** Add a "Files" `IconButton` in `frontend/src/components/layout/Header.tsx` after the Activity History toggle (line ~167). Use a folder/document SVG icon. Highlight with `bg-blue-500/20 text-blue-400` when active (same pattern as Activity toggle).

**App.tsx integration:** Add `<FilesPanel isOpen={isFilesPanelOpen} onClose={() => setFilesPanelOpen(false)} />` alongside `ActivityPanel`.

**FilesPanel features:**
- Upload drop zone at the top
- Searchable/filterable file list
- Each file shows: MIME type icon, filename (clickable to open), description (inline editable), size (formatted: "245 KB", "1.5 MB"), association count badge ("3 cards" or "No cards")
- **Delete button**:
  - Orphaned files (0 associations): delete directly
  - Associated files: show `ConfirmModal` — "This file is associated with N cards. Deleting it will remove all associations. Continue?" with danger variant
- Click filename to open/download

### 5.6 Mutual Panel Exclusivity

Opening the Files panel closes the Activity panel and vice versa. Prevents overlapping slide-in panels:

```typescript
toggleFilesPanel: () => set((state) => ({
  isFilesPanelOpen: !state.isFilesPanelOpen,
  isActivityPanelOpen: false,
})),
```

---

## 6. WebSocket Events

### 6.1 Event Types

| Event | Payload | Trigger |
|-------|---------|---------|
| `file:added` | `{ file: ProjectFileEntry }` | File uploaded |
| `file:deleted` | `{ filename: string }` | File deleted |
| `file:updated` | `{ file: ProjectFileEntry }` | Description changed |
| `file:associated` | `{ filename, cardSlug }` | File linked to card |
| `file:disassociated` | `{ filename, cardSlug }` | File unlinked from card |

### 6.2 Backend Types

Add to `WebSocketEventType` union in `src/types/index.ts`:
```typescript
| 'file:added' | 'file:deleted' | 'file:updated' | 'file:associated' | 'file:disassociated'
```

Add event data interfaces: `FileAddedData`, `FileDeletedData`, `FileUpdatedData`, `FileAssociatedData`, `FileDisassociatedData`.

---

## 7. Gitignore

The repo `.gitignore` already has `workspace/` which covers all workspace data including `_files/` directories.

For users who version-control their workspace directory separately, add a workspace-level `.gitignore`:

```
# DevPlanner: uploaded/reference files (binary, potentially large)
**/_files/
```

Consider having `ProjectService.createProject()` write this `.gitignore` at the workspace root if one doesn't exist.

Also update `CLAUDE.md` to document the `_files/` directory in the Data Storage section.

---

## 8. Testing

### 8.1 Backend Unit Tests (`src/__tests__/file.service.test.ts`)

Follow pattern from `src/__tests__/card.service.test.ts`:
- Temp workspace per test with `mkdtemp`, cleanup with `rm`
- Reset singletons between tests

**Test cases:**
- `addFile`: creates `_files/` dir, writes file, updates `_files.json`
- `addFile` with duplicate name: deduplicates filename (`-2`, `-3`)
- `listFiles`: returns all files
- `listCardFiles`: filters by card association
- `deleteFile`: removes file and manifest entry, returns associated cards
- `updateFileDescription`: updates description in manifest
- `associateFile`: adds cardSlug to entry
- `disassociateFile`: removes cardSlug from entry
- `associateFile` with nonexistent file: throws error
- `removeCardFromAllFiles`: removes card from all file entries
- `getFilePath`: returns absolute path
- `getFileContent`: returns text content for text files, errors on binary

### 8.2 MCP Tool Tests (`src/mcp/__tests__/tool-handlers.test.ts`)

Add test cases for `list_project_files`, `list_card_files`, `read_file_content`.

---

## 9. Future: URL References (High-Level)

When URL references are implemented, extend `_files.json` entries with a `type` discriminator:

```typescript
type ProjectReference = ProjectLocalFile | ProjectUrlReference;

interface ProjectLocalFile {
  type: 'file';
  filename: string;
  originalName: string;
  description: string;
  mimeType: string;
  size: number;
  created: string;
  cardSlugs: string[];
}

interface ProjectUrlReference {
  type: 'url';
  url: string;
  title: string;
  description: string;
  created: string;
  cardSlugs: string[];
  // Future: cachedMarkdown?: string; (from scraping)
}
```

**Do NOT add the `type` field now.** When URLs are implemented, add it and treat entries without `type` as `type: 'file'` for backward compatibility.

Future work includes:
- MCP scraping tool or Agent Skill for URL-to-markdown conversion
- URL preview/metadata fetching (title, favicon, description)
- URL validation and health checking
- Cached markdown content for LLM consumption

---

## 10. Critical Files Reference

| File | Modification |
|------|-------------|
| `src/types/index.ts` | Add file types, WS event types |
| `src/services/file.service.ts` | **New** — file management service |
| `src/__tests__/file.service.test.ts` | **New** — unit tests |
| `src/routes/files.ts` | **New** — REST API routes |
| `src/routes/cards.ts` | Add `removeCardFromAllFiles` to DELETE handler |
| `src/server.ts` | Register `fileRoutes` |
| `src/mcp/types.ts` | Add MCP input/output types |
| `src/mcp/schemas.ts` | Add JSON schemas for 3 tools |
| `src/mcp/errors.ts` | Add `fileNotFoundError`, `binaryFileError` |
| `src/mcp/tool-handlers.ts` | Add 3 handlers, enhance `get_card`, update services cache |
| `src/mcp-server.ts` | Register 3 new tools |
| `frontend/src/types/index.ts` | Mirror backend types |
| `frontend/src/api/client.ts` | Add `filesApi` |
| `frontend/src/store/index.ts` | Add file state, actions, WS handlers |
| `frontend/src/hooks/useWebSocket.ts` | Register file event handlers |
| `frontend/src/components/card-detail/CardDetailPanel.tsx` | Replace attachments placeholder (lines 92-113) |
| `frontend/src/components/card-detail/CardFiles.tsx` | **New** — card files section |
| `frontend/src/components/files/FilesPanel.tsx` | **New** — sidebar files panel |
| `frontend/src/components/files/FileUploadZone.tsx` | **New** — drag-drop upload zone |
| `frontend/src/components/files/ProjectFilesList.tsx` | **New** — project file list with management |
| `frontend/src/components/layout/Header.tsx` | Add Files toggle button |
| `frontend/src/App.tsx` | Add `FilesPanel` |
| `.gitignore` | Already has `workspace/` — no change needed |
| `CLAUDE.md` | Document new API endpoints and `_files/` directory |
