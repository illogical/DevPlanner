# 06 — Diff Viewer Enhancements

**Status:** Planning  
**Depends on:** 05-Git Integration (git diff endpoints), 01-Navigation (shared nav)  
**Phase:** 22.6

---

## Goal

Enhance the existing Diff Viewer (Phase 21) with Git-aware comparison modes. Currently the diff viewer only compares files loaded manually (drop, paste, file picker, or vault link). This phase adds the ability to view Git diffs: comparing the last committed version vs working tree changes, or comparing staged vs unstaged content.

---

## Current Diff Viewer Capabilities (Phase 21)

- Two-pane side-by-side layout with line-by-line diff
- Left pane: auto-loads from `?left=<vaultPath>` URL param
- Right pane: drag-and-drop, paste, or file picker
- Syntax highlighting via highlight.js
- Synchronized scrolling
- Toolbar: language selector, wrap toggle, sync scroll, swap panes, clear
- Color-coded diff lines: green (added), red (removed), neutral (unchanged)
- Standalone page at `/diff` with its own header (will be replaced by shared nav in Phase 22.1)

---

## New Diff Comparison Modes

### Mode 1: Manual (Existing)
- Load files manually via drop, paste, file picker, or URL params
- No Git involvement — pure text comparison
- This remains the default mode when no file context is provided

### Mode 2: Working Tree vs Last Commit
- **What it shows:** Changes in the working copy that have NOT been staged
- **Git equivalent:** `git diff -- <file>`
- **Left pane:** Last committed version (HEAD)
- **Right pane:** Current working tree content
- **Use case:** "What have I changed since the last commit?"

### Mode 3: Staged vs Last Commit
- **What it shows:** Changes that have been staged (added to index) but not committed
- **Git equivalent:** `git diff --cached -- <file>`
- **Left pane:** Last committed version (HEAD)
- **Right pane:** Staged version (index)
- **Use case:** "What will be included in my next commit?"

### Mode 4: Working Tree vs Staged
- **What it shows:** Differences between staged content and the current working tree
- **Git equivalent:** `git diff -- <file>` (when changes are staged, this shows unstaged-only delta)
- **Left pane:** Staged version
- **Right pane:** Working tree version
- **Use case:** "What changes are still unstaged?" (relevant in `modified-staged` state)

### Mode Summary

| Mode | Left Pane | Right Pane | Git Command |
|------|-----------|------------|-------------|
| Manual | User-provided | User-provided | None |
| Working vs Committed | HEAD (committed) | Working tree | `git diff HEAD -- <file>` |
| Staged vs Committed | HEAD (committed) | Staged (index) | `git diff --cached -- <file>` |
| Working vs Staged | Staged (index) | Working tree | `git diff -- <file>` |

---

## UI Changes

### Diff Mode Selector

Add a segmented control / button group to the `DiffToolbar`:

```
[Manual] [Working ↔ Committed] [Staged ↔ Committed] [Working ↔ Staged]
```

- **Manual** is the default when no file is loaded from a git-tracked source
- When opening from the editor/viewer with a file loaded, auto-select the most relevant mode:
  - File is `modified` → default to "Working ↔ Committed"
  - File is `staged` → default to "Staged ↔ Committed"
  - File is `modified-staged` → default to "Working ↔ Committed" (user can switch)
  - File is `clean` → default to "Manual" (nothing to diff)

### URL Parameters

Extend the diff page URL to support a mode parameter:

```
/diff?path=my-project/file.md&mode=working-committed
/diff?path=my-project/file.md&mode=staged-committed
/diff?path=my-project/file.md&mode=working-staged
/diff?left=<path>&right=<path>           // Manual mode (existing)
```

When `?path=` is provided with a `&mode=`, the diff viewer fetches both sides from Git endpoints rather than using drop/paste.

### Pane Headers

Update `DiffPaneHeader` to show contextual labels based on mode:

| Mode | Left Label | Right Label |
|------|-----------|------------|
| Manual | Filename or "Left pane" | Filename or "Right pane" |
| Working ↔ Committed | `HEAD (committed)` | `Working tree` |
| Staged ↔ Committed | `HEAD (committed)` | `Staged (index)` |
| Working ↔ Staged | `Staged (index)` | `Working tree` |

### Integration with Editor/Viewer

Add a "View Diff" button or link in the editor/viewer header that navigates to `/diff?path=<currentFile>&mode=working-committed`. The button should:
- Only appear when the file has uncommitted changes (not `clean`)
- Show appropriate tooltip based on git state
- Be adjacent to the git status dot

---

## Implementation Tasks

