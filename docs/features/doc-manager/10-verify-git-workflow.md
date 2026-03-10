# 10 — Verify Git Workflow

**Status:** In Progress
**Phase:** 22.10
**Date:** 2026-03-09
**Depends on:** 05-Git Integration, 06-Diff Viewer, 09-Improve Diff Options

---

## Context

The doc manager has a full single-file Git workflow. Several bugs were found during QA that affect correctness of the git state machine, actions available in the Git Actions panel, file browser sync on the Compare tab, and diff mode availability for files with no HEAD commit. This phase fixes all of them and adds Playwright E2E tests to lock the workflow in.

---

## Git Workflow State Machine (Source of Truth)

> **Key fact:** `git add` is the staging command. For new files it both begins tracking AND stages simultaneously — these are the same operation. There is no separate "track" step.

| Step | GitState | Status Color | Available Diffs | Available Actions |
|------|----------|--------------|-----------------|-------------------|
| New file, not staged | `untracked` | Red | None | Stage |
| `git add` (tracks + stages) | `staged-new` | Blue | None (no HEAD) | Unstage, Commit |
| Edit staged-new file | `modified-staged` | Yellow | `staged→working` only* | Discard, Stage, Commit |
| Stage again | `staged-new` | Blue | None | Unstage, Commit |
| First commit | `clean` | Emerald | None | None |
| Edit committed file | `modified` | Red | `HEAD→working` | Stage |
| Stage changes | `staged` | Blue | `HEAD→staged` | Unstage, Commit |
| Edit again (partially staged) | `modified-staged` | Yellow | `staged→working`, `HEAD→staged`, `HEAD→working` | Discard, Stage, Commit |
| Stage again | `staged` | Blue | `HEAD→staged` | Unstage, Commit |

\* When the file has never been committed (`modified-staged` from a `staged-new` origin), HEAD-based diff modes must be suppressed — there is no HEAD version to compare against.

---

## Status Colors (authoritative — from `GitStatusDot.tsx`)

| Tailwind class | State(s) | Short label | Tooltip |
|---|---|---|---|
| `bg-emerald-500` | `clean` | Clean | All changes committed |
| `bg-red-500` | `modified` | Unstaged | Modified — unstaged changes |
| `bg-red-500` | `untracked` | Untracked | Untracked — not yet added to git |
| `bg-blue-500` | `staged` | Staged | Staged — ready to commit |
| `bg-blue-500` | `staged-new` | New file | New file — staged, ready to commit |
| `bg-yellow-500` | `modified-staged` | Partial staged | Staged + unstaged changes |
| `bg-gray-500` | `ignored`, `outside-repo`, `unknown` | varies | Not tracked by git |

---

## Bugs

### Bug 1 — File browser selection doesn't update on Compare tab (`/diff`) [PRIMARY]

**File:** `frontend/src/components/doc/FileBrowserColumns.tsx`

**Root cause:** `FileColumn` receives `currentFilePath={docFilePath}` to highlight the active file. `docFilePath` is only updated when navigating to `/editor` or `/viewer`. On `/diff`, selecting a file updates the URL (`?left=...`) but not `docFilePath`, so the highlight stays on the old file.

**Fix:** Compute `currentFilePath` from URL params when on `/diff`:
```typescript
const [searchParams] = useSearchParams();

const currentFilePath = location.pathname.startsWith('/diff')
  ? (searchParams.get('left') ?? searchParams.get('gitPath') ?? docFilePath)
  : docFilePath;
```
Pass this computed value to `FileColumn` instead of raw `docFilePath`.

---

### Bug 2 — `staged-new` state renders a blank Git Actions panel

**File:** `frontend/src/components/doc/GitCommitPanel.tsx`

**Root cause:** `staged-new` is absent from `canCommit` and `canUnstage` capability flags, so the panel shows nothing — no buttons, no message — for a newly-staged file. The file is staged and should allow Unstage and Commit.

**Fix:**
```typescript
// Before
const canCommit  = state === 'staged' || state === 'modified-staged';
const canUnstage = state === 'staged' || state === 'modified-staged';

// After
const canCommit  = state === 'staged' || state === 'staged-new' || state === 'modified-staged';
const canUnstage = state === 'staged' || state === 'staged-new' || state === 'modified-staged';
```

Also add a contextual note for `staged-new` where diff links would otherwise appear:
> *"New file — no previous commit to compare."*

---

### Bug 3 — HEAD-based diff modes shown when no HEAD exists

**Files:** `frontend/src/pages/DiffViewerPage.tsx`, `frontend/src/components/diff/DiffGitModeBar.tsx`

