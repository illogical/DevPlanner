# 01 — App Navigation

**Status:** Planning  
**Depends on:** Nothing (unblocks all Doc Manager features)  
**Phase:** 22.1

---

## Goal

Add a top-level navigation bar that allows users to switch between DevPlanner's views: **Kanban** (default), **Viewer**, **Editor**, and **Diff**. The current Diff Viewer page already exists at `/diff` but is isolated — it has its own `DiffHeader` with a "Back to DevPlanner" link rather than shared navigation.

---

## Design

### Navigation Bar Component

Create an `AppNavBar` component that renders below the existing `Header` (or replaces the minimal `DiffHeader` on the diff page). The nav bar is **shared across all views** and provides:

| Element | Behavior |
|---------|----------|
| **Kanban** tab | Navigates to `/` — the default Kanban board |
| **Viewer** tab | Navigates to `/viewer` — Markdown viewer (read-only) |
| **Editor** tab | Navigates to `/editor` — side-by-side Markdown editor + preview |
| **Diff** tab | Navigates to `/diff` — the existing diff viewer |

Active tab is highlighted. Tabs use React Router `NavLink` with `isActive` styling.

### Layout Changes

Currently DevPlanner has two route-level layouts:
1. `/` → `KanbanApp` inside `MainLayout` (with header, sidebar, kanban board)
2. `/diff` → `DiffViewerPage` standalone (its own `DiffHeader`)

The new architecture introduces a shared shell:

```
<AppShell>                        ← New: wraps all routes
  <Header />                      ← Existing (slightly modified)
  <AppNavBar />                   ← New: tab navigation
  <Routes>
    <Route path="/" element={<KanbanApp />} />
    <Route path="/viewer" element={<ViewerPage />} />
    <Route path="/editor" element={<EditorPage />} />
    <Route path="/diff" element={<DiffViewerPage />} />
  </Routes>
  <FileBrowserDrawer />           ← New: shared across viewer/editor/diff (Phase 22.4)
</AppShell>
```

### Header Modifications

- The existing `Header` stays largely the same. Project selector, search palette trigger, and connection indicator remain.
- On non-Kanban views, the project sidebar toggle may be hidden (not useful outside Kanban).
- The `DiffHeader` component becomes unnecessary and is removed. Its "Back to DevPlanner" link is replaced by the Kanban tab in `AppNavBar`.

### Conditional UI

Some header features only apply to certain views:

| Feature | Kanban | Viewer | Editor | Diff |
|---------|--------|--------|--------|------|
| Project selector | Yes | No | No | No |
| Search palette (Ctrl+K) | Yes | Future | Future | No |
| Connection indicator | Yes | Yes | Yes | Yes |
| Activity sidebar toggle | Yes | No | No | No |
| Sidebar toggle | Yes | No | No | No |
| File path display | No | Yes | Yes | Yes |
| Git status dot | No | Yes | Yes | Yes |
| Save button | No | No | Yes | No |

This can be achieved by passing the current route (or a `view` prop) to `Header` and conditionally rendering sections.

### URL Parameter Preservation

When switching between Viewer and Editor, the current file path should persist:
- `/viewer?path=my-project/my-file.md` → click Editor tab → `/editor?path=my-project/my-file.md`
- `/editor?path=my-project/my-file.md` → click Viewer tab → `/viewer?path=my-project/my-file.md`

The Diff view preserves its own `?left=` / `?right=` params.

When navigating to Viewer/Editor without a file loaded, show an empty state prompting the user to open a file via the file browser.

---

## Implementation Tasks

### 22.1.1 — Create `AppNavBar` component
- `frontend/src/components/layout/AppNavBar.tsx`
- Horizontal tab bar with Kanban | Viewer | Editor | Diff
- Uses `NavLink` from react-router-dom for active styling
- Tailwind styling: dark background, border-bottom, active tab has accent underline
- Preserves `?path=` when switching between viewer/editor

### 22.1.2 — Create `AppShell` layout component
- `frontend/src/components/layout/AppShell.tsx`
- Wraps `Header` + `AppNavBar` + route content + file browser drawer slot
- CSS grid: `grid-template-rows: auto auto 1fr auto` (header, nav, content, drawer)

### 22.1.3 — Refactor `App.tsx` routing
- Replace the current two-route setup with the `AppShell` wrapper
- Add `/viewer` and `/editor` routes (initially render placeholder pages)
- Remove the standalone `DiffHeader` from `DiffViewerPage` (nav bar replaces it)

### 22.1.4 — Modify `Header` for multi-view support
- Accept a `view` prop or read from route
- Conditionally render project selector, sidebar toggles, search
- Add file path display + git status dot for doc views (populated by store in later phases)
- Add save button for editor view (wired in Phase 22.3)

### 22.1.5 — Remove `DiffHeader` component
- Delete `frontend/src/components/diff/DiffHeader.tsx`
- Update `DiffViewerPage` to no longer render `DiffHeader`

### 22.1.6 — Add route-aware `useWebSocket` behavior
- WebSocket connection should stay alive across all views
- Project subscription only active on Kanban view (other views don't need card events)
- Connection indicator shows on all views

---

## Styling Notes

- Nav bar background: `bg-gray-900` with `border-b border-gray-700`
- Active tab: Bottom border accent (`border-b-2 border-blue-500`), brighter text
- Inactive tab: `text-gray-400 hover:text-gray-200`
- Tab spacing: `gap-1 px-4 py-2`, compact to minimize vertical space
- The nav bar should feel lightweight — it's secondary to the header, not a full toolbar
