# 11 — Git Panel State Accuracy

**Status:** Active  
**Phase:** 22 (follow-up)  
**Date:** 2026-03-10  

---

## Problem Summary

After initial implementation of the git commit panel and diff viewer, three accuracy issues were identified and resolved:

---

## Bug 1 — Staged Diff Showed HEAD on Both Panes

### Symptom

Navigating to `/diff?path=<file>&mode=staged-committed` (or any git diff mode) did not load git-aware content. Both panes loaded either the current working-tree content or remained empty, because the `DiffViewerPage` only understood `?left=` and `?right=` vault-path parameters and had no git diff mode support.

### Root Cause

`DiffViewerPage` used `vaultApi.getContent()` (vault filesystem) for both panes. There was no code path to fetch content from git refs (`HEAD`, `:0` index, etc.).

### Fix

1. **Backend** — Added `getFileAtRef(relativePath, ref)` to `GitService`. Uses `git show <ref>:<path>` to read committed or staged file content. Added `GET /api/vault/git/show?path=<file>&ref=<ref>` endpoint.
2. **Frontend API** — Added `gitApi.getFileAtRef(path, ref)` to the API client.
3. **`DiffViewerPage`** — When `?path=<file>&mode=<git-mode>` URL params are both present, the page now fetches both panes from the appropriate git endpoint instead of the vault filesystem. Supported modes:

| URL Mode | Left Pane | Right Pane |
|----------|-----------|------------|
| `staged-committed` | `HEAD` (last commit) | `:0` (staging area) |
| `working-committed` | `HEAD` (last commit) | Working tree |
| `working-staged` | `:0` (staging area) | Working tree |

4. **`DiffPaneHeader`** — Accepts an optional `label` prop to display contextual text like `"HEAD (committed)"` or `"Staged (index)"` instead of a bare filename.

---

## Bug 2 — `modified-staged` State Had No Indicator

### Symptom

When a file had both staged changes and additional unstaged changes (`modified-staged` state), the commit panel showed the Commit section without any warning. Users could accidentally commit only the staged portion while silently leaving unstaged changes behind.

### Root Cause

The `canCommit` flag was `state === 'staged' || state === 'modified-staged'`, which allowed commits in both states. There was no indicator or warning for the `modified-staged` case.

### Fix

1. **`canCommit`** — Changed to `state === 'staged'` only. Commits are now blocked when unstaged changes exist.
2. **Warning banner** — Added a yellow `"Staged* — unstaged changes also exist. Stage or discard them before committing."` banner that appears in the commit panel whenever `state === 'modified-staged'`.
3. **Documentation** — Updated `05-git-integration.md` commit panel table and `10-verify-git-workflow.md` to reflect this behavior.

---

## Bug 3 — Unstage Button Did Not Work

### Symptom

Clicking the Unstage button appeared to do nothing. The git status did not change.

### Root Cause

The `unstage()` method in `GitService` used `git reset HEAD -- <file>` as its only strategy. This command fails when:
- The repository has no commits yet (HEAD does not resolve), e.g., a brand-new repo where a file was staged with `git add` but not yet committed.
- Some environments / git configurations do not support the deprecated `git reset HEAD` form for unstaging.

The catch block in the frontend `unstageFile` action swallowed the error silently (`catch { set({ gitActionLoading: false }) }`), so the user saw no response.

### Fix

1. **`GitService.unstage()`** — Now attempts `git restore --staged -- <file>` first (git ≥ 2.23, the preferred modern command). Falls back to `git reset HEAD -- <file>` for older git versions.
2. **Post-save git refresh** — `saveDocFile` in `docSlice` now calls `refreshGitStatus()` immediately after a successful save. This ensures the dot and commit panel reflect any newly-created unstaged changes without waiting for the next polling cycle.

---

## Files Changed

| File | Change |
|------|--------|
| `src/services/git.service.ts` | Fixed `unstage()` to use `git restore --staged`; added `getFileAtRef()` |
| `src/routes/vault-git.ts` | Added `GET /api/vault/git/show` endpoint |
| `frontend/src/api/client.ts` | Added `gitApi.getFileAtRef()` |
| `frontend/src/components/doc/GitCommitPanel.tsx` | Fixed `canCommit`; added `modified-staged` warning banner |
| `frontend/src/store/slices/docSlice.ts` | Refresh git status after save |
| `frontend/src/pages/DiffViewerPage.tsx` | Added `?path=&mode=` git diff mode support |
| `frontend/src/components/diff/DiffPaneHeader.tsx` | Added optional `label` prop |
| `frontend/src/components/diff/DiffPane.tsx` | Passed `label` to `DiffPaneHeader` |
| `frontend/src/components/diff/DiffLayout.tsx` | Passed `leftLabel`/`rightLabel` to `DiffPane` |
| `src/__tests__/git.service.test.ts` | New: unit tests for `GitService` |
| `docs/features/doc-manager/05-git-integration.md` | Updated commit panel behavior table |
| `docs/features/doc-manager/10-verify-git-workflow.md` | New: workflow verification doc |
| `docs/features/doc-manager/11-git-panel-state-accuracy.md` | New: this file |