**Root cause:** `getAvailableModes('modified-staged')` returns all 3 modes. For a file that was `staged-new` and then edited (state is now `modified-staged` but file was never committed), `git show HEAD:<file>` returns empty string. The diff viewer shows a confusing "all lines added" view instead of a meaningful error.

**Fix:** After fetching git status in `DiffViewerPage`, probe for a HEAD version:
```typescript
const [hasHead, setHasHead] = useState<boolean | null>(null);

useEffect(() => {
  const gitPath = searchParams.get('gitPath');
  if (!gitPath) { setHasHead(null); return; }
  gitApi.show(gitPath, 'HEAD')
    .then(content => setHasHead(content.length > 0))
    .catch(() => setHasHead(false));
}, [searchParams]);
```

Update `getAvailableModes` signature to accept `hasHead`:
```typescript
function getAvailableModes(state: GitState | null, hasHead: boolean): DiffMode[]
```
When `hasHead === false` and state is `modified-staged`, return only the `staged-working` mode.

Add a banner when `hasHead === false`:
> *"New file — no previous commit exists. Showing staged vs working tree only."*

---

### Bug 4 — Git Actions panel closes after stage/unstage

**File:** `frontend/src/components/doc/GitCommitPanel.tsx`

**Root cause:** Stage and Unstage `onClick` handlers call `toggleCommitPanel()` immediately after the action fires, closing the panel before the user can commit in the same session.

**Fix:** Remove `toggleCommitPanel()` from Stage and Unstage handlers. The panel should only close automatically after Discard and Commit (terminal operations that complete the workflow step).

---

## Documentation Changes

### `frontend/README.md`

The README's "Git Integration" section is missing `staged-new` and does not have the full workflow state machine. Add:

1. `staged-new` row to the status colors table (Blue, "New file", "New file staged for first commit")
2. `staged-new` row to the Git Actions panel table (`Unstage`, `Commit`)
3. A new **"Git workflow state machine"** section with the full table from above
4. A callout: `git add` is the staging command — for new files it begins tracking and stages in one step

### `docs/features/doc-manager/05-git-integration.md`

Add `staged-new` to the Git States table:

| State | Color | Meaning |
|-------|-------|---------|
| `staged-new` | Blue `#3b82f6` | New file staged for first commit — no HEAD version exists |

---

## Playwright E2E Tests

**File:** `tests/e2e/git-workflow.spec.ts`

**Infrastructure:** `global-setup.ts` creates a fresh temp git repo, writes `.env.test` pointing the backend at it, and tears it down afterward. Tests run sequentially (no parallelism — git state is shared). The backend and Vite dev server are started automatically by `playwright.config.ts`.

**Run:** `bun run test:e2e`

### Infrastructure helpers (`tests/e2e/helpers.ts`)

| Helper | API endpoint | Purpose |
|--------|-------------|---------|
| `saveVaultFile(path, content)` | `PUT /api/vault/file` | Create or overwrite a vault file |
| `deleteVaultFile(path)` | `DELETE /api/vault/file` | Remove a vault file (cleanup) |
| `gitStatus(path)` | `GET /api/vault/git/status` | Read current `GitState` via API |
| `gitStage(path)` | `POST /api/vault/git/stage` | Stage a file (test setup shortcut) |
| `gitUnstage(path)` | `POST /api/vault/git/unstage` | Unstage a file (test setup shortcut) |
| `gitDiscard(path)` | `POST /api/vault/git/discard` | Discard unstaged changes (cleanup) |
| `gitCommit(path, msg)` | `POST /api/vault/git/commit` | Commit a file (test setup shortcut) |
| `editorUrl(path)` | — | Build `/editor?path=...` URL |
| `diffUrl(path, left, right)` | — | Build `/diff?gitPath=...&leftRef=...&rightRef=...` URL |

> **Note on commit verification:** The test repo is a real isolated git repo created fresh per run. Commits are real and permanent within the session. Verification is done by asserting `gitStatus()` returns `clean` after commit — this is the authoritative signal that all changes were committed. No undo is needed; the entire temp repo is deleted by teardown.

### Test 1 — untracked → staged-new → commit (Bug 2)
1. Create new file → verify Red "Untracked" dot
2. Open panel → verify only Stage button visible (no Commit)
3. Click Stage → verify Blue "New file" dot
4. Reopen panel → verify Unstage + Commit visible; "no previous commit" info note; no diff links

### Test 2 — staged-new → unstage → untracked
1. Create and stage a new file → Blue "New file" dot
2. Open panel → click Unstage
3. Verify Red "Untracked" dot; API confirms `state === 'untracked'`

