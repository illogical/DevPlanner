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
recentWindowCutoff: ISO      → anything updated after this is "recent" (within 2 days of NOW)
totalActivityEvents          → total events in the window

summary.totalCompleted       → cards completed since last digest
summary.totalInProgress      → active cards across all projects
summary.totalBlocked         → blocked cards across all projects
summary.agentClaimableCount  → unassigned upcoming cards agent can start

projects[]:
  slug, name
  recentWindowCutoff         → per-project copy (same value as top-level)
  stats:
    completionsLast7Days     → velocity (last 7 days)
    completionsLast30Days    → velocity (last 30 days)
    avgDaysInProgress        → avg cycle time in days
    wipCount                 → cards in In Progress lane
    backlogDepth             → cards in Upcoming lane
    blockedCount             → blocked cards count
  recentlyCompleted[]        → full card details for cards moved to complete since windowStart
  completedFallback[]        → last 3 completed (by updated) — used when recentlyCompleted is empty
  latestIdeas:
    isRecent: boolean        → true if any cards updated within recentWindowCutoff
    cards[]                  → full card details; if isRecent=true: all recent cards; else: top 5 by updated
  inProgress[]               → active cards (includes tasks[] when taskProgress.total > 0)
    frontmatter.description  → short summary; may be absent for older cards
    frontmatter.links[]      → URL links on the card (doc, spec, ticket, repo, reference, other)
  upcoming.cards[]           → top 5 by lane position (index 0 = highest priority)
  upcoming.totalCount        → full backlog size
  upcoming.hasMore           → true if backlog > 5
  agentClaimable[]           → unassigned/agent-assignable upcoming cards
  recentActivity[]           → HistoryEvent[] for this project in the window
  recentHistory[]            → project history events in the window
```

### Visual Weight Guide

Use consistent formatting to make the digest scannable. Apply this hierarchy for every card in every section:

| Element | Markdown | Visual role |
|---------|----------|-------------|
| Card ID | `*(HX-7)*` — italic, inline with title | Low weight — reference only |
| Title | `### Title` (H3) | Highest weight — always prominent |
| Description | Plain paragraph under title | Medium weight — context |
| Task list | Indented `- [ ]` / `- [x]` bullets | Lower weight — supporting detail |
| Links | `` `[Title](https://...)` `` inline | Inline reference |
| Status/meta | `*italic note*` | Subtle annotation |

Use horizontal rules (`---`) or blank lines between cards for visual separation within a section. Use `##` headings for section titles.

---

### Section Format Guide

Sections appear in this order in the digest:

1. Latest Accomplishments
2. Latest Ideas
3. In Progress
4. Up Next
5. How I Can Help
6. Focus Themes
7. Project Health

---

### Latest Accomplishments

Source: `projects[].recentlyCompleted` (full card details).
Fallback when empty: use `projects[].completedFallback`.

**If `recentlyCompleted` has cards** (work done since last digest): Show all with full details.
**If empty** (no completions since last digest): Show `completedFallback` cards with title + description + relative time ("3 days ago").

```markdown
## Latest Accomplishments

### Build OAuth Login *(HX-7)*
*Completed recently — [Hex]*
Implemented full OAuth2 flow with Google and GitHub providers.
- [x] Set up OAuth2 client
- [x] Session management
- [x] Logout endpoint

---

### Fix card ordering bug *(DE-12)*
*Completed 4 days ago — [DevPlanner]*
Resolved race condition in lane reorder endpoint.
```

---

### Latest Ideas

Source: `projects[].latestIdeas`.

**If `latestIdeas.isRecent = true`** (cards updated within 2 days of NOW): Show all with full details including tasks and links.
**If `latestIdeas.isRecent = false`**: Show top 5 by `updated` with cardId, title, and description only.

Always sort newest `updated` first. Include any `frontmatter.links` as inline links.

```markdown
## Latest Ideas

### Dark Mode Support *(HX-9)*
*Updated 1 day ago — Upcoming · [Hex]*
Add system-preference-based dark mode with persistent user preference.
- [ ] CSS variable theming
- [ ] Toggle component
- [ ] Persist setting to localStorage
[Design spec](https://example.com/design-spec)

---

### Keyboard shortcut system *(HX-11)*
*Updated 2 days ago — In Progress · [Hex]*
Global hotkey registry for power-user navigation.
```

---

### In Progress

Source: `projects[].inProgress`.
Show: cardId, title, description, and only the **first unchecked task** per card.
Sort: cards with `frontmatter.status === "blocked"` first, then by task completion % ascending (least progress = needs most attention).

```markdown
## In Progress

### Build Auth Service *(HX-5)* · 2/5 tasks · high
*[Hex]*
Handles user authentication including JWT issuance and session management.
Next: Write integration tests
⚠️ BLOCKED: Waiting for SSL cert from user

---

### Improve card filtering *(DE-7)* · 1/3 tasks · medium
*[DevPlanner]*
Add multi-field filter support to the Kanban board.
Next: Add tag filter UI
```

---

### Up Next

Source: `projects[].upcoming.cards`. Array order IS priority order.
Never sort by any other field. If `upcoming.hasMore`, append "... and N more in backlog."
Include `cardId` alongside the title when non-null.

```markdown
## Up Next

1. [Hex] *(HX-8)* Implement OAuth login (high) 🤖 agent-claimable
2. [Hex] *(HX-9)* Write API documentation (medium)
3. [DevPlanner] *(DE-11)* Fix file upload bug (high)
```

---

### How I Can Help

Source: `projects[].agentClaimable` + blocked in-progress cards.
Include `cardId` alongside the title when non-null.

```markdown
## How I Can Help

- Start: [Hex] *(HX-8)* Implement OAuth login — agent-claimable, high priority
- Unblock: [DevPlanner] *(DE-11)* Fix file upload bug — currently blocked, I can investigate
```

---

### Focus Themes

Source: aggregate `frontmatter.tags` across `latestIdeas.cards` and `inProgress` cards.
Count tag frequency. Show top 5 tags with a count if > 1. Skip section if no cards have tags.

```markdown
## Focus Themes

auth (4) · ui (3) · performance (2) · refactor (1)
```

---

### Project Health

Source: `projects[].stats`. Flag anomalies explicitly.

| Signal | Threshold | Flag as |
|--------|-----------|---------|
| High cycle time | `avgDaysInProgress > 5` | Slow cycle time |
| WIP overload | `wipCount > 5` | Too much WIP |
| Low backlog | `backlogDepth < 3` | Low backlog |

Only include projects with at least one anomaly. Skip section entirely if all projects are healthy.

---

### Looking Deeper into Cards

Cards may carry URL links with real context about what a feature is for.
Vault artifact files are accessible via `frontmatter.links` entries — they appear as regular links with Obsidian viewer URLs.
When reporting on any in-progress or blocked card, check whether richer context is available:

1. **Check `frontmatter.links`** — look for `kind: "doc"` or `kind: "spec"` entries first. Vault artifact files appear here as links with Obsidian viewer URLs.
2. **Fetch accessible links** — use `WebFetch` for public URLs. Skip links that require authentication.

**When to go deeper:**
- A card whose title is ambiguous — the linked doc or spec explains the full intent
- A card with a `kind: "spec"` or `kind: "doc"` link — these are explicitly reference material

You do not need to fetch every link on every card. Focus on in-progress cards where additional context meaningfully improves your summary.

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

See [api-reference.md](references/api-reference.md) for the full endpoint reference if additional direct API calls are needed beyond the script output.
