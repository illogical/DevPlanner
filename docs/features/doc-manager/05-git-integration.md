# 05 — Git Integration

**Status:** Planning  
**Depends on:** 04-File Browser (git dots in file list), 01-Navigation (git dot in header)  
**Phase:** 22.5

---

## Goal

Add Git version control capabilities for vault artifact files. Users can stage, unstage, commit, and discard changes — all from within DevPlanner. Git status is displayed as colored indicators in the header and file browser. This matches VaultPad's single-file Git workflow, rebuilt with proper service architecture.

**Scope:** Single-file operations only. Multi-file staging, batch commits, and a VS Code-style source control panel are tracked as a future phase (see Future Enhancements below).

---

## Git States

| State | Tailwind | Meaning |
|-------|----------|---------|
| `clean` | `bg-emerald-500` | No changes since last commit |
| `modified` | `bg-red-500` | Unstaged edits in working tree; nothing staged |
| `staged` | `bg-blue-500` | Changes staged for commit; working tree matches index |
| `staged-new` | `bg-blue-500` | New file staged for first commit — no HEAD version exists |
| `modified-staged` | `bg-yellow-500` | Has both staged and additional unstaged changes |
| `untracked` | `bg-red-500` | New file not yet tracked or staged by Git |
| `ignored` | `bg-gray-500` | Listed in `.gitignore` |
| `outside-repo` | `bg-gray-500` | `ARTIFACT_BASE_PATH` is not a Git repo |
| `unknown` | `bg-gray-500` | Git command failed |

### Actions available per state

| State | Stage | Unstage | Discard | Commit | Diff buttons |
|-------|-------|---------|---------|--------|--------------|
| `untracked` | ✅ | — | — | — | None |
| `staged-new` | — | ✅ | — | ✅ | None (no HEAD) |
| `modified` | ✅ | — | — | — | HEAD→working |
| `staged` | — | ✅ | — | ✅ | HEAD→staged |
| `modified-staged` | ✅ | — | ✅ | ✅ | staged→working, HEAD→staged, HEAD→working |
| `clean` | — | — | — | — | None |

> **`staged-new` + working changes:** If a `staged-new` file is edited before committing, git reports it as `modified-staged`. Because no HEAD version exists, HEAD-based diff modes are suppressed and only the `staged→working` comparison is available. A banner is shown in the Diff Viewer.

---

## Feature Set

### Git Status Indicators

1. **Header dot** — Small colored circle in the header next to the file path. Clicking it opens the commit panel. Tooltip shows state label (e.g., "Modified", "Staged").

2. **File browser dots** — Each file in the file browser column 3 shows a small colored dot indicating its Git state. This gives an at-a-glance view of which files have uncommitted changes.

3. **Auto-refresh** — Git statuses refresh:
   - After every save operation
   - After every Git operation (stage, unstage, commit, discard)
   - On a configurable interval (default 30 seconds, only when tab is visible)
   - When the file browser is opened or refreshed

### Commit Panel

A floating panel that appears above the header when the user clicks the Git status dot. Contains:

- **Commit message textarea** — Auto-grows up to 220px
- **Action buttons** — Context-dependent based on file state:

| File State | Available Actions |
|------------|------------------|
| `clean` | None (panel shows "All changes committed") |
| `untracked` | **Stage** (`git add` — begins tracking and stages) |
| `staged-new` | **Unstage**, **Commit** (+ info note: "New file — no previous commit to compare") |
| `modified` | **Stage** |
| `staged` | **Unstage**, **Commit** |
| `modified-staged` | **Discard** (unstaged), **Stage** (unstaged), **Commit** (staged only) |

> **Panel behavior:** The panel stays open after Stage and Unstage so the user can commit immediately. It closes automatically only after Discard and Commit.

- **Keyboard shortcuts:**
  - `Enter` — Commit (when staged)
  - `Shift+Enter` — Newline in commit message
  - `Escape` — Close panel

- **Validation:** Commit message required; show error toast if empty
- **Feedback:** Success toast + panel closes + statuses refresh

### Git Operations

All operations are single-file, operating on the currently open file:

