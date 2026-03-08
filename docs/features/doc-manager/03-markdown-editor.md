# 03 — Markdown Editor

**Status:** Planning  
**Depends on:** 01-Navigation, 02-Markdown Viewer (reuses `MarkdownPreview`)  
**Phase:** 22.3

---

## Goal

A side-by-side Markdown editor with live preview. The left pane is a raw text editor (textarea or code editor), and the right pane is a live-rendered preview using the `MarkdownPreview` component from Phase 22.2. Ported from VaultPad's editor mode.

---

## Feature Set

### Editor Pane (Left)

- **Monospace textarea** with comfortable line height (1.5+) and padding
- **Full-height** — fills the available vertical space
- **Tab support** — Tab key inserts spaces (or tab character), not focus-change
- **Keyboard shortcuts:**
  - `Ctrl+S` / `Cmd+S` — Save file
  - Standard text editing (undo, redo, select all)
- **Syntax awareness** — Optional future enhancement: line numbers, basic Markdown syntax coloring. Not required for MVP.
- **Auto-resize** — No scrollbar mismatch; editor and preview scroll independently

### Preview Pane (Right)

- Reuses `MarkdownPreview` component from Phase 22.2
- Updates on every keystroke (or debounced at ~100ms for large files)
- Includes `FrontmatterDisplay` for YAML frontmatter
- Scrolls independently from editor

### Save Workflow

- **Ctrl+S** or save button in header triggers save
- Save calls `PUT /api/vault/file` with `{ path, content }`
- **Save state indicator** in header button:
  - Idle: Save icon
  - Saving: Spinning animation
  - Saved: Green checkmark (auto-resets after 900ms)
  - Error: Red border
- **Dirty indicator** — Visual cue when content differs from last-saved version (dot on tab or modified indicator in header)
- **Unsaved changes protection** — `beforeunload` event warns user; also confirm when switching files via file browser

### File Loading

- Load from URL: `/editor?path=my-project/file.md`
- Fetches via `vaultApi.getFile(path)` (same as viewer)
- Populates both editor textarea and preview
- Stores `lastSavedContent` for dirty detection
- Empty state when no file is loaded

### Mode Toggle

- Eye icon switches to viewer: `/viewer?path=<currentPath>`
- On viewer page, pencil icon switches to editor: `/editor?path=<currentPath>`
- File path and content state persist through mode switch (via shared `docSlice`)

---

## Implementation Tasks

### 22.3.1 — Create `EditorPane` component
- `frontend/src/components/doc/EditorPane.tsx`
- Accepts: `content`, `onChange`, `readOnly`
- Renders a `<textarea>` with monospace font, dark background, full height
- Intercepts Tab key for indentation
- Intercepts Ctrl+S / Cmd+S for save (calls parent handler)
- Optional line numbers gutter (future enhancement — skip for MVP)

### 22.3.2 — Create `EditorLayout` component
- `frontend/src/components/doc/EditorLayout.tsx`
- Two-column CSS grid: `grid-template-columns: 1fr 1fr`
- Left: `EditorPane`
- Right: `MarkdownPreview` (from Phase 22.2)
- Vertical divider between panes (consistent with existing `DiffLayout` pattern)
- Responsive: below 980px, stack vertically (preview below editor)

### 22.3.3 — Create `EditorPage`
- `frontend/src/pages/EditorPage.tsx`
- Reads `?path=` from URL search params
- Loads file into `docSlice` store
- Manages local editing state (`editContent` separate from saved `docContent`)
- Handles save workflow: call `vaultApi.saveFile()`, update `lastSavedContent`, trigger save indicator
- Dirty detection: `editContent !== lastSavedContent`
- `beforeunload` handler when dirty
- Confirm dialog when file browser triggers navigation while dirty

### 22.3.4 — Add vault file save API
- Backend: Add `PUT /api/vault/file` endpoint to `src/routes/vault.ts`
  - Body: `{ path: string; content: string }`
  - Validates `ARTIFACT_BASE_PATH` configured
  - Path traversal guard (existing pattern)
  - Creates parent directories if needed (`mkdir -p`)
  - Writes file content
  - Returns `{ ok: true, path: string }`
- Backend service: Add `writeArtifactContent(relativePath, content)` to `VaultService`
- Frontend: Add `vaultApi.saveFile(path, content)` to API client

### 22.3.5 — Extend `docSlice` for editor state
```typescript
interface DocSlice {
  // ... existing from Phase 22.2
  docEditContent: string | null;      // Current editor content (may differ from saved)
  docLastSavedContent: string | null;  // Content at last save (for dirty detection)
  docIsDirty: boolean;                 // editContent !== lastSavedContent
  docSaveState: 'idle' | 'saving' | 'saved' | 'error';
  setDocEditContent: (content: string) => void;
  saveDocFile: () => Promise<void>;
}
```

### 22.3.6 — Add `EditorPage` to router
- Register `/editor` route in `App.tsx` (within `AppShell`)

### 22.3.7 — Wire save button in `Header`
- When on editor view, show save button in header
- Save button shows state (idle/saving/saved/error)
- Dirty indicator: small dot or asterisk on the Editor tab when unsaved

### 22.3.8 — Add download button
- Download current file as `.md` to local filesystem
- Same pattern as VaultPad: create Blob, trigger download link
- Button in header next to save button (editor view only)

---

## Styling

| Element | Style |
|---------|-------|
| Editor background | `bg-[#15232D]` (matches VaultPad `--surface-editor`) |
| Editor text | `text-gray-300 font-mono text-base` |
| Editor border | Right border: `border-r border-gray-700` |
| Preview background | `bg-[#1A3549]` (matches VaultPad `--surface-preview`) |
| Save button (idle) | Standard button styling |
| Save button (saving) | Spinning icon animation |
| Save button (saved) | Green check with glow |
| Dirty indicator | Small amber dot on Editor tab label |

---

## Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| ≥ 1024px | Side-by-side: editor left, preview right |
| < 1024px | Stacked: editor top, preview bottom (each 50% height) |
| < 768px | Tabbed: show editor OR preview with a toggle button |

---

## Notes

- VaultPad uses a plain `<textarea>`. For MVP, a `<textarea>` is sufficient. Future enhancement: use CodeMirror or Monaco for syntax highlighting, bracket matching, line numbers.
- The editor should debounce preview updates (100-150ms) to avoid janky rendering on fast typing in large files.
- Content from `docSlice.docContent` (server version) vs `docSlice.docEditContent` (local edits) — keep these separate so we can detect dirty state and enable "revert to saved" functionality.
