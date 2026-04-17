# Artifact Storage

## Overview

DevPlanner's file storage system replaced the old `_files/` directory with an external artifact storage system. Files are written directly to a configurable path on disk and referenced via the existing Links system.

## Key Design Decisions

### Separate Workspace and Artifact Paths

`DEVPLANNER_WORKSPACE` is the kanban data directory (cards, lane metadata). It remains independent of artifact storage.

`ARTIFACT_BASE_PATH` is the folder where artifact files are written. This is the folder whose path prefix is already included in `ARTIFACT_BASE_URL`.

```
DEVPLANNER_WORKSPACE=C:\SynologyDrive\Drive\Development\AgentKanbanWorkspace
ARTIFACT_BASE_PATH=C:\SynologyDrive\OpenClaw\notes\AgentVault\10-Projects
ARTIFACT_BASE_URL=https://vaultpad.bangus-city.ts.net/view?path=10-Projects
```

`ARTIFACT_BASE_URL` already includes the subfolder prefix (`10-Projects`) that corresponds to `ARTIFACT_BASE_PATH`. Links are constructed by appending the URL-encoded relative path from `ARTIFACT_BASE_PATH`.

### Artifact File Path Structure

```
{ARTIFACT_BASE_PATH}/
└── {project-slug}/            ← per-project folder
    └── {card-slug}/           ← per-card artifact folder (created on demand)
        └── {TIMESTAMP}_{LABEL-SLUG}.md   ← artifact file (LABEL-SLUG is UPPERCASE)
```

**Example:**
- Project: `hex`
- Card: `my-feature-card`
- Label: `"Implementation Spec"`
- Path: `{ARTIFACT_BASE_PATH}/hex/my-feature-card/2026-03-05_14-00-00_IMPLEMENTATION-SPEC.md`

### URL Construction

```ts
const relativePath = path.relative(basePath, filePath).replace(/\\/g, '/');
const url = `${artifactBaseUrl}%2F${encodeURIComponent(relativePath)}`;
// → https://vaultpad.bangus-city.ts.net/view?path=10-Projects%2Fhex%2Fmy-feature-card%2F2026-03-05_14-00-00_IMPLEMENTATION-SPEC.md
```

### Filename Generation

- No separate `filename` input — filename is derived from `label`
- Timestamp format: `YYYY-MM-DD_HH-MM-SS`
- Label slug: `slugify(label).toUpperCase()` (reuses `src/utils/slug.ts`)
- Extension: always `.md`
- Final: `{TIMESTAMP}_{UPPERCASE-LABEL-SLUG}.md`

### Links System

Artifacts are tracked via the existing Links system on the card. No new link `kind` was added — callers use existing kinds (`doc`, `spec`, `ticket`, `repo`, `reference`, `other`).

---

## Environment Variables

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `DEVPLANNER_WORKSPACE` | Yes | `C:\...\AgentKanbanWorkspace` | Kanban data directory (cards, lane metadata). Separate from artifact storage. |
| `ARTIFACT_BASE_PATH` | Optional* | `C:\...\AgentVault\10-Projects` | Folder where artifact files are written. *Required for artifact creation. |
| `ARTIFACT_BASE_URL` | Optional* | `https://vaultpad.../view?path=10-Projects` | Base URL including subfolder prefix. *Required for artifact creation. |

Both `ARTIFACT_BASE_PATH` and `ARTIFACT_BASE_URL` must be set together. The path segment in `ARTIFACT_BASE_URL` must correspond to the final folder segment of `ARTIFACT_BASE_PATH` — they both reference the same folder from different perspectives (filesystem vs HTTP).

---

## API

### POST /api/projects/:projectSlug/cards/:cardSlug/artifacts

Creates a Markdown file in the artifact storage path and attaches a link to the card.

**Request body:**
```json
{
  "label": "Implementation Spec",
  "content": "# Implementation Spec\n\n...",
  "kind": "spec"
}
```

- `label` (required) — Display label for the link and source for the filename slug
- `content` (required) — UTF-8 text content to write to the file
- `kind` (optional, default `"doc"`) — Link kind: `doc | spec | ticket | repo | reference | other`

**Response 201:**
```json
{
  "link": {
    "id": "uuid",
    "label": "Implementation Spec",
    "url": "https://vaultpad.bangus-city.ts.net/view?path=10-Projects%2Fhex%2Fmy-feature-card%2F2026-03-05_14-00-00_IMPLEMENTATION-SPEC.md",
    "kind": "spec",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "filePath": "C:\\...\\10-Projects\\hex\\my-feature-card\\2026-03-05_14-00-00_IMPLEMENTATION-SPEC.md"
}
```

**Error responses:**
- `400 ARTIFACT_NOT_CONFIGURED` — `ARTIFACT_BASE_URL` or `ARTIFACT_BASE_PATH` is not set
- `400 INVALID_LABEL` — Label is empty or whitespace
- `404` — Project or card not found
- `409 DUPLICATE_LINK` — A link with this URL already exists on the card

---

## MCP Tool

### create_vault_artifact

Writes a Markdown file to the artifact storage path and attaches a link to the card.

**Replaces:** `add_file_to_card`, `list_project_files`, `list_card_files`, `read_file_content`

**Inputs:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectSlug` | string | Yes | Project identifier |
| `cardSlug` | string | Yes | Card identifier |
| `label` | string | Yes | Display label AND filename source (e.g. `"Implementation Spec"` → `2026-03-05_IMPLEMENTATION-SPEC.md`) |
| `content` | string | Yes | UTF-8 text content |
| `kind` | string | No | `doc\|spec\|ticket\|repo\|reference\|other` (default: `doc`) |

**Outputs:** `{ link: CardLink, filePath: string, message: string }`

---

## Frontend

The separate "Files" section has been removed from card detail panels and the project-level FilesPanel has been removed from the header.

The Links section (`CardLinks`) now includes an "Upload File" button alongside "+ Add Link". Clicking "Upload File" opens an `UploadLinkForm` with:

- File picker (accepts `.md`, `.txt`, `.json`, `.ts`, `.tsx`, `.js`, `.jsx`, `.yaml`, `.yml`, `.csv`)
- Label field (pre-filled from filename without extension, editable)
- Kind selector (same options as the URL link form)

On save, the file content is read client-side and sent to `POST /artifacts`. If `ARTIFACT_BASE_URL` is not configured, a friendly error message is shown.

---

## Removed

### Backend
- `src/routes/files.ts` — all `/api/projects/:slug/files` endpoints
- `src/services/file.service.ts` — `_files/` storage and `_files.json` manifest
- MCP tools: `add_file_to_card`, `list_project_files`, `list_card_files`, `read_file_content`

### Frontend
- `FilesPanel` component and header button
- `CardFiles` section in card detail panel
- `FileListItem`, `FileAssociationInput` components
- `filesApi` in `api/client.ts`
- `FileSlice` in Zustand store

### Data
- `_files.json` manifest (existing files are not migrated or deleted)
- `_files/` directory (orphaned, can be manually removed)
