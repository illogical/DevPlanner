# Obsidian Vault Integration

## Overview

DevPlanner's file storage system has been replaced with Obsidian Vault integration. Instead of storing artifact files in a `_files/` directory with a JSON manifest, files are written directly to the Obsidian Vault and referenced via the existing Links system.

## Key Design Decisions

### Separate Workspace and Vault Paths

`DEVPLANNER_WORKSPACE` is the kanban data directory (cards, lane metadata). It remains independent of the Obsidian Vault.

`OBSIDIAN_VAULT_PATH` is the Obsidian Vault subfolder where artifact files are written. This is the folder whose path prefix is already included in `OBSIDIAN_BASE_URL`.

```
DEVPLANNER_WORKSPACE=C:\SynologyDrive\Drive\Development\AgentKanbanWorkspace
OBSIDIAN_VAULT_PATH=C:\SynologyDrive\OpenClaw\notes\AgentVault\10-Projects
OBSIDIAN_BASE_URL=https://vaultpad.bangus-city.ts.net/view?path=10-Projects
```

`OBSIDIAN_BASE_URL` already includes the vault subfolder prefix (`10-Projects`) that corresponds to `OBSIDIAN_VAULT_PATH`. Links are constructed by appending the URL-encoded relative path from `OBSIDIAN_VAULT_PATH`.

### Artifact File Path Structure

```
{OBSIDIAN_VAULT_PATH}/
└── {project-slug}/            ← per-project folder inside vault
    └── {card-slug}/           ← per-card artifact folder (created on demand)
        └── {TIMESTAMP}_{LABEL-SLUG}.md   ← artifact file (LABEL-SLUG is UPPERCASE)
```

**Example:**
- Project: `hex`
- Card: `my-feature-card`
- Label: `"Implementation Spec"`
- Path: `{OBSIDIAN_VAULT_PATH}/hex/my-feature-card/2026-03-05_14-00-00_IMPLEMENTATION-SPEC.md`

### URL Construction

```ts
const relativePath = path.relative(vaultPath, filePath).replace(/\\/g, '/');
const url = `${obsidianBaseUrl}%2F${encodeURIComponent(relativePath)}`;
// → https://vaultpad.bangus-city.ts.net/view?path=10-Projects%2Fhex%2Fmy-feature-card%2F2026-03-05_14-00-00_IMPLEMENTATION-SPEC.md
```

### Filename Generation

- No separate `filename` input — filename is derived from `label`
- Timestamp format: `YYYY-MM-DD_HH-MM-SS`
- Label slug: `slugify(label).toUpperCase()` (reuses `src/utils/slug.ts`)
- Extension: always `.md`
- Final: `{TIMESTAMP}_{UPPERCASE-LABEL-SLUG}.md`

### Links System

Vault artifacts are tracked via the existing Links system on the card. No new link `kind` was added — callers use existing kinds (`doc`, `spec`, `ticket`, `repo`, `reference`, `other`).

---

## Environment Variables

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `DEVPLANNER_WORKSPACE` | Yes | `C:\...\AgentKanbanWorkspace` | Kanban data directory (cards, lane metadata). Separate from the vault. |
| `OBSIDIAN_VAULT_PATH` | Optional* | `C:\...\AgentVault\10-Projects` | Obsidian vault subfolder where artifact files are written. *Required for vault artifact creation. |
| `OBSIDIAN_BASE_URL` | Optional* | `https://vaultpad.../view?path=10-Projects` | Base URL including vault subfolder prefix. *Required for vault artifact creation. |

Both `OBSIDIAN_VAULT_PATH` and `OBSIDIAN_BASE_URL` must be set together. The path segment in `OBSIDIAN_BASE_URL` must correspond to the final folder segment of `OBSIDIAN_VAULT_PATH` — they both reference the same vault subfolder from different perspectives (filesystem vs HTTP).

---

## API

### POST /api/projects/:projectSlug/cards/:cardSlug/artifacts

Creates a Markdown file in the Obsidian Vault and attaches a link to the card.

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
- `400 OBSIDIAN_NOT_CONFIGURED` — `OBSIDIAN_BASE_URL` or `OBSIDIAN_VAULT_PATH` is not set
- `400 INVALID_LABEL` — Label is empty or whitespace
- `404` — Project or card not found
- `409 DUPLICATE_LINK` — A link with this URL already exists on the card

---

## MCP Tool

### create_vault_artifact

Writes a Markdown file to the Obsidian Vault and attaches a link to the card.

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

On save, the file content is read client-side and sent to `POST /artifacts`. If `OBSIDIAN_BASE_URL` is not configured, a friendly error message is shown.

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
