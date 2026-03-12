# 10 — Verify Git Workflow

**Status:** Active  
**Phase:** 22 (follow-up)  
**Date:** 2026-03-10  

---

## Goal

Describe the expected end-to-end git workflow in the Doc Manager so that both humans and AI agents can verify correct behavior at a glance.

---

## Workflow States

| Git State | Color | Meaning | Available Actions |
|-----------|-------|---------|-------------------|
| `clean` | Green | No changes since last commit | None (panel shows "All changes committed") |
| `modified` | Orange | Working tree has unsaved-staged changes | Stage, Discard |
| `staged` | Teal | All changes staged, ready to commit | Unstage, **Commit** |
| `modified-staged` | Orange-red | Staged changes exist **and** additional unstaged changes exist | Stage (unstaged), Discard (unstaged), Unstage (staged). **Commit is blocked** — a warning is shown. |
| `untracked` | Brown | New file not yet tracked | Stage |
| `ignored` / `outside-repo` / `unknown` | Gray | N/A | None |

---

## Expected Workflow

1. **Open a file** in the Editor or Viewer. Git status dot appears in the header.
2. **Edit and save** the file (Ctrl+S). Git status immediately refreshes — the dot turns orange (`modified`).
3. **Open commit panel** by clicking the status dot.
4. **Stage** the changes. Dot turns teal (`staged`). Commit section appears.
5. **Commit** — enter a message and press Enter (or click Commit). Dot turns green (`clean`).

### Modified-Staged Flow

If you stage changes and then save additional edits without staging them:

1. File enters `modified-staged` state (orange-red dot).
2. Commit panel shows a **"Staged* — unstaged changes also exist"** warning banner.
3. The Commit section is **hidden** — you cannot commit until all changes are staged.
4. Options:
   - **Stage** the remaining unstaged changes → file becomes `staged` → Commit section reappears.
   - **Discard** the unstaged changes → file becomes `staged` → Commit section reappears.
   - **Unstage** all staged changes → file returns to `modified` → no Commit section.

---

## Verification Checklist

- [ ] After saving a file, the git status dot updates within one refresh cycle (auto-refresh or immediate post-save refresh).
- [ ] Stage button correctly transitions `modified` → `staged`.
- [ ] Unstage button correctly transitions `staged` → `modified` (or `untracked` for a new file without commits).
- [ ] Unstage button correctly transitions `modified-staged` → `modified`.
- [ ] Discard button reverts working-tree changes and transitions `modified` → `clean` or `modified-staged` → `staged`.
- [ ] In `modified-staged` state, the warning banner is visible.
- [ ] In `modified-staged` state, the Commit section is **not rendered**.
- [ ] In `staged` state, the Commit section is rendered and the Commit button works.
- [ ] In `clean` state, the commit panel shows "All changes committed."
- [ ] The diff viewer at `/diff?path=<file>&mode=staged-committed` shows HEAD on the left and the staged (index) version on the right.
- [ ] The diff viewer at `/diff?path=<file>&mode=working-committed` shows HEAD on the left and the current working tree on the right.
- [ ] The diff viewer at `/diff?path=<file>&mode=working-staged` shows the staged version on the left and the working tree on the right.

---

## Known Limitations

- Single-file operations only. There is no multi-file staging panel or batch commit.
- Git status auto-refreshes every 30 seconds (configurable via the gear icon). It also refreshes immediately after every save and git operation.