| Operation | Backend Endpoint | Git Command |
|-----------|-----------------|-------------|
| Stage | `POST /api/vault/git/stage` | `git add -- <file>` |
| Unstage | `POST /api/vault/git/unstage` | `git reset HEAD -- <file>` |
| Discard unstaged | `POST /api/vault/git/discard` | `git restore --worktree -- <file>` |
| Commit | `POST /api/vault/git/commit` | `git commit -m "<message>" -- <file>` |
| Get status | `GET /api/vault/git/status?path=<file>` | `git status --porcelain=v1 -- <file>` |
| Batch statuses | `POST /api/vault/git/statuses` | Multiple `git status` calls |

---

## Implementation Tasks

### Backend

#### 22.5.1 — Create `GitService`
- `src/services/git.service.ts`
- Constructor takes `vaultPath: string` (the `ARTIFACT_BASE_PATH`)
- Methods:
  ```typescript
  getStatus(relativePath: string): Promise<GitState>
  getStatuses(relativePaths: string[]): Promise<Record<string, GitState>>
  stage(relativePath: string): Promise<GitState>       // Returns new state
  unstage(relativePath: string): Promise<GitState>
  discardUnstaged(relativePath: string): Promise<GitState>
  commit(relativePath: string, message: string): Promise<{ state: GitState; output: string }>
  getDiff(relativePath: string, mode: 'working' | 'staged'): Promise<string>
  ```
- Uses `execFile('git', [...args])` via `child_process` (promisified)
- All paths normalized and validated (no traversal outside vault)
- Git porcelain v1 parsing for status mapping
- Error handling: detect "not a git repository", return `outside-repo` state

#### 22.5.2 — Create vault git routes
- `src/routes/vault-git.ts` (or extend `src/routes/vault.ts`)
- Endpoints:
  - `GET /api/vault/git/status?path=` → `{ path, state }`
  - `POST /api/vault/git/statuses` body `{ paths: string[] }` → `{ statuses: Record<string, GitState> }`
  - `POST /api/vault/git/stage` body `{ path }` → `{ ok, path, state }`
  - `POST /api/vault/git/unstage` body `{ path }` → `{ ok, path, state }`
  - `POST /api/vault/git/discard` body `{ path }` → `{ ok, path, state }`
  - `POST /api/vault/git/commit` body `{ path, message }` → `{ ok, path, state, output }`
- All endpoints validate `ARTIFACT_BASE_PATH` is set
- Register in `src/server.ts`

#### 22.5.3 — Create git diff endpoint
- `GET /api/vault/git/diff?path=<file>&mode=working|staged`
  - `working` mode: `git diff -- <file>` (uncommitted working tree changes)
  - `staged` mode: `git diff --cached -- <file>` (staged vs last commit)
- Returns raw diff text
- Used by Diff Viewer enhancements (Phase 22.6)

### Frontend

#### 22.5.4 — Add `gitSlice` to Zustand store
```typescript
type GitState = 'clean' | 'modified' | 'staged' | 'modified-staged' | 'untracked' | 'ignored' | 'outside-repo' | 'unknown';

interface GitSlice {
  gitStatuses: Record<string, GitState>;   // path → state
  gitCurrentState: GitState | null;        // State of currently open file
  gitIsLoading: boolean;
  gitCommitPanelOpen: boolean;
  gitCommitMessage: string;
  gitActionLoading: boolean;
  gitRefreshInterval: number;              // seconds, default 30

  refreshGitStatus: (path: string) => Promise<void>;
  refreshGitStatuses: (paths: string[]) => Promise<void>;
  stageFile: (path: string) => Promise<void>;
  unstageFile: (path: string) => Promise<void>;
  discardUnstaged: (path: string) => Promise<void>;
  commitFile: (path: string, message: string) => Promise<void>;
  setGitCommitMessage: (msg: string) => void;
  toggleCommitPanel: () => void;
  setGitRefreshInterval: (seconds: number) => void;
}
```

#### 22.5.5 — Add git API methods to client
- `frontend/src/api/client.ts`:
  ```typescript
  gitApi: {
    getStatus(path: string): Promise<{ path: string; state: GitState }>;
    getStatuses(paths: string[]): Promise<{ statuses: Record<string, GitState> }>;
    stage(path: string): Promise<{ ok: boolean; path: string; state: GitState }>;
    unstage(path: string): Promise<{ ok: boolean; path: string; state: GitState }>;
    discard(path: string): Promise<{ ok: boolean; path: string; state: GitState }>;
    commit(path: string, message: string): Promise<{ ok: boolean; path: string; state: GitState; output: string }>;
    getDiff(path: string, mode: 'working' | 'staged'): Promise<string>;
  }
  ```

