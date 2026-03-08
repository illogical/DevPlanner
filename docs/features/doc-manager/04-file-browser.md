# 04 — File Browser

**Status:** Planning  
**Depends on:** 01-Navigation  
**Phase:** 22.4

---

## Goal

A slide-out file browser panel that lets users navigate the vault directory tree and open files in the viewer, editor, or diff views. Ported from VaultPad's 3-column file selector drawer, rebuilt as a React component with Zustand state management.

The file browser is **shared across all document views** (viewer, editor, diff) and optionally accessible from Kanban (for quick vault file access from card links).

---

## Feature Set

### Drawer Panel

- **Bottom slide-out** — Drawer slides up from the bottom edge of the viewport
- **Toggle** — Button in the nav bar or footer area; keyboard shortcut (e.g., `Ctrl+B`)
- **Height** — Animated from 0 (collapsed) to ~34vh (expanded)
- **Visual** — Top border accent when open (amber or accent color)
- **Dismiss** — Click outside, press Escape, or click close button

### 3-Column Layout

#### Column 1: Root Folders
- Display configured root folders from the vault directory
- Unlike VaultPad's hardcoded roots, derive roots dynamically from the top-level directories under `ARTIFACT_BASE_PATH`
- Each root shows its name; click to select and populate column 2
- Active root highlighted

#### Column 2: Subfolders
- Shows subfolders within the selected root
- Breadcrumb label showing current path (sticky header)
- "Up" link (`.` or `..`) to navigate to parent
- File count per subfolder
- Active subfolder highlighted
- Click a subfolder to drill down (update breadcrumb + populate column 3)

#### Column 3: Files
- All `.md` files in the selected folder
- Sorted by modification time (newest first)
- **Smart filename display** — Parse timestamped filenames like `2026-01-15_14-30-00-feature-name.md` and show "feature name" with formatted timestamp, not the raw filename
- **Currently open file** — Orange border + darker background
- **Git status dot** — Colored indicator per file (Phase 22.5)
- Click a file to open it in the current view (viewer/editor)

### Navigation Features

- **Refresh button** — Reload tree from server
- **Focus button** — Scroll to / highlight the folder containing the currently open file
- **Close button** — Collapse the drawer
- **Breadcrumb bar** — Click segments to jump to any ancestor folder in the path
- **Path truncation** — Long paths show `…` with ellipsis; full path on hover tooltip

### Keyboard Navigation

- Arrow keys to move between items in each column
- Enter to select folder / open file
- Escape to close drawer
- Tab to move between columns

---

## Implementation Tasks

### 22.4.1 — Create vault tree API endpoint
- Backend: `GET /api/vault/tree` in `src/routes/vault.ts`
  - Scans `ARTIFACT_BASE_PATH` recursively
  - Returns `{ folders: TreeFolder[], errors: TreeError[] }`
  - `TreeFolder`: `{ name, path, parentPath, count, files: TreeFile[] }`
  - `TreeFile`: `{ name, path, updatedAt }`
  - Only includes `.md` files
  - Sorted: folders alphabetically, files by `updatedAt` descending
  - Path traversal guard (all paths relative to `ARTIFACT_BASE_PATH`)
- Backend service: Add `listTree()` to `VaultService`
- Frontend API: Add `vaultApi.getTree()` to API client

### 22.4.2 — Create `fileBrowserSlice` in Zustand store
```typescript
interface FileBrowserSlice {
  fbIsOpen: boolean;
  fbFolders: TreeFolder[];
  fbActiveRoot: string | null;
  fbActivePath: string;        // Current folder path
  fbIsLoading: boolean;
  fbError: string | null;
  toggleFileBrowser: () => void;
  openFileBrowser: () => void;
  closeFileBrowser: () => void;
  loadFileTree: () => Promise<void>;
  setFbActiveRoot: (root: string) => void;
  setFbActivePath: (path: string) => void;
  focusCurrentFile: () => void;  // Navigate to folder of currently open file
}
```

### 22.4.3 — Create `FileBrowserDrawer` component
- `frontend/src/components/doc/FileBrowserDrawer.tsx`
- Animated slide-up panel (Framer Motion, consistent with `CardDetailPanel` animation style)
- Renders `FileBrowserColumns` inside
- Close on Escape, click-outside
- Top border accent when open

