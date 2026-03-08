# Doc Manager — Initial Implementation Feedback & Bug Fixes

**Status:** Post-implementation fixes
**Phase:** 22 (follow-up)
**Date:** 2026-03-08

---

## Context

Phase 22 (Doc Manager) was implemented successfully across phases 22.1–22.5. This document captures the frontend UX bugs identified during first use, their root causes, and the applied fixes.

---

## Bugs Fixed

### Bug 1 — View tab after Projects loses file

**Symptom**: Open a file in the View tab, switch to Projects tab, switch back to View — shows "No file open" instead of the last-viewed file.

**Root cause**: `AppNavBar.getTabTo()` reads `?path=` from `location.search`. When on the Projects tab (`/`), the URL has no `?path=`, so the View tab link becomes `/viewer` without a path. `ViewerPage` shows `DocEmptyState` because `filePath` is `null`.

**Fix**: Fall back to `docFilePath` from the Zustand store when `location.search` has no path.

```typescript
// AppNavBar.tsx
const { ..., docFilePath } = useStore();

const getTabTo = (to: string) => {
  const currentPath = new URLSearchParams(location.search).get('path') || docFilePath;
  if (currentPath && (to === '/viewer' || to === '/editor')) {
    return `${to}?path=${encodeURIComponent(currentPath)}`;
  }
  return to;
};
```

---

### Bug 2 — Back/Forward buttons update header but not page content

**Symptom**: Clicking back/forward changes the filename shown in the header but the page still shows old content or "No file open".

**Root cause**: `goBack()`/`goForward()` update Zustand store state (`docFilePath`, `docContent`) but do NOT update the browser URL (`?path=`). When `ViewerPage`'s `useEffect` fires, it reads `filePath` from the (unchanged) URL and finds `filePath !== docFilePath`, triggering `navigateToFile(filePath, 'push')` with the OLD path — overwriting the back/forward navigation.

**Fix**: Replace `onClick={goBack}` / `onClick={goForward}` with handlers that also update the URL via `navigate()`. Because `loadDocFile()` sets `docFilePath` synchronously via Zustand, by the time `ViewerPage`'s useEffect runs, `docFilePath` already equals the new path — so `filePath !== docFilePath` is false and no re-load is triggered.

```typescript
// AppNavBar.tsx
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

const navigate = useNavigate();

const handleGoBack = () => {
  const prev = docBackHistory[docBackHistory.length - 1];
  if (!prev) return;
  goBack();
  navigate(`${location.pathname}?path=${encodeURIComponent(prev)}`);
};

const handleGoForward = () => {
  const next = docForwardHistory[0];
  if (!next) return;
  goForward();
  navigate(`${location.pathname}?path=${encodeURIComponent(next)}`);
};
```

---

### Bug 3 — No scrolling in Viewer or Editor

**Symptom**: Content in the Viewer and Editor does not scroll. No scrollbar appears. In the Editor, left and right panes do not scroll independently.

**Root cause**: `AppShell`'s content wrapper `<div className="flex-1 overflow-hidden">` is not a flex container. Without `flex`/`flex-col`, the `flex-1` on `ViewerPage`/`EditorPage` root divs has no effect — children have no bounded height, so `overflow-y-auto` never activates.

**Fix**: Add `flex flex-col` to `AppShell`'s content wrapper.

```tsx
// AppShell.tsx
<div className="flex-1 flex flex-col overflow-hidden">
  {children}
</div>
```

With bounded height, `MarkdownPreview` (`overflow-y-auto flex-1`) and `EditorPane` (textarea with `overflow-y-auto`) scroll correctly. The two editor panes scroll independently because they are separate grid cells with `overflow-y-auto`.

---

### Bug 3b — DocEmptyState: full-height background

**Symptom**: When no file is open, the empty state doesn't fill the full available area with the correct background color.