### Backend

#### 22.6.1 — Add git file content endpoints
- `GET /api/vault/git/show?path=<file>&ref=HEAD` — Returns file content at a specific Git ref
  - Uses `git show HEAD:<file>` to get committed content
  - Returns `{ content: string }` or `404` if file doesn't exist at that ref
- `GET /api/vault/git/show?path=<file>&ref=:0` — Returns staged content
  - Uses `git show :0:<file>` (index stage 0)
- Add `getFileAtRef(relativePath, ref)` method to `GitService`

#### 22.6.2 — Extend git diff endpoint
- Modify `GET /api/vault/git/diff` to support additional modes:
  - `?path=<file>&mode=working` — Working tree vs HEAD (`git diff HEAD -- <file>`)
  - `?path=<file>&mode=staged` — Staged vs HEAD (`git diff --cached -- <file>`)
  - `?path=<file>&mode=working-staged` — Working tree vs Staged (`git diff -- <file>`)
- Return `{ diff: string, leftLabel: string, rightLabel: string }` with descriptive labels

### Frontend

#### 22.6.3 — Add diff mode state
- Extend `DiffViewerPage` state or create a small store section:
  ```typescript
  type DiffMode = 'manual' | 'working-committed' | 'staged-committed' | 'working-staged';
  ```
- `diffMode` state, `setDiffMode` action
- When mode changes, refetch content from appropriate Git endpoints

#### 22.6.4 — Create `DiffModeSelector` component
- `frontend/src/components/diff/DiffModeSelector.tsx`
- Segmented button group for the 4 modes
- Integrated into `DiffToolbar`
- Disabled modes: gray out modes that don't apply (e.g., "Working ↔ Staged" when file is only `modified`, not `modified-staged`)

#### 22.6.5 — Add git content fetching to DiffViewerPage
- When `?path=` and `?mode=` URL params present:
  - Fetch left content from `GET /api/vault/git/show?path=<file>&ref=HEAD`
  - Fetch right content from `GET /api/vault/content?path=<file>` (working) or `git/show?ref=:0` (staged)
  - Set pane labels accordingly
- When mode changes, refetch the appropriate sides

#### 22.6.6 — Update `DiffPaneHeader` for mode-aware labels
- Accept `modeLabel` prop in addition to `filename`
- Display mode label (e.g., "HEAD (committed)") when in a git diff mode
- Keep filename display for manual mode

#### 22.6.7 — Add "View Diff" button to editor/viewer
- In the header area (near git status dot), add a button that:
  - Navigates to `/diff?path=<currentFile>&mode=working-committed`
  - Only visible when file has changes (not `clean`)
  - Icon: split/compare icon

#### 22.6.8 — Smart mode auto-selection
- When navigating to diff from editor/viewer, auto-select mode based on git state
- When navigating to diff from file browser, check file state and auto-select
- When file state is `clean`, default to manual mode

---

## Styling

| Element | Style |
|---------|-------|
| Mode selector buttons | `bg-gray-800 border border-gray-700`, active: `bg-blue-900 border-blue-600` |
| Disabled mode | `opacity-50 cursor-not-allowed` |
| Pane labels (git mode) | `text-xs text-gray-400 font-mono` badge/pill |

---

## Improvement Suggestions for Existing Diff Viewer

While implementing these enhancements, also address these improvements to the existing Phase 21 diff viewer:

1. **Line alignment** — Currently diff lines are shown sequentially. Improve "hollow line" rendering where removed lines in the left pane have blank placeholders in the right pane, keeping line numbers aligned.
2. **Hunk headers** — Show `@@ -X,Y +A,B @@` context headers between diff hunks (relevant for git diff output).
3. **Unified diff parsing** — Git returns unified diff format. Add a parser that converts unified diff output into the existing `DiffLineData[]` format.
4. **File info in pane headers** — Show file size, last modified timestamp when available.
5. **Empty diff state** — When both files are identical, show a "Files are identical" message instead of a blank pane.

---

## Notes

- `git show HEAD:<file>` works for getting committed content. For newly created (untracked) files, HEAD doesn't have the file — handle this gracefully (show empty left pane with "New file" label).
- `git show :0:<file>` gets the staged version. If nothing is staged, this returns the HEAD version.
- Path arguments to `git show` need to be relative to the repo root. The `GitService` should normalize paths relative to `ARTIFACT_BASE_PATH`.
- The `diff` npm package (already installed) can compute diffs client-side. For manual mode, keep using it. For git modes, prefer server-side `git diff` output for accuracy (handles binary detection, rename detection, etc.).
