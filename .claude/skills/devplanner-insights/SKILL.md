---
name: devplanner-insights
description: "Extract structured insights from DevPlanner Kanban boards for daily digests, project health reports, and status updates. Use when creating a daily digest, answering what got done today, what is in progress, what are the priorities, what happened since last run, stale work, or what should I work on next. Cards include URL links and attached files with additional context about feature intent — fetch these to deepen understanding of in-progress or blocked work. Runs a bundled script that collects all data in one call. Detects stale boards automatically and outputs a short notice instead of a full digest."
---

# DevPlanner Insights

Structured data extraction from DevPlanner for reporting and digest use.
Run the bundled script — it handles all API calls and staleness detection.
Optionally use the API for follow-up conversations or actions based on the insights.

**Base URL**: `http://192.168.7.45:17103/api`

## Step 1 — Collect Data

```bash
bun .claude/skills/devplanner-insights/scripts/collect-insights.ts
```

Outputs JSON to stdout. Capture it before composing any content.

## Step 2 — Check for Staleness

If `"stale": true` in the output, post only this:

```
No DevPlanner activity since last digest — board unchanged.
```

If `"stale": true`, stop here. Do NOT compose a full digest. Do NOT update `digestAnchor`.
The `message` field explains the last known activity time.

## Step 3 — Compose Digest Sections

**Lane position = priority.** Cards at index 0 are highest priority. When asked to make a card a top priority, reorder it to be at index 0.

### JSON Output Structure

```
stale: boolean               → true = skip full digest
generatedAt: ISO string      → use this when updating digestAnchor
digestAnchor: ISO|null       → timestamp of last successful digest
windowStart: ISO string      → start of the current reporting window
summary.totalCompleted       → cards completed since last digest
summary.totalInProgress      → active cards across all projects
summary.totalBlocked         → blocked cards across all projects
summary.agentClaimableCount  → unassigned upcoming cards agent can start

projects[]:
  slug, name
  stats:
    completionsLast7Days     → velocity (last 7 days)
    completionsLast30Days    → velocity (last 30 days)
    avgDaysInProgress        → avg cycle time in days
    wipCount                 → cards in In Progress lane
    backlogDepth             → cards in Upcoming lane
    blockedCount             → blocked cards count
  recentlyCompleted[]        → cards moved to complete since windowStart
  inProgress[]               → active cards (includes tasks[] when taskProgress.total > 0)
    frontmatter.links[]      → URL links on the card (doc, spec, ticket, repo, reference, other)
    frontmatter.description  → short summary; may be absent for older cards
  upcoming.cards[]           → top 5 by lane position (index 0 = highest priority)
  upcoming.totalCount        → full backlog size
  upcoming.hasMore           → true if backlog > 5
  agentClaimable[]           → unassigned/agent-assignable upcoming cards
  recentActivity[]           → HistoryEvent[] for this project in the window
  recentHistory[]            → project history events in the window
```

### Looking Deeper into Cards

Cards may carry URL links and attached files that contain the real context about what a
feature is for and how it should be implemented. When reporting on any in-progress or
blocked card, check whether richer context is available before summarising:

1. **Check `frontmatter.links`** — look for `kind: "doc"` or `kind: "spec"` entries first.
   These are the most likely to explain the card's purpose and implementation intent.
2. **Fetch accessible links** — use `WebFetch` for public URLs (Obsidian publish sites,
   GitHub issues, spec pages). Skip links that require authentication.
3. **Read card artifact files** — call `GET /projects/{slug}/cards/{card}/files` to list
   attached files, then read `.md` files for implementation notes, specs, and research.

**When to go deeper:**
- A blocked card with no `description` — check links and files to understand why it matters
- A card whose title is ambiguous — the linked doc or spec usually explains the full intent
- A card with a `kind: "spec"` or `kind: "doc"` link — these are explicitly reference material

You do not need to fetch every link on every card. Focus on in-progress and blocked cards
where additional context would meaningfully improve your summary.

### Section Format Guide

**✅ Recently Completed** — source: `projects[].recentlyCompleted`, grouped by project.
If none: *"No completions since last digest."*
Include `cardId` alongside the title when non-null (e.g., `[DE-7]`). Omit bracket when `cardId` is null.
```
✅ Recently Completed
• [DevPlanner] [DE-7] Improve card filtering — 4 tasks done
• [Hex] [HX-3] Set up CI pipeline
```

**🔄 In Progress** — source: `projects[].inProgress`. Show remaining unchecked tasks.
Sort: blocked cards first, then by completion % ascending (least progress = needs most attention).
Include `cardId` alongside the title when non-null.
```
🔄 In Progress
• [Hex] [HX-5] Build auth service (2/5 tasks · high)
  Remaining: Write tests, Deploy to staging
  ⚠️ BLOCKED: Waiting for SSL cert from user
```

**📋 Up Next** — source: `projects[].upcoming.cards`. Array order IS priority order.
Never sort by any other field. If `upcoming.hasMore`, append "... and N more in backlog."
Include `cardId` alongside the title when non-null.
```
📋 Up Next
1. [Hex] [HX-8] Implement OAuth login (high) 🤖 agent-claimable
2. [Hex] [HX-9] Write API documentation (medium)
3. [DevPlanner] [DE-11] Fix file upload bug (high)
```

**🆕 Newly Added** — source: `projects[].recentActivity` filtered to `action === "card:created"`.
Omit section entirely if no new cards.

**🤖 How I Can Help** — source: `projects[].agentClaimable` + blocked in-progress cards.
Include `cardId` alongside the title when non-null.
```
🤖 How I Can Help
• Start: [Hex] [HX-8] Implement OAuth login — agent-claimable, high priority
• Unblock: [DevPlanner] [DE-11] Fix file upload bug — currently blocked, I can investigate
```

**📊 Project Health** — source: `projects[].stats`. Flag anomalies explicitly.

| Signal | Threshold | Flag as |
|--------|-----------|---------|
| High cycle time | `avgDaysInProgress > 5` | Slow cycle time |
| WIP overload | `wipCount > 5` | Too much WIP |
| Blocked cards | `blockedCount > 0` | Always mention |
| Shrinking backlog | `backlogDepth < 3` | Low backlog |

## Step 4 — Update digestAnchor

After successfully composing and sending the digest:

```
PATCH http://192.168.7.45:17103/api/preferences
Content-Type: application/json
{"digestAnchor": "<value of generatedAt from script output>"}
```

Use `generatedAt` (not the current time) to ensure the reporting window is
contiguous with the data that was actually collected.

## NEVER

- **NEVER compose a full digest when `stale: true`.** Output only the stale notice. Do not call additional API endpoints.

- **NEVER update `digestAnchor` if the digest was not sent.** Skipping the anchor update keeps those events visible for the next run.

- **NEVER reorder Up Next cards.** Index 0 in `upcoming.cards[]` is the highest priority card. Position in the lane IS the priority — do not sort by name, date, or priority field.

- **NEVER show all upcoming cards.** The script limits to top 5. Showing a full backlog obscures what actually matters.

- **NEVER omit Project Health when `blockedCount > 0`.** Blocked cards always deserve explicit mention in the digest.

See [api-reference.md](references/api-reference.md) for the full endpoint reference if additional direct API calls are needed beyond the script output.
