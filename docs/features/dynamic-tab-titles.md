# Dynamic Browser Tab Titles

## Goal

Update the browser tab title (`document.title`) to reflect the active context:

| Route / State | Tab title |
|---|---|
| Kanban board — project selected | `DevPlanner \| {PROJECT-NAME}` |
| Kanban board — no project selected | `DevPlanner` |
| Viewer page — file open | `DevPlanner \| {FILE-NAME}` |
| Editor page — file open | `DevPlanner \| {FILE-NAME}` |
| Diff Viewer page — file loaded | `DevPlanner \| {FILE-NAME}` |
| Diff Viewer page — no file | `DevPlanner` |

`{FILE-NAME}` is the bare filename (e.g. `2026-04-18_SPEC.md`) — no directory path.  
`{PROJECT-NAME}` is the human-readable project name (e.g. `Hex`), not the slug.

---

## Implementation

### 1. Shared hook — `useDocumentTitle`

Create `frontend/src/hooks/useDocumentTitle.ts`:

```ts
import { useEffect } from 'react';

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `DevPlanner | ${title}` : 'DevPlanner';
    return () => { document.title = 'DevPlanner'; };
  }, [title]);
}
```

- Sets the title on mount and whenever `title` changes.
- Resets to `"DevPlanner"` on unmount (guards against stale titles when navigating between routes).
- Null / undefined / empty string → falls back to `"DevPlanner"`.

---

### 2. Kanban board — `KanbanApp` in `frontend/src/App.tsx`

The active project name is resolved by looking up `activeProjectSlug` in the `projects` array.

```tsx
// In KanbanApp():
const { projects, activeProjectSlug, /* …existing destructure… */ } = useStore();

const activeProjectName = projects.find(p => p.slug === activeProjectSlug)?.name ?? null;
useDocumentTitle(activeProjectName);
```

`projects` is already loaded by `AppShell` / `useWebSocket` on startup, so `find()` resolves synchronously after the first render.

---

### 3. Viewer page — `frontend/src/pages/ViewerPage.tsx`

`filePath` (from search params) is available in the component. Extract just the filename:

```tsx
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// Inside ViewerPage():
const fileName = filePath ? filePath.split('/').pop() ?? null : null;
useDocumentTitle(fileName);
```

---

### 4. Editor page — `frontend/src/pages/EditorPage.tsx`

Same pattern as ViewerPage — `filePath` is already read from search params at the top of the component:

```tsx
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// Inside EditorPage():
const fileName = filePath ? filePath.split('/').pop() ?? null : null;
useDocumentTitle(fileName);
```

---

### 5. Diff Viewer page — `frontend/src/pages/DiffViewerPage.tsx`

The diff viewer has two panes. The relevant title is the **base filename** being compared — derived from either the `gitPath` param (git mode) or the right pane's filename (manual mode). Prefer `gitPath` since it's the canonical file being diffed.

```tsx
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// Inside DiffViewerPage():
const gitPath = searchParams.get('gitPath');
const manualFile = state.rightFilename || state.leftFilename;
const baseFile = gitPath ?? manualFile;
const diffFileName = baseFile ? baseFile.split('/').pop() ?? null : null;
useDocumentTitle(diffFileName);
```

`state.rightFilename` and `state.leftFilename` are already part of local component state — no new state needed. The `useMemo` / re-render cycle that updates those values will automatically trigger a title update through the hook.

---

## Files to change

| File | Change |
|---|---|
| `frontend/src/hooks/useDocumentTitle.ts` | **Create** — new shared hook |
| `frontend/src/App.tsx` | Add `useDocumentTitle` call in `KanbanApp` |
| `frontend/src/pages/ViewerPage.tsx` | Add `useDocumentTitle` call |
| `frontend/src/pages/EditorPage.tsx` | Add `useDocumentTitle` call |
| `frontend/src/pages/DiffViewerPage.tsx` | Add `useDocumentTitle` call |
| `frontend/index.html` | Verify base `<title>DevPlanner</title>` is set (no change needed if already correct) |

---

## Acceptance criteria

- [ ] Selecting a project on the Kanban board updates the tab to `DevPlanner | {project name}`.
- [ ] Deselecting / no project → tab reads `DevPlanner`.
- [ ] Opening a file in the Viewer tab → tab reads `DevPlanner | {filename}` (no path segments).
- [ ] Opening a file in the Editor tab → same as Viewer.
- [ ] Opening a file in the Diff Viewer (git mode or manual) → tab reads `DevPlanner | {filename}`.
- [ ] Diff Viewer with no file loaded → tab reads `DevPlanner`.
- [ ] Navigating between routes resets to the correct context title for each route (no stale titles).
- [ ] Titles are visible and distinct when multiple DevPlanner tabs are open in the same browser.

---

## Out of scope

- The HTML `<title>` in `index.html` is the static fallback; it does not need to be changed.
- No backend changes required — all data needed (project name, file path) is already in the frontend store or URL params.
- No SPECIFICATION.md update required — this is a pure UI/UX enhancement with no API surface changes.
