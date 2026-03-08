# Doc Manager — Feature Overview

**Status:** Planning  
**Priority:** Phase 22  
**Date:** 2026-03-07

---

## Summary

Doc Manager is a multi-view extension to DevPlanner that adds Markdown viewing, editing, Git version control, a file browser, and an enhanced diff viewer — all operating on vault artifact files under `ARTIFACT_BASE_PATH`. These features are ported from the [VaultPad prototype](../../prototypes/VaultPad/README.md) and rebuilt using DevPlanner's React 19 + Zustand + Tailwind CSS 4 architecture.

The goal is to let users manage and version-control Markdown artifacts directly within DevPlanner — view rendered previews, edit raw content with live preview, stage/commit changes via Git, browse the artifact directory tree, and compare file versions with the existing Diff Viewer.

---

## Motivation

- **VaultPad** is a standalone lightweight Markdown editor/viewer with Git integration and a file browser. It works well but uses Preact with vanilla CSS and doesn't integrate with the Kanban workflow.
- **DevPlanner's Diff Viewer** (Phase 21) already serves vault file content and renders side-by-side diffs, but it is a standalone page with no navigation to other views, no editing capability, and no Git awareness.
- Merging both feature sets into DevPlanner creates a unified workspace: plan work on the Kanban board, write/edit artifacts in the editor, review changes in the diff viewer, and commit them via Git — all in one app.

---

## Feature Set

| Feature | Description | Source | Plan Doc |
|---------|-------------|--------|----------|
| App Navigation | Top-level nav bar to switch between Kanban, Viewer, Editor, Diff | New | [01-navigation.md](01-navigation.md) |
| Markdown Viewer | Full-width rendered Markdown preview with VaultPad styling | VaultPad view mode | [02-markdown-viewer.md](02-markdown-viewer.md) |
| Markdown Editor | Side-by-side raw text + live preview | VaultPad editor mode | [03-markdown-editor.md](03-markdown-editor.md) |
| File Browser | Slide-out panel with folder tree + file list | VaultPad file selector | [04-file-browser.md](04-file-browser.md) |
| Git Integration | Stage, unstage, commit, discard — with status indicators | VaultPad git support | [05-git-integration.md](05-git-integration.md) |
| Diff Viewer Enhancements | Git-aware diff (committed vs working, staged vs unstaged) | New + existing Phase 21 | [06-diff-viewer-enhancements.md](06-diff-viewer-enhancements.md) |
| VaultPad Theme | Optional theme switcher using VaultPad's color palette | VaultPad CSS | [07-theme-switcher.md](07-theme-switcher.md) |

---

## Architecture Principles

1. **Use DevPlanner's existing patterns.** Zustand store slices, typed API client, Tailwind CSS, Framer Motion animations, component composition matching the existing Kanban codebase.
2. **No Preact patterns.** VaultPad's monolithic `App()` function with 30+ `useState` hooks and inline fetch calls is **not** the target architecture. Instead: store-managed state, dedicated API client functions, and focused single-responsibility components.
3. **Backend parity.** Reuse and extend the existing `VaultService` and vault route. New Git endpoints are added to the Elysia backend, not as raw `fetch` calls from the frontend.
4. **Incremental delivery.** Each sub-feature can be implemented independently and merged separately. The navigation bar unblocks all other features, so it comes first.
5. **Shared components.** The file browser and Git status indicators are shared across views (viewer, editor, diff). Build them as standalone components, not view-specific.

---

## Dependency Map

```
┌───────────────┐
│ 01 Navigation │  ← Start here (unblocks all views)
└───────┬───────┘
        │
  ┌─────┴──────────────────────┐
  │                            │
  ▼                            ▼
┌─────────────┐   ┌────────────────────┐
│ 02 Viewer   │   │ 04 File Browser    │ ← Shared across views
└──────┬──────┘   └─────────┬──────────┘
       │                    │
       ▼                    ▼
┌─────────────┐   ┌────────────────────┐
│ 03 Editor   │   │ 05 Git Integration │ ← Depends on File Browser
└──────┬──────┘   └─────────┬──────────┘
       │                    │
       ▼                    ▼
┌──────────────────────────────────────┐
│ 06 Diff Viewer Enhancements          │ ← Depends on Git Integration
└──────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ 07 Theme Switcher (Low Priority)     │
└──────────────────────────────────────┘
```

---

## Backend Changes Summary

| Endpoint | Method | Purpose | New/Modified |
|----------|--------|---------|-------------|
| `/api/vault/content` | GET | Read vault file content | Existing (Phase 21) |
| `/api/vault/file` | PUT | Save/create a vault file | New |
| `/api/vault/tree` | GET | Directory tree of vault files | New |
| `/api/vault/git/status` | GET | Git status for a single file | New |
| `/api/vault/git/statuses` | POST | Batch git statuses | New |
| `/api/vault/git/stage` | POST | Stage a file | New |
| `/api/vault/git/unstage` | POST | Unstage a file | New |
| `/api/vault/git/discard` | POST | Discard unstaged changes | New |
| `/api/vault/git/commit` | POST | Commit staged file with message | New |
| `/api/vault/git/diff` | GET | Get diff output for a file | New |
| `/api/config/public` | GET | Add `artifactBasePath` availability flag | Modified |

All vault/git endpoints validate that `ARTIFACT_BASE_PATH` is configured and enforce path traversal protection using the existing `VaultService` pattern.

---

## Frontend Changes Summary

| Area | Changes |
|------|---------|
| Routing | Add `/viewer`, `/editor` routes; keep `/` (Kanban) and `/diff` |
| Store | New `docSlice` for file state, git state, file browser state |
| API client | New `vaultApi` methods for file CRUD, tree, git operations |
| Components | New `doc/` folder for viewer, editor, file-browser, git components |
| Layout | New `AppNavBar` component for top-level view switching |
| Existing | Diff Viewer enhanced with git comparison modes |

---

## Documentation Updates (Post-Implementation)

After implementation, update these files:

- `README.md` — Add Doc Manager to features, API table, architecture diagram
- `frontend/README.md` — Add new components to tree, routes, store slices
- `docs/SPECIFICATION.md` — Add new API endpoints, frontend components, env var docs
- `docs/TASKS.md` — Mark Phase 22 tasks as complete
- `CLAUDE.md` — Update architecture section with Doc Manager routes and services

---

## Clarifying Questions Addressed

See each sub-feature doc for detailed decisions. Key choices:

1. **Navigation**: Tab bar below the header, not a full sidebar. Kanban remains the default view.
2. **File Browser**: Shared bottom drawer across viewer/editor/diff. Not tied to a specific view.
3. **Git scope**: Single-file operations initially (matching VaultPad). Multi-file staging/commit is a future phase tracked separately.
4. **Diff sources**: Git-aware diffs (committed vs working, staged vs unstaged) plus the existing drop/paste comparison mode. A toggle control switches between comparison types.
5. **Theme**: Low-priority. Stored as a user preference, toggled from header. Does not affect Kanban styling initially.
