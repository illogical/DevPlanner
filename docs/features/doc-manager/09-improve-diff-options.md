# 09 — Improve Diff Viewer Comparison Options

**Status:** Planning
**Depends on:** 05-Git Integration, 06-Diff Viewer Enhancements (partial), 08-Initial Implementation Feedback
**Phase:** 22.9
**Date:** 2026-03-08

---

## Context

The diff viewer at `/diff` currently supports two loading modes:
- **Manual** — load files via drag-and-drop, paste, or URL params `?left=&right=`
- **Git ref** — load via `?gitPath=&leftRef=HEAD|staged&rightRef=working|staged` (added in Phase 22.8 fixes)

The problem: once in the diff viewer, there's no way to switch between comparison modes without going back to the editor and clicking a different button. The viewer has no awareness of the file's git status and no UI for switching between available comparisons.

This phase adds a **Git diff mode switcher** — a tab strip that appears whenever a file is loaded in git mode, shows only the comparisons that are meaningful for the current git state, and lets the user switch between them in place.

---

## All Possible Diff View Combinations

The following table lists every meaningful comparison, what it shows, when it's available, and which git states it applies to.

### Mode definitions

| Mode ID | Left pane | Right pane | What it shows | Git command equivalent |
|---|---|---|---|---|
| `head-working` | HEAD (last commit) | Working tree | All uncommitted changes (staged + unstaged) | `git diff HEAD -- <file>` |
| `head-staged` | HEAD (last commit) | Staged (index) | What will be included in the next commit | `git diff --cached -- <file>` |
| `staged-working` | Staged (index) | Working tree | What will NOT be committed yet (unstaged delta) | `git diff -- <file>` |

### Availability by git state

| Git State | `head-working` | `head-staged` | `staged-working` | Notes |
|---|---|---|---|---|
| `clean` | — | — | — | No differences exist; nothing to show |
| `untracked` | — | — | — | No HEAD or staged version exists |
| `modified` | ✅ | — | — | Nothing staged; staged == HEAD; working has changes |
| `staged` | ✅ | ✅ | — | Working tree matches staged; both show the same delta relative to HEAD |
| `modified-staged` | ✅ | ✅ | ✅ | All three are meaningful and distinct |
| `ignored` | — | — | — | Not in git |
| `outside-repo` | — | — | — | Not in git |
| `unknown` | — | — | — | Cannot determine state |

> **Note on `staged` state:** When nothing is left unstaged, `head-working` and `head-staged` return identical content (working tree == index). Both tabs are shown for discoverability, but they'll produce the same diff. A future UX improvement could label them "same" when identical.

> **Note on `modified` state:** `head-staged` would compare HEAD to HEAD (nothing staged), returning an empty diff — not useful. `staged-working` would compare HEAD to working (same as `head-working`) — redundant. Only `head-working` is shown.

### Default mode per state (when arriving from editor)

| Git State | Default mode |
|---|---|
| `modified` | `head-working` |
| `staged` | `head-staged` |
| `modified-staged` | `head-working` |
| `clean` / `untracked` / others | Manual mode |

---

## Implementation Plan

### 1. Fetch git status in `DiffViewerPage`

When `?gitPath=` is present in the URL, fetch the current git status of that file on mount (and on gitPath change). Store `gitFileState: GitState | null` in the component state.

```typescript
// In DiffViewerPage:
const [gitFileState, setGitFileState] = useState<GitState | null>(null);

useEffect(() => {
  const gitPath = searchParams.get('gitPath');
  if (!gitPath) return;
  gitApi.getStatus(gitPath).then((r) => setGitFileState(r.state)).catch(() => {});
}, [searchParams]);
```

This status drives which mode tabs are available.

---

### 2. Compute available modes from git state

Add a pure helper function (can live in `DiffViewerPage` or a `utils/gitDiffModes.ts`):

```typescript
type DiffModeId = 'head-working' | 'head-staged' | 'staged-working';

interface DiffMode {
  id: DiffModeId;
  label: string;
  leftRef: 'HEAD' | 'staged';
  rightRef: 'working' | 'staged';
  leftLabel: string;
  rightLabel: string;
  description: string;
}

const ALL_MODES: DiffMode[] = [
  {
    id: 'head-working',
    label: 'All changes',
    leftRef: 'HEAD',
    rightRef: 'working',
    leftLabel: 'Last commit (HEAD)',
    rightLabel: 'Working tree',
    description: 'All uncommitted changes — staged and unstaged combined',
  },
  {
    id: 'head-staged',
    label: 'Staged diff',
    leftRef: 'HEAD',
    rightRef: 'staged',
    leftLabel: 'Last commit (HEAD)',
    rightLabel: 'Staged (index)',
    description: 'Changes that will be included in the next commit',
  },
  {
    id: 'staged-working',
    label: 'Unstaged changes',
    leftRef: 'staged',
    rightRef: 'working',
    leftLabel: 'Staged (index)',
    rightLabel: 'Working tree',
    description: 'Changes that are NOT yet staged — will not be in the next commit',
  },
];

function getAvailableModes(state: GitState | null): DiffMode[] {
  if (!state) return [];
  if (state === 'modified') return [ALL_MODES[0]]; // head-working only
  if (state === 'staged') return [ALL_MODES[0], ALL_MODES[1]]; // head-working + head-staged
  if (state === 'modified-staged') return ALL_MODES; // all three
  return [];
}
```