### 22.4.4 — Create `FileBrowserColumns` component
- `frontend/src/components/doc/FileBrowserColumns.tsx`
- 3-column CSS grid layout
- Wires column interactions (root click → subfolder load → file list)
- Breadcrumb bar at top

### 22.4.5 — Create `FolderColumn` component
- `frontend/src/components/doc/FolderColumn.tsx`
- Renders list of folders with click handler
- Active folder highlight
- File count badge

### 22.4.6 — Create `FileColumn` component
- `frontend/src/components/doc/FileColumn.tsx`
- Renders list of files with smart name display
- Modification time display
- Git status dot (wired in Phase 22.5)
- Currently-open-file highlight
- Click handler navigates to file in current view

### 22.4.7 — Create `FileBreadcrumb` component
- `frontend/src/components/doc/FileBreadcrumb.tsx`
- Clickable path segments
- Truncation for long paths
- Separator characters between segments

### 22.4.8 — Create filename parser utility
- `frontend/src/utils/filename.ts`
- `parseVaultFilename(name: string): { title: string; stamp: string | null }`
- Parses `2026-01-15_14-30-00-feature-name.md` → `{ title: "feature name", stamp: "2026-01-15 14:30" }`
- Falls back to raw filename for non-matching patterns

### 22.4.9 — Integrate drawer into `AppShell`
- Render `FileBrowserDrawer` in the `AppShell` layout (below routes)
- Toggle button in `AppNavBar` (or floating button at bottom)
- Make available on viewer, editor, and diff pages

### 22.4.10 — Add file navigation behavior
- Clicking a file in the browser:
  - If on `/viewer` → navigates to `/viewer?path=<file>`
  - If on `/editor` → navigates to `/editor?path=<file>` (with dirty check)
  - If on `/diff` → loads file into left diff pane
  - If on `/` (Kanban) → navigates to `/viewer?path=<file>`
- After navigation, optionally close the drawer (configurable)

### 22.4.11 — Add back/forward navigation history
- Track file navigation history in `docSlice`:
  ```typescript
  docBackHistory: string[];
  docForwardHistory: string[];
  navigateToFile: (path: string, mode?: 'push' | 'back' | 'forward') => void;
  goBack: () => void;
  goForward: () => void;
  ```
- Back/Forward buttons in header (same position as VaultPad)
- Only visible on doc views (viewer/editor)

---

## Styling

| Element | Style |
|---------|-------|
| Drawer background | `bg-gray-900` |
| Drawer top border | `border-t-2 border-amber-500` (when open) |
| Root folder item | `px-3 py-2 hover:bg-gray-800 cursor-pointer` |
| Active folder | `bg-gray-800 border-l-2 border-blue-500` |
| File item | `px-3 py-1.5 hover:bg-gray-800 cursor-pointer` |
| Current file | `border border-amber-500/50 bg-amber-950/20` |
| Git status dot | Small colored circle (6px) — colors in Phase 22.5 |
| File timestamp | `text-xs text-gray-500` |
| Breadcrumb | `text-sm text-gray-400`, separator: `text-gray-600` |
| Column dividers | `border-r border-gray-700` between columns |

### Drawer Animation
```
Collapsed: height 0, opacity 0
Expanded: height 34vh, opacity 1
Transition: spring physics (consistent with CardDetailPanel)
```

---

## Future Enhancements (Not in MVP)

- **Search/filter** within the file browser (fuzzy match on filenames)
- **Context menu** on right-click (open in viewer, open in editor, open in diff, copy path)
- **File creation** — New file button in the browser (creates empty `.md`)
- **Drag files** from browser to diff panes
- **Pinned/favorite files** — Star files for quick access
- **Recent files** — Section showing recently opened files

---

## Notes

- VaultPad has hardcoded root folders (`00-Inbox`, `05-Daily`, etc.). DevPlanner should discover roots dynamically from `ARTIFACT_BASE_PATH` since vault structures vary.
- The tree endpoint should handle large vaults gracefully — consider pagination or lazy loading for directories with 100+ files. For MVP, load the full tree and handle any performance issues later.
- The drawer shares vertical space with the main content. When open, the content area shrinks. The existing Kanban board should not be affected by the drawer (drawer only visible on doc views, or overlays on Kanban).