### Test 3 — Git Actions panel stays open after Stage and Unstage (Bug 4)
1. Commit a file, then edit it → "modified" state
2. Open panel → click Stage → verify Commit button visible without reopening the panel
3. Click Unstage → verify Stage button visible without reopening the panel

### Test 4 — Discard: modified → clean
1. Commit a file, then edit without staging → "modified"
2. Open panel → click Discard
3. Verify Emerald "Clean" dot; API confirms `state === 'clean'`

### Test 5 — Discard unstaged portion of partial-staged: modified-staged → staged
1. Commit, stage a change, add another unstaged edit → "modified-staged"
2. Open panel → click Discard
3. Verify Blue "Staged" dot; API confirms `state === 'staged'`

### Test 6 — Full edit→stage→partial-stage→commit cycle with diff shortcuts
1. Edit committed file → "modified" → verify "All changes" diff shortcut visible in panel
2. Stage → "staged" → panel stays open; verify Commit + Unstage visible
3. Make another external edit → "modified-staged" → verify Discard, Stage, Commit; three diff links (All changes, Staged diff, Unstaged changes)
4. Stage all → Commit → verify "Clean"; API confirms `state === 'clean'`

### Test 7 — staged → unstage → modified (committed file)
1. Commit a file, stage a change via API shortcut
2. Open panel → click Unstage
3. Verify Red "Unstaged" dot; API confirms `state === 'modified'`

### Test 8 — Clean file: Git Actions panel shows no action buttons
1. Open editor on a clean file → verify Emerald dot
2. Open panel → verify Stage, Commit, Discard are all absent

### Test 9 — BottomBar diff shortcuts per git state
1. Modified file → verify "All changes" link visible; click it → navigates to `/diff`
2. Stage → verify "Staged diff" link visible in BottomBar

### Test 10 — File browser highlight follows URL on Compare tab (Bug 1)
1. Open `/diff` with file A loaded → open file browser → verify file A has amber border
2. Click file B → verify URL updates to `left=...file-b`; file B gets amber border; file A loses it

### Test 11 — staged-new + working changes: only staged→working tab + no-HEAD banner (Bug 3)
1. Create and stage a new file → `staged-new`
2. Edit without re-staging → `modified-staged` (no HEAD)
3. Open diff viewer → verify "New file — no previous commit" banner visible
4. Verify only "Unstaged changes" tab present; "All changes" and "Staged diff" absent

### Test 12 — Commit verification
1. Commit a pre-existing file, edit it, stage and commit via UI
2. Verify Green "Clean" dot; `gitStatus()` API returns `'clean'`
   (State = clean is the authoritative proof the commit was persisted to the git repo)

---

## File Changelist

| File | Change | Priority |
|------|--------|----------|
| `frontend/src/components/doc/FileBrowserColumns.tsx` | Bug 1: URL-aware `currentFilePath` | High |
| `frontend/src/components/doc/GitCommitPanel.tsx` | Bug 2 + Bug 4: staged-new support, panel stays open after stage | High |
| `frontend/README.md` | Add staged-new, workflow state machine, git add clarification | High |
| `frontend/src/pages/DiffViewerPage.tsx` | Bug 3: `hasHead` detection + no-HEAD banner | Medium |
| `frontend/src/components/diff/DiffGitModeBar.tsx` | Bug 3: `hasHead` prop, filter HEAD-based modes | Medium |
| `docs/features/doc-manager/05-git-integration.md` | Add `staged-new` to state table | Low |
| `src/routes/vault.ts` | Add `DELETE /api/vault/file` for test cleanup | Done |
| `tests/e2e/helpers.ts` | Fixed API endpoints; added `gitUnstage` helper | Done |
| `tests/e2e/git-workflow.spec.ts` | Full 12-test E2E suite covering all states + bug regressions | Done |

---

## Verification

1. New file → `git add` → Blue "New file" status → Git Actions panel shows Unstage + Commit (Bug 2) — **Test 1**
2. First commit → edit → stage → edit again → Yellow status → three diff mode tabs visible (workflow) — **Test 6**
3. Navigate to `/diff` → open file browser → click different file → highlight moves (Bug 1) — **Test 10**
4. New file → stage → edit → open diff → only `staged→working` tab shown + no-HEAD banner (Bug 3) — **Test 11**
5. Stage a file → Git Actions panel stays open (Bug 4) — **Test 3**
6. Unstage a new staged file → returns to untracked — **Test 2**
7. Discard unstaged changes → file returns to clean or staged — **Tests 4 & 5**
8. Run `bun run test:e2e` → all 12 tests pass
