# E2E Demo Script for Real-Time Features

## Context

DevPlanner recently completed WebSocket integration (Phases 12-15) with real-time updates, file watching, and visual indicators (animated glows for card creation, movement, updates, and task toggles). Before moving on to the MCP server (Phase 18), we need a way to visually verify all these real-time features work end-to-end. This script simulates external activity against the Kanban board so you can watch the UI respond in real time.

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/e2e-demo.ts` | **Create** — the main demo script |
| `package.json` | **Edit** — add `"demo:e2e"` script |
| `scripts/README.md` | **Edit** — add docs for new script |
| `README.md` | **Edit** — add demo script to Running section |

## Script Design: `scripts/e2e-demo.ts`

### Structure (follows `scripts/verify-websocket.ts` pattern)

- Shebang `#!/usr/bin/env bun`
- Color codes, logging helpers (`log`, `section`, `action`, `watch`, `ok`)
- `sleep(ms)` utility (3-second default pause)
- `api<T>()` typed fetch wrapper for `http://localhost:17103/api`
- Sequential act functions called from `runDemo()`
- 90-second global timeout

### Prerequisites Check (before demo starts)

1. Verify `DEVPLANNER_WORKSPACE` env var is set
2. Verify server is running: `GET /api/projects` — fail fast with helpful message if not
3. If `e2e-demo/` directory exists from a previous run, remove it with `fs.rm()` (same pattern as `src/seed.ts` lines 192-195)

### Demo Flow — 9 Acts with 3-second pauses

**Act 1 — Create Project**
- `POST /api/projects` → `{ name: "E2E Demo", description: "End-to-end demo of real-time features" }`
- Console tells user to watch sidebar for new project appearing
- User should select the project in the sidebar to watch the rest unfold

**Act 2 — Create Cards** (3 cards, pause between each)
1. "Navigation System" → `01-upcoming`, priority: high, assignee: agent, tags: [core, nav]
2. "Hull Integrity Monitor" → `01-upcoming`, priority: medium, assignee: user, tags: [safety, sensors]
3. "Fuel Cell Optimizer" → `02-in-progress`, priority: high, assignee: user, tags: [propulsion], status: in-progress
- Each triggers **blue glow + slide-in** animation (2s)

**Act 3 — Add Tasks** (5 tasks across 2 cards, pause between each)
- Navigation System: "Integrate star chart database", "Build autopilot module", "Implement collision avoidance"
- Fuel Cell Optimizer: "Benchmark current efficiency", "Implement power routing algorithm"
- `POST /api/projects/e2e-demo/cards/:slug/tasks`
- Each triggers **card:updated** event → task progress bar appears/updates

**Act 4 — Toggle Tasks** (check off 2 tasks, pause between each)
- Fuel Cell: task 0 → checked (`PATCH .../tasks/0` with `{ checked: true }`)
- Navigation: task 0 → checked
- Each triggers **green flash + pulse** animation (700ms) on progress bar

**Act 5 — Move Card Between Lanes**
- Move "Navigation System" from upcoming → in-progress
- `PATCH .../cards/navigation-system/move` with `{ lane: "02-in-progress" }`
- Triggers **amber glow** animation (1.5s) in the In Progress lane

**Act 6 — Reorder Cards in Lane**
- Swap order in `02-in-progress`: put navigation-system first, fuel-cell-optimizer second
- `PATCH .../lanes/02-in-progress/order` with `{ order: ["navigation-system.md", "fuel-cell-optimizer.md"] }`
- Cards smoothly swap positions

**Act 7 — Direct File Edit (File Watcher Test)**
- Read `workspace/e2e-demo/02-in-progress/fuel-cell-optimizer.md` from disk
- Parse with `gray-matter`, modify frontmatter: priority high→low, assignee user→agent, add tag "optimized"
- Write back to disk with `gray-matter`'s `matter.stringify()`
- This bypasses the API entirely — tests the **file watcher → WebSocket → UI** pipeline
- Triggers **violet glow** animation (3s)

**Act 8 — Archive a Card**
- `DELETE /api/projects/e2e-demo/cards/hull-integrity-monitor`
- Card disappears from Upcoming lane (moves to Archive)

**Act 9 — Update Project Metadata**
- `PATCH /api/projects/e2e-demo` with updated description
- Tests `project:updated` WebSocket event

**Finale — Activity History**
- `GET /api/projects/e2e-demo/history?limit=20`
- Print formatted table of all recorded events
- Celebratory completion message

### Console Output Style

```
================================================================
  DevPlanner E2E Demo
================================================================
  Server:    http://localhost:17103
  Workspace: /path/to/workspace
  Project:   E2E Demo (e2e-demo)
  Delay:     3s between actions

================================================================
  ACT 1: Setting the Stage
================================================================

  → Creating project "E2E Demo"...
  👀 Watch the sidebar — a new project should appear
     Click on it to watch the rest of the demo!
  ✓ Project created: e2e-demo

  ⏳ pausing 3s...

================================================================
  ACT 2: Populating the Board
================================================================

  → Creating card "Navigation System" in Upcoming...
  👀 Blue glow + slide-in animation in Upcoming lane
  ✓ Card created: navigation-system

  ⏳ pausing 3s...
  ...
```

- **Cyan** for section dividers
- **Blue** for `→` action lines
- **Yellow** for `👀` watch lines
- **Green** for `✓` success lines
- **Red** for errors

### Error Handling

- Wrap each act in try/catch — print error in red but continue to next act
- If project creation fails, abort (all subsequent acts depend on it)
- `api<T>()` helper throws on non-2xx responses with status code and error message

### Dependencies

No new packages needed:
- `gray-matter` — already in `package.json` (for direct file edit step)
- `fs/promises`, `path` — Bun built-ins

## Package.json Change

Add script:
```json
"demo:e2e": "bun scripts/e2e-demo.ts"
```

## README.md Change

Add to the Running section after the `bun test` line:
```bash
# Run E2E demo (exercises real-time features — watch the UI!)
bun run demo:e2e
```

## scripts/README.md Change

Add a section documenting the new script following the existing `verify-websocket.ts` pattern — prerequisites, usage, what it demonstrates, and expected output.

## Verification

1. Start the dev server: `bun run dev`
2. Open `http://localhost:5173` in the browser
3. Run `bun run demo:e2e` in a separate terminal
4. Watch the UI — verify these animations appear:
   - Blue glow on card creation
   - Task progress bars updating as tasks are added/toggled
   - Green flash when tasks are checked off
   - Amber glow when card moves between lanes
   - Violet glow when card is edited via filesystem
   - Card disappearing when archived
   - Activity history populating (open activity panel)
5. Verify console output is clear and well-formatted
