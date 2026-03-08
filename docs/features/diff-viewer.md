# Diff Viewer

A split-pane file comparison view built into DevPlanner, inspired by [SplitDiff](https://github.com/illogical/SplitDiff). Allows side-by-side comparison of vault artifact files with syntax highlighting. Opens in a new browser tab from a button on each vault artifact link in the card detail panel.

---

## Motivation

DevPlanner's vault artifact integration writes versioned Markdown artifacts for each card. When multiple artifact versions exist, there is currently no way to compare them. This feature closes that gap by embedding a lightweight diff viewer directly into DevPlanner, reachable from any vault artifact link with one click.

---

## Scope

### MVP (initial implementation)

- Split-pane view (left / right) with line-by-line diff rendering
- Syntax highlighting via highlight.js (auto-detect language from filename extension)
- Left pane auto-loads the vault artifact file when opened via the card link button
- Right pane starts empty; user provides a comparison file via:
  - Drag-and-drop onto the pane
  - Native file picker
  - Direct text paste (Ctrl+V / Cmd+V)
  - Optional `?right=<path>` URL param (for future deep-link support)
- Synchronized scrolling (both panes scroll together)
- Toolbar: language selector, wrap toggle, sync-scroll toggle, swap panes, clear panes
- Color-coded diff lines: addition (green), deletion (red), unchanged (neutral)
- Line numbers in each pane

### Future (low priority — track as separate cards)

| Feature | Notes |
|---------|-------|
| Collapse unchanged sections | Hide unchanged regions, show context lines around hunks (like GitHub) |
| Hunk navigation | Prev / Next change buttons to jump between diff hunks |
| Text search | Find within diff content with prev/next navigation |
| Tab management | Multiple comparisons in browser-persisted tabs |
| Mark as reviewed | Per-diff review status |
| Ignore whitespace | Diff toggle to skip whitespace-only changes |
| Deep-link right pane | Support `?right=<path>` URL param to auto-load both panes |

---

## Artifact Viewer URL Parsing

Vault artifact links use an external artifact viewer URL format (e.g. VaultPad). The viewer is an external web app — its URLs cannot be fetched for raw content. Instead, DevPlanner's backend serves raw content directly from the local artifact path.

### URL structure

```
https://viewer.example.com/view?path=10-Projects%2Fmy-project%2Fmy-card%2F2026-03-07_22-13-34_MY-LABEL.md
                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                    URL-decoded: 10-Projects/my-project/my-card/2026-03-07_22-13-34_MY-LABEL.md
```

### Environment variables involved

| Variable | Example value |
|----------|--------------|
| `ARTIFACT_BASE_URL` | `https://viewer.example.com/view?path=10-Projects` |
| `ARTIFACT_BASE_PATH` | `/path/to/artifact/vault/10-Projects` |

### Parsing logic (frontend)

To convert a vault link URL to a relative path the backend can serve:

1. Parse the vault link URL; extract the `path` query parameter.
   Example decoded value: `10-Projects/my-project/my-card/2026-03-07_22-13-34_MY-LABEL.md`

2. Parse `ARTIFACT_BASE_URL` (exposed via `GET /api/config/public`); extract its `path` query parameter.
   Example decoded value: `10-Projects`

3. Strip the base path prefix (plus one `/`) from the file path.
   Result: `my-project/my-card/2026-03-07_22-13-34_MY-LABEL.md`

4. Pass this relative path to `GET /api/vault/content?path=<encoded-relative-path>`.

### Detecting vault artifact links (frontend)

A link is a vault artifact if its URL starts with the value of `ARTIFACT_BASE_URL`. The "Open in Diff Viewer" button is only rendered for links that pass this check.

Since `ARTIFACT_BASE_URL` is a server-side env var, the frontend fetches it from `GET /api/config/public` on mount. This keeps config centralised on the backend and does not require rebuilding the frontend when the URL changes.

---

## Backend Changes

### New endpoint: `GET /api/vault/content`

Serves raw file content from the local artifact base directory. Requires `ARTIFACT_BASE_PATH` to be configured.

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | Yes | Relative path within `ARTIFACT_BASE_PATH` (URL-encoded). Example: `my-project%2Fmy-card%2Ffile.md` |

**Behavior:**
1. Validate `ARTIFACT_BASE_PATH` is configured; return `400 ARTIFACT_NOT_CONFIGURED` if not.
2. Resolve the absolute path: `path.resolve(ARTIFACT_BASE_PATH, decodedRelativePath)`.
3. Verify the resolved path is inside `ARTIFACT_BASE_PATH` (path traversal guard — reject if not).
4. Read the file; return `404` if not found.
5. Return the raw file content with `Content-Type: text/plain; charset=utf-8`.

**Response `200`:** Raw file text (not JSON).

**Errors:**

| Code | Error | Condition |
|------|-------|-----------|
| `400` | `ARTIFACT_NOT_CONFIGURED` | `ARTIFACT_BASE_PATH` env var not set |
| `400` | `INVALID_PATH` | Path traversal detected or path is empty |
| `404` | `FILE_NOT_FOUND` | File does not exist at resolved path |

**Files to create/modify:**

- `src/routes/vault.ts` — New route file; registers `GET /api/vault/content`
- `src/server.ts` — Import and register the new vault route
- `src/services/vault.service.ts` — Add `readArtifactContent(relativePath: string): Promise<string>` method
- `src/services/config.service.ts` — Verify `artifactBasePath` is already exposed (it is)

### New endpoint: `GET /api/config/public`

Returns safe public configuration values for the frontend. The `artifactBaseUrl` field is used by the frontend to detect vault artifact links and build Diff Viewer URLs.

**Response `200`:**
```json
{
  "artifactBaseUrl": "https://viewer.example.com/view?path=10-Projects"
}
```

If `ARTIFACT_BASE_URL` is not configured, `artifactBaseUrl` is `null`.

**Files to create/modify:**

- `src/routes/config.ts` — New route file; registers `GET /api/config/public`
- `src/server.ts` — Import and register the new config route

---

## Frontend Changes

### 1. Add dependencies

```bash
cd frontend
bun add react-router-dom highlight.js diff
bun add -d @types/highlight.js
```

| Package | Purpose |
|---------|---------|
| `react-router-dom` v7 | URL-based routing (`/` Kanban, `/diff` viewer) |
| `highlight.js` | Syntax highlighting for diff pane content |
| `diff` (jsdiff) | Myers diff algorithm — produces line-by-line change sets |

### 2. Routing setup

Wrap the app in `BrowserRouter` and define two routes:

**`frontend/src/main.tsx`** — add `BrowserRouter`:
```tsx
import { BrowserRouter } from 'react-router-dom';
// wrap <App /> in <BrowserRouter>
```

**`frontend/src/App.tsx`** — add `Routes` / `Route`:
```tsx
import { Routes, Route } from 'react-router-dom';
import { DiffViewerPage } from './pages/DiffViewerPage';

// Route '/' → existing MainLayout + KanbanBoard
// Route '/diff' → DiffViewerPage
```

### 3. New page

**`frontend/src/pages/DiffViewerPage.tsx`**

Top-level page component rendered at `/diff`. Reads `?left=` (and optionally `?right=`) from the URL search params. Fetches left-pane content from `GET /api/vault/content?path=<left>` on mount.

### 4. Component tree

```
DiffViewerPage
├── DiffHeader           — Page title, back-to-DevPlanner link
├── DiffToolbar          — Controls: language selector, wrap toggle, sync-scroll toggle, swap, clear
└── DiffLayout           — Horizontal split (CSS grid or flexbox, 50/50)
    ├── DiffPane (left)
    │   ├── DiffPaneHeader  — Filename display, copy-to-clipboard button
    │   ├── DropZone        — Drag-and-drop overlay (hidden when content loaded)
    │   └── DiffContent     — Scrollable code area
    │       └── DiffLine[]  — One per line: line number + highlighted text + change type class
    └── DiffPane (right)
        ├── DiffPaneHeader  — Filename display, file-picker button, copy button
        ├── DropZone        — Drag-and-drop overlay (active by default when empty)
        └── DiffContent     — Scrollable code area (synchronized with left)
            └── DiffLine[]
```

### 5. Component specifications

#### `DiffViewerPage`

- On mount: reads `?left=` param; calls `GET /api/vault/content?path=<left>`; sets left pane content and filename.
- Also reads optional `?right=` param; if present, auto-loads right pane similarly.
- Passes content and diff results down to `DiffLayout`.
- Computes diff using `diff.diffLines(leftContent, rightContent)` from the `diff` package.

#### `DiffToolbar`

Props: `language`, `onLanguageChange`, `wrap`, `onWrapToggle`, `syncScroll`, `onSyncScrollToggle`, `onSwap`, `onClear`.

- Language selector: `<select>` with options Auto, Bash, TypeScript, JavaScript, Python, Markdown, JSON, YAML, HTML, CSS, Other. On change, re-highlights both panes.
- Wrap toggle: adds/removes `whitespace-pre-wrap` CSS class on pane content.
- Sync scroll toggle: enables/disables the shared scroll handler.
- Swap: swaps left and right content.
- Clear: resets both panes to empty.

#### `DiffPane`

Props: `content`, `filename`, `diffLines`, `language`, `wrap`, `scrollRef`, `onFileLoad`, `side: 'left' | 'right'`.

- `scrollRef`: forwarded ref for synchronized scrolling.
- `onFileLoad(content: string, filename: string)`: called when user drops or picks a file.
- Renders `DiffContent` with `DiffLine` components.

#### `DiffContent`

- Renders a `<div>` with `overflow-y: auto` and a scroll event listener.
- When sync scroll is enabled, the scroll handler updates the sibling pane's scroll position via its ref.
- Line numbers are rendered as a fixed-width left column using CSS grid.

#### `DiffLine`

Props: `lineNumber`, `text`, `type: 'added' | 'removed' | 'unchanged'`, `language`, `wrap`.

- Highlights `text` using `highlight.js` with the selected language.
- Applies a background color class based on `type`:
  - `added` → `bg-green-900/40 text-green-300`
  - `removed` → `bg-red-900/40 text-red-300`
  - `unchanged` → transparent / default text

#### `DropZone`

- Renders a visible drop target overlay when no content is loaded.
- Handles `dragover`, `drop` events; reads `FileReader.readAsText()`.
- Also registers a `paste` listener on the pane's container for clipboard input.
- Includes a `<input type="file">` (hidden) triggered by a "Choose file" button.
- Accepts: `.md`, `.txt`, `.json`, `.ts`, `.tsx`, `.js`, `.jsx`, `.yaml`, `.yml`, `.csv`, `.html`, `.css`

#### `DiffPaneHeader`

Props: `filename`, `onCopy`, `onFilePickerOpen` (right pane only).

- Displays the filename (or "No file" placeholder).
- Copy button: copies raw pane content to clipboard.

#### `DiffHeader`

- Displays "Diff Viewer" title.
- "Back to DevPlanner" link navigates to `/` using React Router `<Link>`.

### 6. Synchronized scrolling

Use `useRef` for each pane's scroll container. A shared `useSyncScroll` hook:
- Attaches `scroll` event listeners to both refs.
- When one pane scrolls and sync is enabled, mirrors `scrollTop` and `scrollLeft` to the other pane.
- Uses a lock flag to prevent scroll event loops.

### 7. State management

The diff viewer is a self-contained page with local React state only — no Zustand store involvement. State lives in `DiffViewerPage` and is passed down via props.

```typescript
interface DiffViewerState {
  leftContent: string;
  leftFilename: string;
  rightContent: string;
  rightFilename: string;
  language: string;         // 'auto' | 'typescript' | 'javascript' | ...
  wrap: boolean;
  syncScroll: boolean;
  loading: boolean;
  error: string | null;
}
```

### 8. Diff computation

```typescript
import { diffLines } from 'diff';

// Called whenever leftContent or rightContent changes
const changes = diffLines(leftContent, rightContent);

// Flatten into per-line array for rendering
const lines = changes.flatMap(part =>
  part.value.split('\n').filter((_, i, arr) => i < arr.length - 1 || part.value.endsWith('\n')).map(text => ({
    text,
    type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
  }))
);
```

Line numbers are tracked separately per pane (left pane omits added lines from its counter; right pane omits removed lines).

### 9. API client addition

**`frontend/src/api/client.ts`** — add:

```typescript
export const vaultApi = {
  getContent: (relativePath: string) =>
    fetch(`/api/vault/content?path=${encodeURIComponent(relativePath)}`).then(r => {
      if (!r.ok) throw new Error(`Failed to load file: ${r.status}`);
      return r.text();
    }),
};

export const publicConfigApi = {
  get: (): Promise<{ artifactBaseUrl: string | null }> =>
    fetch('/api/config/public').then(r => r.json()),
};
```

---

## CardLinks UI Changes

**File:** `frontend/src/components/card-detail/CardLinks.tsx`

### New button per link row

For each link whose URL starts with `artifactBaseUrl` (fetched once from `GET /api/config/public` and stored in local state or a lightweight context), render an additional icon button:

```
[kind badge] [label ↗]    [⊞ Diff]  [✏ Edit]  [✕ Delete]
```

- Icon: a split-pane or compare icon (e.g. `⊞` or a custom SVG)
- Tooltip: "Open in Diff Viewer"
- Action: `window.open(buildDiffUrl(link.url), '_blank')`

### `buildDiffUrl` helper

```typescript
// frontend/src/utils/diffUrl.ts
export function buildDiffUrl(vaultLinkUrl: string, artifactBaseUrl: string): string {
  const linkUrl = new URL(vaultLinkUrl);
  const baseUrl = new URL(artifactBaseUrl);

  // Both have a 'path' query param
  const fullPath = decodeURIComponent(linkUrl.searchParams.get('path') ?? '');
  const basePath = decodeURIComponent(baseUrl.searchParams.get('path') ?? '');

  // Strip base path prefix (e.g. "10-Projects/") from the full path
  const relativePath = fullPath.startsWith(basePath + '/')
    ? fullPath.slice(basePath.length + 1)
    : fullPath;

  return `/diff?left=${encodeURIComponent(relativePath)}`;
}
```

### Fetching public config in CardLinks

On `CardLinks` mount (or in the parent `CardDetailPanel`), fetch `GET /api/config/public` once and store `artifactBaseUrl`. If `null`, no diff buttons are shown. This fetch can be cached in a React context or a simple module-level promise so it only runs once per session.

---

## Styling

The diff viewer uses the same Tailwind CSS 4 dark theme as the rest of DevPlanner. Key color assignments:

| Element | Tailwind classes |
|---------|-----------------|
| Added line background | `bg-green-950` |
| Added line text | `text-green-300` |
| Removed line background | `bg-red-950` |
| Removed line text | `text-red-300` |
| Unchanged line | `bg-transparent text-gray-300` |
| Line number column | `text-gray-600 select-none w-12 text-right pr-3` |
| Pane border | `border-gray-700` |
| Toolbar background | `bg-gray-900 border-b border-gray-700` |
| Page background | `bg-gray-950` |

---

## Files to Create

| Path | Description |
|------|-------------|
| `src/routes/vault.ts` | Backend: `GET /api/vault/content` route |
| `src/routes/config.ts` | Backend: `GET /api/config/public` route |
| `frontend/src/pages/DiffViewerPage.tsx` | Top-level page component |
| `frontend/src/components/diff/DiffHeader.tsx` | Page title + back link |
| `frontend/src/components/diff/DiffToolbar.tsx` | Language, wrap, sync controls |
| `frontend/src/components/diff/DiffLayout.tsx` | Two-pane grid container |
| `frontend/src/components/diff/DiffPane.tsx` | Single pane with header + content |
| `frontend/src/components/diff/DiffPaneHeader.tsx` | Filename, copy, file picker |
| `frontend/src/components/diff/DiffContent.tsx` | Scrollable lines container |
| `frontend/src/components/diff/DiffLine.tsx` | Individual line renderer |
| `frontend/src/components/diff/DropZone.tsx` | Drag-and-drop / paste input |
| `frontend/src/utils/diffUrl.ts` | `buildDiffUrl()` helper |
| `frontend/src/hooks/useSyncScroll.ts` | Synchronized scroll hook |

## Files to Modify

| Path | Change |
|------|--------|
| `src/server.ts` | Register `vaultRoute` and `configRoute` |
| `src/services/vault.service.ts` | Add `readArtifactContent(relativePath)` method |
| `frontend/src/main.tsx` | Wrap app in `BrowserRouter` |
| `frontend/src/App.tsx` | Add `Routes` with `/` and `/diff` routes |
| `frontend/src/api/client.ts` | Add `vaultApi` and `publicConfigApi` |
| `frontend/src/components/card-detail/CardLinks.tsx` | Add diff button + artifactBaseUrl fetch |

---

## Dependencies to Add

### Frontend (`frontend/package.json`)

```bash
bun add react-router-dom highlight.js diff
```

| Package | Version constraint | Purpose |
|---------|-------------------|---------|
| `react-router-dom` | `^7.0.0` | URL routing |
| `highlight.js` | `^11.9.0` | Syntax highlighting |
| `diff` | `^7.0.0` | Line diff algorithm (jsdiff) |

### Backend (`package.json`)

No new dependencies required. File reading uses Bun's built-in `Bun.file()` / `fs` APIs.

---

## Security Considerations

### Path traversal guard (backend)

The `GET /api/vault/content` endpoint must verify the resolved absolute path is inside `ARTIFACT_BASE_PATH` before reading. Use `path.resolve()` and check with `startsWith`:

```typescript
import path from 'path';

const resolved = path.resolve(vaultPath, relativePath);
if (!resolved.startsWith(path.resolve(vaultPath))) {
  throw new Error('INVALID_PATH');
}
```

This prevents requests like `?path=../../etc/passwd` from escaping the artifact base directory.

---

## Verification

After implementation, verify with the following manual test:

1. Start the backend and frontend: `bun run dev`
2. Open a project with at least one vault artifact link on a card.
3. Open the card detail panel; confirm the "Open in Diff Viewer" button appears on vault artifact links only (not on plain URL links).
4. Click the button; verify a new browser tab opens at `/diff?left=<path>`.
5. Confirm the left pane auto-loads the file content with syntax highlighting.
6. Drag a local Markdown file onto the right pane; confirm the diff is rendered with green/red highlighting.
7. Enable sync scroll; verify both panes scroll together.
8. Toggle wrap; verify long lines wrap/unwrap in both panes.
9. Click Swap; verify left and right content exchange.
10. Navigate to `GET /api/vault/content?path=../../etc/passwd` directly; verify `400 INVALID_PATH` is returned.
11. Navigate to `/diff` with no `?left=` param; verify both panes start empty with drop zone visible.

---

## Post-Implementation Documentation Updates

When the feature is implemented, update the following sections:

### `README.md`

- **Features → Current**: Add entry: `✅ **Diff Viewer** — Split-pane file comparison with syntax highlighting; opens vault artifact files directly from card links`
- **API Overview table**: Add `GET /api/vault/content` and `GET /api/config/public` rows
- **Architecture → Backend routes**: Add `vault.ts` and `config.ts` to the route list

### `frontend/README.md`

- **Architecture → Component tree**: Add `DiffViewerPage` and its `diff/` component subtree
- **Tech stack table**: Add `highlight.js`, `react-router-dom`, `diff` (jsdiff) rows

### `docs/SPECIFICATION.md`

- **Section 3 (Backend API)**: Add section 3.13 for `GET /api/vault/content` and `GET /api/config/public` with full request/response specs
- **Section 5 (Frontend Architecture) → Component Tree**: Add DiffViewerPage subtree
- **Section 5.1 (Tech Stack)**: Add routing, diff, and highlighting libraries