**Fix**: Change the background from a gradient to solid `#162D42` (matches the doc manager theme). The `flex-1` already on `DocEmptyState` correctly fills height once the AppShell fix is in place.

```tsx
// DocEmptyState.tsx
<div
  className="flex-1 flex flex-col items-center justify-center gap-5 select-none"
  style={{ background: '#162D42' }}
>
```

---

### Bug 4 — No "Open in Viewer" button on card vault links

**Symptom**: Hovering over a vault artifact link on a card shows "Open in Diff Viewer" but no way to open the file in the Viewer tab.

**Fix**: Add an "Open in Viewer" button (eye icon) adjacent to the existing Diff Viewer button. Uses the same relative path extraction as `buildDiffUrl` to navigate to `/viewer?path=...`.

```typescript
// CardLinks.tsx
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

const buildViewerUrl = (vaultLinkUrl: string, baseUrl: string): string => {
  const linkUrlObj = new URL(vaultLinkUrl);
  const baseUrlObj = new URL(baseUrl);
  const fullPath = decodeURIComponent(linkUrlObj.searchParams.get('path') ?? '');
  const basePath = decodeURIComponent(baseUrlObj.searchParams.get('path') ?? '');
  const relativePath = fullPath.startsWith(basePath + '/') ? fullPath.slice(basePath.length + 1) : fullPath;
  return `/viewer?path=${encodeURIComponent(relativePath)}`;
};
```

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/components/layout/AppNavBar.tsx` | `docFilePath` fallback in `getTabTo`; `useNavigate`; back/forward handlers that sync the URL |
| `frontend/src/components/layout/AppShell.tsx` | `flex flex-col` added to content wrapper div |
| `frontend/src/components/doc/DocEmptyState.tsx` | Solid `#162D42` background instead of gradient |
| `frontend/src/components/card-detail/CardLinks.tsx` | `useNavigate`, `buildViewerUrl` helper, "Open in Viewer" eye button |

---

## Verification Checklist

1. **View tab after Projects**: Open a file in View, switch to Projects, switch back to View → same file loads.
2. **Back/Forward**: Open file A, open file B, click Back → file A content loads and URL updates to `?path=A`.
3. **Scrolling (Viewer)**: Open a long markdown file → scrollbar appears, content scrolls.
4. **Scrolling (Editor)**: Open a long file in Editor → left pane (textarea) and right pane (preview) scroll independently.
5. **Empty state**: Navigate to `/viewer` with no file → centered content with solid `#162D42` background fills full height.
6. **Open in Viewer button**: Hover a vault artifact link on a card → eye button appears; click → navigates to `/viewer?path=...` and loads the file.

---

## Future Improvements (Planned)

Based on recent UX feedback, the following UI improvements are planned for the next iteration:

1. **Projects Tab & Sidebar Integration**:
   - Move the sidebar collapse toggle icon into the Projects tab.
   - Clicking the Projects tab toggles the sidebar open/closed.
   - Display the selected Project title in the header ("DevPlanner | [PROJECT NAME]").
   - Rename the "PROJECTS" section title to "BOARDS" in the sidebar.

2. **Top Bar Enhancements**:
   - Remove the filename, git status indicator, and git settings gear from the top bar to free up space.
   - Combine "View" and "Edit" tabs into a single toggle button that remembers the last used mode (persisted via `localStorage`).

3. **Persistent File Browser Bottom Bar**:
   - Add a persistent bottom bar containing file breadcrumbs, replacing the header folder icon.
   - Move the filename display to the end of these breadcrumbs, preceded by the git status indicator. Clicking the filename will open the file in the last active mode (viewer or editor).
   - Clicking folder breadcrumbs opens the File Browser to that directory.
   - Clicking the open area in the bottom bar or the File Browser top empty area toggles the drawer.
   - Move the Git Settings gear icon to the file browser's top bar, near the close button.
   - Opening a file will no longer auto-close the File Browser; the user must manually close it.
   - Ensure full sub-directory navigation support.
