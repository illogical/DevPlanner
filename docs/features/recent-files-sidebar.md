# Recent Files Sidebar — Implementation Plan

## Overview

Add a persistent right sidebar to the Review tab (Viewer and Editor pages) showing the 10 most recently modified vault files, sorted by filesystem `mtime`. Each entry is clickable and navigates to the file. The browser back/forward buttons navigate between previously viewed files.

## Goals

- Show the 10 vault-wide most recently modified `.md` files sorted by `mtime` descending
- Sidebar is persistent (not a drawer), displayed to the right of the main content area on `/viewer` and `/editor` only
- File name is clickable — clicking opens the file in the current mode (viewer or editor)
- Browser back/forward navigate between files (survives page refresh)
- Sidebar open/closed state is persisted across refreshes
- Recent list updates automatically after a file is saved in the editor UI

## What Does NOT Need to Change

- **Backend**: `GET /api/vault/tree` already returns `updatedAt` (filesystem `mtime` as ISO string) on every `TreeFile` node. No backend changes needed.
- **Back button behavior**: React Router's `navigate()` is already used by the file browser (pushes to history). The URL `?path=` scheme means the browser's native history stack handles back/forward automatically. The existing `useEffect` in `ViewerPage` detects URL changes and loads the correct file. No changes needed to this mechanism — the new sidebar just needs to use the same `navigate()` approach.

---

## Data Model

### Where recent files come from

The Zustand store already holds `fbFolders: TreeFolder[]` which is the full flat list of all folders loaded from `GET /api/vault/tree`. Each folder contains `files: TreeFile[]`, and each file has:

```typescript
interface TreeFile {
  name: string;      // e.g. "my-spec.md"
  path: string;      // relative path from vault root, e.g. "10-Projects/hex/my-card/my-spec.md"
  updatedAt: string; // ISO 8601 mtime from filesystem
}
```

The 10 most recent files are derived at render time (no new store state needed for the list itself):

```typescript
const recentFiles = useMemo(() => {
  const allFiles = fbFolders.flatMap((f) => f.files);
  return allFiles
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);
}, [fbFolders]);
```

---

## New State (FileBrowserSlice)

Add two fields to `FileBrowserSlice` in `frontend/src/store/slices/fileBrowserSlice.ts`:

```typescript
recentFilesOpen: boolean;       // default: true
toggleRecentFiles: () => void;
```

Update the matching interface in `frontend/src/store/types.ts` under the `FileBrowserSlice` section.

**Persistence**: The store uses Zustand's `persist` middleware. Add `recentFilesOpen` to the persisted keys so the sidebar state survives page refresh. Follow the same pattern used for other persisted UI flags (e.g. `isSidebarOpen`, `lastDocMode`). Check `frontend/src/store/index.ts` for the existing `partialize` configuration and add `recentFilesOpen` there.

---

## New Component: `RecentFilesSidebar`

**File**: `frontend/src/components/doc/RecentFilesSidebar.tsx`

### Layout

```
┌────────────────────────────────┐
│ Recent Files              [×]  │  ← header; [×] closes sidebar
├────────────────────────────────┤
│ my-spec.md                     │  ← file name, truncated, clickable
│ 10-Projects/hex/my-card  2h    │  ← folder path (truncated) + relative time
├────────────────────────────────┤
│ another-file.md                │
│ 10-Projects/archive      1d    │
├────────────────────────────────┤
│  (up to 10 entries)            │
└────────────────────────────────┘
```

Width: `w-60` (240px). Fixed, not resizable for now.

### Navigation behavior

When the user clicks a file entry:

```typescript
const navigate = useNavigate();
const location = useLocation();

function openFile(filePath: string) {
  if (filePath === docFilePath) return;   // already open — no-op
  const mode = location.pathname.startsWith('/editor') ? 'editor' : 'viewer';
  navigate(`/${mode}?path=${encodeURIComponent(filePath)}`);
}
```

Using React Router's `navigate()` (no `{ replace: true }`) pushes a new browser history entry so the back button returns to the previously viewed file.

### Relative time formatting

Implement a small utility `formatRelativeTime(isoString: string): string` in the component file (no external library needed):

| Age | Display |
|-----|---------|
| < 1 min | `just now` |
| < 60 min | `Xm` |
| < 24 h | `Xh` |
| < 7 days | `Xd` |
| ≥ 7 days | `MMM D` (e.g. `Apr 12`) |

### Empty state

If `fbFolders` is empty (tree not yet loaded or vault not configured), show a single muted line: `"No files yet"`.

### Styling