#### 22.5.6 — Create `GitStatusDot` component
- `frontend/src/components/doc/GitStatusDot.tsx`
- Small colored circle (6-8px) with tooltip showing state label
- Accepts `state: GitState` and optional `onClick`
- Color mapping from the state table above
- Loading state: spinner animation

#### 22.5.7 — Create `GitCommitPanel` component
- `frontend/src/components/doc/GitCommitPanel.tsx`
- Floating panel above header (similar to VaultPad's `.gitPanel`)
- Commit message textarea (auto-grows)
- Context-sensitive action buttons based on current file state
- Enter to commit, Shift+Enter for newline, Escape to close
- Validation: empty message error
- Success/error toasts

#### 22.5.8 — Integrate git status into header
- Show `GitStatusDot` in header for doc views (viewer/editor)
- Click dot → toggle `GitCommitPanel`
- Display alongside file path breadcrumb

#### 22.5.9 — Integrate git status into file browser
- `FileColumn` renders `GitStatusDot` per file item
- Batch-fetch statuses when drawer opens or folder changes
- Refresh statuses after git operations

#### 22.5.10 — Auto-refresh git statuses
- `useEffect` with interval timer in doc views
- Only runs when `document.hidden === false` (Page Visibility API)
- Interval configurable via settings (default 30s, range 5-300s)
- Also triggers after save and after git operations

#### 22.5.11 — Create `GitSettingsPanel` component
- `frontend/src/components/doc/GitSettingsPanel.tsx`
- Small popover triggered by a settings gear icon
- Slider or number input for git refresh interval (5-300 seconds)
- Persisted to localStorage (same pattern as VaultPad's `vaultpad.config.v1`)

---

## Styling

| Element | Style |
|---------|-------|
| Git dot (clean) | `bg-[#2ea043]` — Green |
| Git dot (modified) | `bg-[#f5a524]` — Orange |
| Git dot (staged) | `bg-[#416E47]` — Teal |
| Git dot (modified-staged) | `bg-[#D97757]` — Orange-red |
| Git dot (untracked) | `bg-[#ce9178]` — Brown |
| Git dot (ignored/outside/unknown) | `bg-gray-500` |
| Commit panel | `bg-gray-900 border border-gray-700 rounded-lg shadow-xl` |
| Commit textarea | `bg-gray-800 text-gray-200 border-gray-700` |
| Stage button | `bg-teal-800 hover:bg-teal-700` |
| Unstage button | `bg-gray-700 hover:bg-gray-600` |
| Commit button | `bg-blue-800 hover:bg-blue-700` |
| Discard button | `bg-red-900 hover:bg-red-800` (destructive) |

---

## Future Enhancements — Multi-File Git (Phase 23+)

The initial implementation matches VaultPad: single-file operations only. Future work to build a VS Code-style source control interface:

- [ ] **Source Control Panel** — Sidebar or drawer showing all modified/staged/untracked files grouped by state
- [ ] **Multi-select staging** — Checkbox to select multiple files, stage/unstage all at once
- [ ] **Batch commit** — Commit message applies to all staged files in one `git commit`
- [ ] **Diff preview in staging** — Click a file in the staging panel to see its diff
- [ ] **Git log viewer** — Show recent commits with messages, authors, timestamps
- [ ] **Branch display** — Show current branch name in header
- [ ] **Stash support** — Stash/pop working changes

These are tracked in TASKS.md under a separate phase.

---

## Security Notes

- Git operations are server-side only; the frontend never executes shell commands
- All file paths are validated server-side with traversal guards
- `execFile` is used (not `exec`) to prevent command injection — arguments are passed as array elements, never string-concatenated
- Commit messages are passed as single arguments to `git commit -m`, sanitized by Git itself
- The `ARTIFACT_BASE_PATH` must be a Git repository; the service detects and reports `outside-repo` gracefully