---

### 3. New `DiffGitModeBar` component

**File:** `frontend/src/components/diff/DiffGitModeBar.tsx`

A tab strip that renders above the diff content (below the main toolbar). Only rendered when `availableModes.length > 0`.

```tsx
interface DiffGitModBarProps {
  modes: DiffMode[];
  activeId: DiffModeId;
  onSelect: (mode: DiffMode) => void;
  gitState: GitState;
}
```

Visual design:
- Horizontal tab strip with a subtle top border and `bg-gray-950` background
- Each tab shows `mode.label` text
- Active tab: `bg-gray-800 border-b-2 border-blue-500 text-white`
- Inactive tab: `text-gray-400 hover:text-gray-200`
- Show a `GitStatusDot` (small, no label) alongside the file name to the left of the tabs as context

---

### 4. Wire mode switching into `DiffViewerPage`

When user clicks a tab in `DiffGitModeBar`, update the URL search params to change `leftRef` and `rightRef`. The existing `useEffect` that listens to `searchParams` will re-fire and reload both panes automatically.

```typescript
const handleModeSelect = (mode: DiffMode) => {
  const gitPath = searchParams.get('gitPath');
  if (!gitPath) return;
  setSearchParams({
    gitPath,
    leftRef: mode.leftRef,
    rightRef: mode.rightRef,
  });
};
```

Derive the active mode ID from the current URL params:
```typescript
const activeModeId = (() => {
  const leftRef = searchParams.get('leftRef');
  const rightRef = searchParams.get('rightRef');
  return ALL_MODES.find((m) => m.leftRef === leftRef && m.rightRef === rightRef)?.id ?? null;
})();
```

---

### 5. Update pane labels from active mode

When in git mode, override `leftFilename` and `rightFilename` displayed in `DiffPaneHeader` with the mode's descriptive labels (`mode.leftLabel`, `mode.rightLabel`) rather than the raw `filename (staged)` strings currently generated.

Update the `refLabel` helper in `DiffViewerPage` to use the active mode's labels when a mode is active.

---

### 6. Handle edge cases

**Untracked files:** `getAvailableModes` returns `[]`. `DiffGitModeBar` is not rendered. The diff panes show an error from the API (`git show HEAD:...` fails for untracked files). Add a graceful error state: if loading fails because the file has no git history, show a pane placeholder: *"No previous version — this file has not been committed yet."*

**Clean files:** No modes available, but the user may still have arrived at `/diff?gitPath=...`. Show an informational banner: *"No changes — this file is clean (all changes committed)."* instead of blank panes.

**API error on `getFileAtRef`:** The backend `git show` will exit non-zero if the ref doesn't exist (e.g., `HEAD` for an untracked file, or `staged` when nothing is staged). Return a clear error in the pane rather than silently failing.

---

## File Changes

| File | Change |
|---|---|
| `frontend/src/components/diff/DiffGitModeBar.tsx` | **New** — tab strip for git comparison modes |
| `frontend/src/pages/DiffViewerPage.tsx` | Add git status fetch, `getAvailableModes()`, active mode derivation, `DiffGitModeBar` integration, pane label update |
| `frontend/src/api/client.ts` | Already has `gitApi.getStatus()` and `gitApi.show()` — no changes needed |

---

## URL Scheme

All git diff views use:
```
/diff?gitPath=<encoded-path>&leftRef=HEAD|staged&rightRef=working|staged
```

| Scenario | URL |
|---|---|
| All changes (HEAD → working) | `/diff?gitPath=path%2Ffile.md&leftRef=HEAD&rightRef=working` |
| Staged diff (HEAD → staged) | `/diff?gitPath=path%2Ffile.md&leftRef=HEAD&rightRef=staged` |
| Unstaged changes (staged → working) | `/diff?gitPath=path%2Ffile.md&leftRef=staged&rightRef=working` |

Manual mode (unchanged):
```
/diff?left=<path>&right=<path>
```

---

## Verification

1. Open a `modified` file → navigate to diff from Git Actions panel → `DiffGitModeBar` shows one tab "All changes" (active)
2. Open a `staged` file → `DiffGitModeBar` shows "All changes" and "Staged diff" tabs; default is "Staged diff"; click "All changes" → panes reload
3. Open a `modified-staged` file → all three tabs visible; click each → correct panes load per mode; amber state info visible
4. Open an `untracked` file → no mode bar; pane shows "No previous version" message
5. Open a `clean` file → no mode bar; informational "No changes" banner shown
6. URL reflects current `leftRef`/`rightRef` — refreshing page re-loads the same mode