Follow the existing dark-mode palette:
- Container: `bg-gray-900 border-l border-gray-700`
- Header: `text-xs font-semibold text-gray-400 uppercase tracking-wide`
- Each row: `hover:bg-gray-800 cursor-pointer px-3 py-2`
- File name: `text-sm text-gray-200 truncate`
- Path + time: `text-xs text-gray-500 truncate`
- Active (currently open) file row: `bg-gray-800 text-blue-400` for the filename

---

## Layout Change: `AppShell.tsx`

The sidebar lives to the right of the main content area, only on doc pages (not kanban, not diff).

**Current** (`frontend/src/components/layout/AppShell.tsx`):

```tsx
<div className="flex-1 flex flex-col overflow-hidden">
  {children}
</div>
```

**New**:

```tsx
const isDocPage =
  location.pathname.startsWith('/viewer') ||
  location.pathname.startsWith('/editor');

// ...

<div className="flex-1 flex overflow-hidden">
  <div className="flex flex-col flex-1 overflow-hidden min-w-0">
    {children}
  </div>
  {isDocPage && recentFilesOpen && <RecentFilesSidebar />}
</div>
```

Import `recentFilesOpen` and `toggleRecentFiles` from `useStore()`. Import `RecentFilesSidebar` from `../doc/RecentFilesSidebar`.

> **Note**: `min-w-0` on the children wrapper is required to prevent the flex child from overflowing when the sidebar is open alongside content that might want to grow unbounded.

---

## Toggle Button: `AppNavBar.tsx`

Add a "Recent Files" toggle icon button in the spacer area (right side of the nav bar) when on doc pages:

```tsx
{isDocView && !location.pathname.startsWith('/diff') && (
  <button
    onClick={toggleRecentFiles}
    title={recentFilesOpen ? 'Hide recent files' : 'Show recent files'}
    className={cn(
      'flex items-center gap-1.5 px-3 py-2 text-sm rounded transition-colors',
      recentFilesOpen
        ? 'text-blue-400 bg-blue-900/20'
        : 'text-gray-400 hover:text-gray-200'
    )}
  >
    <ClockIcon className="w-4 h-4" />
    <span className="text-xs">Recent</span>
  </button>
)}
```

Use a clock/history SVG icon (inline, no external icon library). Place it in the `/* Spacer */` div (right side of `<nav>`).

Import `recentFilesOpen` and `toggleRecentFiles` from `useStore()`.

---

## Tree Refresh After Save: `docSlice.ts`

After a successful `PUT /api/vault/file` in `saveDocFile`, call `get().loadFileTree()` to refresh the tree data (which updates `fbFolders` and thus the derived recent files list):

```typescript
// In saveDocFile, after successful API call:
set({ docLastSavedContent: contentToSave, docIsDirty: false });
get().loadFileTree();  // refresh mtime-based recent list
```

This ensures the saved file bubbles up to the top of the recent list immediately.

---

## Files to Create

| File | Action |
|------|--------|
| `frontend/src/components/doc/RecentFilesSidebar.tsx` | **Create** — new component |

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/store/slices/fileBrowserSlice.ts` | Add `recentFilesOpen: true` state and `toggleRecentFiles` action |
| `frontend/src/store/types.ts` | Add `recentFilesOpen: boolean` and `toggleRecentFiles: () => void` to `FileBrowserSlice` interface |
| `frontend/src/store/index.ts` | Add `recentFilesOpen` to the `partialize` list for persistence |
| `frontend/src/components/layout/AppShell.tsx` | Wrap `{children}` in a flex row, add `<RecentFilesSidebar />` to the right on doc pages |
| `frontend/src/components/layout/AppNavBar.tsx` | Add toggle button on right side when `isDocView && !isDiff` |
| `frontend/src/store/slices/docSlice.ts` | Call `get().loadFileTree()` after successful save |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Clicking the currently open file | No-op — check `filePath === docFilePath` before calling `navigate()` |
| Vault not configured (no `ARTIFACT_BASE_PATH`) | `fbFolders` will be empty; sidebar shows "No files yet" |
| File tree still loading | Show a subtle loading shimmer or just the empty state until `fbFolders` populates |
| Very long file names | Truncate with `truncate` (CSS `text-overflow: ellipsis`); full path visible on hover via `title` attribute |
| Sidebar closed | `recentFilesOpen: false` — sidebar not rendered; toggle button in nav turns it back on |
| Navigating to same file that's already open | `if (filePath === docFilePath) return` guard prevents duplicate history push |
| File deleted externally | Tree refresh (on next save or page load) removes it from the list naturally |
| More than 10 files | Only top 10 by mtime shown — no pagination needed |

---

## Out of Scope

- Sorting options (always mtime desc)
- Pinned/starred files
- Per-project filtering (vault-wide as requested)
- Showing non-markdown files (tree only includes `.md`)
- Real-time file watch updates to the recent list (only refreshes on save or page load)
