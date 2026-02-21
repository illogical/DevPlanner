---
name: devplanner
description: "Manage DevPlanner Kanban boards via REST API — create, update, and track cards and tasks in real time. Default board is Hex (the agent's personal board); project boards are specified by name. Use when: adding a new card, claiming existing work, toggling tasks complete as work progresses, setting blocked status, moving cards between lanes, or attaching artifact files. Triggers for: create a card for, mark this done, add this to DevPlanner, claim this task, update my progress, I'm blocked on, add tasks for, begin working on, track this work, move to in-progress."
---

# DevPlanner

Real-time Kanban board API. All state persists to Markdown files — actions are
immediately visible in the web UI.

**Base URL**: `http://192.168.7.45:17103/api`

## Default Board

**"Hex" is the default board.** When no project is specified, use `hex` as the slug.
Project boards are only used when the user names a specific project.

```
GET /projects     → lists all boards; use this if uncertain which slug to use
```

## Workflow

**Finding work to do?** → [Claiming Existing Work](#claiming-existing-work)
**Starting fresh work?** → [Creating a Card](#creating-a-card)
**Resuming in-progress work?** → Skip to step 4 of whichever path started it

### Claiming Existing Work

Lane order = priority order. **Cards at the top of a lane are highest priority.**
When choosing what to claim, prefer cards near position 0 of `01-upcoming`.

```
1. GET /projects/hex/cards?lane=01-upcoming    → find candidates (filter: no assignee or assignee:"user")
2. GET /projects/{slug}/cards/{card}           → read full card (existing tasks, context)
3. PATCH /projects/{slug}/cards/{card}         → claim: {"assignee":"agent","status":"in-progress"}
4. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"02-in-progress"}
5. [Work — toggle EACH task complete immediately as you finish it]
6. POST /projects/{slug}/cards/{card}/files    → create summary.md (required before completing)
7. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"03-complete"}
```

### Creating a Card

```
1. POST /projects/{slug}/cards                 → {"title":"...","lane":"01-upcoming","assignee":"agent"}
2. PATCH /projects/{slug}/cards/{card}         → set content with brief description (optional)
3. POST /projects/{slug}/cards/{card}/tasks    → add each subtask (one request per task)
4. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"02-in-progress"}
5. [Work — toggle EACH task complete immediately as you finish it]
6. POST /projects/{slug}/cards/{card}/files    → create summary.md
7. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"03-complete"}
```

## Toggling Tasks

Tasks use **0-based indexing**. Read the card first to get the current task list.
Toggle tasks IMMEDIATELY as each completes — do not batch them at the end.

```
GET /projects/{slug}/cards/{card}                  → inspect tasks[] array (index, text, checked)
PATCH /projects/{slug}/cards/{card}/tasks/{index}  → {"checked": true}
```

## Card Fields Reference

| Field | Type | Notes |
|-------|------|-------|
| `status` | `"in-progress"\|"blocked"\|"review"\|"testing"\|null` | Card workflow state |
| `blockedReason` | `string\|null` | Why blocked. Set alongside `status:"blocked"`. |
| `priority` | `"low"\|"medium"\|"high"\|null` | Urgency level |
| `assignee` | `"user"\|"agent"\|null` | Who owns the card |

**Setting a blocked reason:**
```json
PATCH /projects/{slug}/cards/{card}
{"status":"blocked","blockedReason":"Waiting for API key from user"}
```

**Clearing blocked status:**
```json
{"status":"in-progress","blockedReason":null}
```

## Creating Artifact Files

Attach files at natural checkpoints — not only at completion.

| When to create | Filename |
|----------------|----------|
| Before implementing — research, findings | `research.md` |
| Before significant implementation | `spec.md` |
| After all tasks complete (**required**) | `summary.md` |
| After verification | `test-results.md` |

**Required summary template:**
```json
POST /projects/{slug}/cards/{card}/files
{
  "filename": "summary.md",
  "content": "# Summary\n\n## Objective\n[What this card solved]\n\n## Changes Made\n[Concrete changes]\n\n## Verification\n[How to confirm it works]\n\n## Notes\n[Gotchas, follow-ups]",
  "description": "Completion summary"
}
```

## NEVER

- **NEVER use `PATCH /cards/{card}` to change lanes.** Only `PATCH /cards/{card}/move` with `{"lane":"..."}` moves a card. Using the wrong endpoint silently does nothing to the lane.

- **NEVER include `- [ ]` or `- [x]` in task text.** The API adds checkboxes automatically. `{"text":"- [ ] Do it"}` creates a nested double-checkbox. Always `{"text":"Do it"}`.

- **NEVER add tasks without reading the card first.** Existing tasks from the human author will be duplicated, polluting the checklist and breaking 0-based index positions.

- **NEVER batch task toggling.** Toggle each task the moment it's complete. The board must reflect current reality at all times.

- **NEVER update card `content` for substantial artifacts.** Card content = brief description. Use `POST /files` for implementation notes, specs, and summaries.

- **NEVER assume project slugs.** Use `GET /projects` if the project slug is not confirmed in context. Slugs are lowercase-hyphenated directory names.

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| 404 card not found | Slug = filename without `.md` | List cards to get correct slug |
| 400 validation error | Invalid field value | Read `message` + `expected` in response |
| API unreachable | Server not running | Ask user to run `bun run dev` in DevPlanner directory |

## Lanes

| Slug | Meaning | Priority order |
|------|---------|----------------|
| `01-upcoming` | Backlog / planned | Top = highest priority |
| `02-in-progress` | Active work | Top = most urgent |
| `03-complete` | Done | — |
| `04-archive` | Soft-archived | — |

See [api-reference.md](references/api-reference.md) for the full endpoint reference.
