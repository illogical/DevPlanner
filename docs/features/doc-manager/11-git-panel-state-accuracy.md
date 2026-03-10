# 11 — Git Panel State Accuracy

**Status:** In Progress
**Phase:** 22.11
**Date:** 2026-03-09
**Depends on:** 10-Verify Git Workflow

---

## Problem Summary

The Git Actions panel renders stale git state. The root cause: `gitCurrentState` in the
Zustand store is only updated on editor save, file load, and a configurable poll interval
(default 30 s). Opening the panel does not wait for the refresh to complete before rendering,
so the user sees whatever state was last written to the store.

This is especially visible on the **diff viewer page** (`/diff`), where:
- The diff viewer fetches git status into local component state (`gitFileState`) — correctly
- The Zustand store `gitCurrentState` was last set on the editor page — potentially stale
- The panel reads from the store, not from the diff viewer's local state

### Observed symptom (screenshots)

| Pane | Shows |
|------|-------|
| "Staged diff" (HEAD → staged) | Identical content both sides — **no diff** |
| "All changes" (HEAD → working) | Last line differs — **real working-tree changes** |
| Status dot | Blue "Staged" |
| Panel | Unstage + "View staged diff" + Commit — **no Stage button** |

**Root cause trace:**
- If staged = HEAD and working ≠ HEAD → `git status --porcelain` returns ` M` → state = `modified`
- But the store holds `staged` from a previous operation
- `canStage` excludes `staged`, so no Stage button appears
- The user has real changes but cannot stage them and has no visual warning

---

## Fixes Applied (Phase 22.11)

### Fix 1 — Block panel content until refresh resolves

`GitCommitPanel` now holds a local `refreshed` boolean. On mount it calls
`refreshGitStatus(docFilePath)` and sets `refreshed = true` only when the promise resolves.
Until then the panel shows "Checking status…" instead of stale state.

```tsx
const [refreshed, setRefreshed] = useState(false);

useEffect(() => {
  if (!docFilePath) { setRefreshed(true); return; }
  refreshGitStatus(docFilePath).then(() => setRefreshed(true));
}, []);

// In render:
const state = refreshed ? (gitCurrentState as GitState | null) : null;

{!refreshed ? (
  <p className="text-sm text-gray-500">Checking status…</p>
) : state === 'clean' ? (
  ...
) : ( ... )}
```

**File:** `frontend/src/components/doc/GitCommitPanel.tsx`

---

## Remaining Known Issues

### Issue A — `refreshGitStatus` return type

`refreshGitStatus` in `gitSlice.ts` currently returns `Promise<void>` (implicitly, since the
async function has no explicit return). The `.then(() => setRefreshed(true))` chain depends on
this. Verify the action returns a resolved promise after the API call completes (it does —
`async` functions always return a Promise that resolves when the function body completes).

### Issue B — Stale state in BottomBar `DiffQuickButtons`

`DiffQuickButtons` reads `gitState` from `gitCurrentState` in the store (passed as a prop from
`BottomBar`). This is separate from the panel and is NOT refreshed on panel open. The BottomBar
buttons may show wrong shortcuts (e.g. "Staged diff" when state is actually `modified`).

**Fix needed:** Refresh git status when the diff viewer page loads, writing the result to the
store, not just to local component state.

### Issue C — `staged` state with empty staged diff

When `gitCurrentState = 'staged'` but HEAD→staged produces no diff (i.e. staged = HEAD), the
UI is in a contradictory state. This should be impossible in correct git state; it indicates
the store state is stale. After Fix 1, this should be self-correcting. If it persists, add a
fallback: after the refresh resolves, if state = `staged` but HEAD→staged diff is empty, treat
as `modified`.

### Issue D — Unstage button scope

The Unstage button currently calls `git reset HEAD -- <path>` (via `unstageFile`). For a
`staged-new` file (never committed), `git reset HEAD` fails because there is no HEAD. The
backend handles this by falling back, but confirm the UI reflects the resulting `untracked`
state correctly after unstaging a staged-new file.

---

## Playwright Test Gaps

| Test | Gap |
|------|-----|
| Test 13 | Verifies `modified-staged` after external file modify — does NOT verify panel loads with "Checking status…" first |
| Test 14 | Verifies unsaved-changes warning — `textarea.fill()` may trigger auto-save depending on editor config; test should wait for `docIsDirty` to be true without saving |
| Missing | Panel opened from diff viewer page shows correct (freshly fetched) state |
| Missing | BottomBar diff shortcuts update after status refresh |

---

## File Changelist

| File | Change | Status |
|------|--------|--------|
| `frontend/src/components/doc/GitCommitPanel.tsx` | Fix 1: block on refresh; unsaved warning; HEAD→staged for modified-staged | Done |
| `frontend/src/store/slices/gitSlice.ts` | Verify `refreshGitStatus` returns Promise correctly | Verify |
| `frontend/src/pages/DiffViewerPage.tsx` | Issue B: sync local gitFileState → Zustand store on load | Pending |
| `tests/e2e/git-workflow.spec.ts` | Add diff-viewer-page panel test; fix Test 14 timing | Pending |
