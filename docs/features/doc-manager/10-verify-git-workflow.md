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

**New file:** `tests/git-workflow.spec.ts`

Fixture: `beforeAll` initializes a temp directory as a git repo, sets it as `ARTIFACT_BASE_PATH`, and starts the dev server pointing at it.

### Test 1 — untracked → staged-new → commit
1. Create a new file in the vault
2. Open it in the editor → verify Red status dot with "Untracked" label
3. Click Stage in Git Actions panel → verify Blue dot with "New file" label
4. Open Git Actions panel → verify Unstage and Commit buttons are visible; no diff links; info note shown
5. Enter commit message → Commit → verify Emerald dot (Clean)

### Test 2 — edit committed file → stage → partial stage → commit
1. Edit the committed file → verify Red dot (Unstaged)
2. Click the "All changes" diff quick button in BottomBar → verify diff viewer loads HEAD vs working
3. Return to editor → Stage → verify Blue dot (Staged)
4. Edit file again → verify Yellow dot (Partial staged)
5. Open Git Actions panel → verify Discard, Stage, Commit buttons; three diff links visible
6. Commit → verify Emerald dot (Clean)

### Test 3 — file browser highlight sync on Compare tab
1. Navigate to `/diff` with a git file loaded (`?gitPath=...`)
2. Open file browser → verify current file is highlighted (amber border)
3. Click a different file → verify highlight moves to the new file immediately

### Test 4 — staged-new + working changes (no HEAD)
1. Create and stage a new file
2. Edit the file without staging → state becomes `modified-staged`
3. Navigate to diff → verify only "Unstaged changes" tab appears (no "All changes" or "Staged diff" tabs)
4. Verify "New file — no previous commit exists" banner is visible

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
| `tests/git-workflow.spec.ts` | New Playwright E2E test suite | After bugs fixed |

---

## Verification

1. New file → `git add` → Blue "New file" status → Git Actions panel shows Unstage + Commit (Bug 2)
2. First commit → edit → stage → edit again → Yellow status → three diff mode tabs visible (workflow)
3. Navigate to `/diff` → open file browser → click different file → highlight moves (Bug 1)
4. New file → stage → edit → open diff → only `staged→working` tab shown + no-HEAD banner (Bug 3)
5. Stage a file → Git Actions panel stays open (Bug 4)
6. Run `npx playwright test tests/git-workflow.spec.ts` → all 4 test scenarios pass
