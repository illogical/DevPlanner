---
name: devplanner
description: >
  Manage DevPlanner Kanban project boards via REST API — track work, create
  and update cards, toggle tasks, attach artifact files, and move cards between
  lanes. Use when an agent needs to: log or claim tasks in a project board,
  report progress by toggling checklist items, mark work complete, or create
  artifact files attached to cards. Triggers for:
  "check what you should work on", "implement x, y, z", "track these tasks",
  "update your progress", "mark this task done", "create a card for",
  "begin to work on", "what's assigned to me".
---

# DevPlanner

File-based Kanban board API. All state persists to Markdown files — actions are
immediately visible in the web UI and synced to disk.

**Base URL**: `http://localhost:3000/api`

## Workflow

Choose the path that matches the situation:

**Finding work to do?** → [Claiming Existing Work](#claiming-existing-work)
**Starting fresh work that needs tracking?** → [Creating a Card](#creating-a-card)
**Resuming in-progress work?** → Skip to step 4 of whichever path started it

### Claiming Existing Work

```
1. GET /projects                                    → discover available projects
2. GET /projects/{slug}/cards?lane=01-upcoming      → find candidates
   Filter: no assignee, or assignee:"user"
3. GET /projects/{slug}/cards/{card}                → read full card (tasks, context)
4. PATCH /projects/{slug}/cards/{card}              → claim: {"assignee":"agent","status":"in-progress"}
5. PATCH /projects/{slug}/cards/{card}/move         → {"lane":"02-in-progress"}
6. [Work — toggle each task complete as you go]
7. POST /projects/{slug}/cards/{card}/files         → create summary.md (required)
8. PATCH /projects/{slug}/cards/{card}/move         → {"lane":"03-complete"}
```

### Creating a Card

```
1. POST /projects/{slug}/cards                      → {"title":"...","lane":"01-upcoming","assignee":"agent"}
2. PATCH /projects/{slug}/cards/{card}              → set content with brief description if needed
3. POST /projects/{slug}/cards/{card}/tasks         → add each subtask (one request per task)
4. PATCH /projects/{slug}/cards/{card}/move         → {"lane":"02-in-progress"}
5. [Work — toggle each task complete as you go]
6. POST /projects/{slug}/cards/{card}/files         → create summary.md
7. PATCH /projects/{slug}/cards/{card}/move         → {"lane":"03-complete"}
```

## Toggling Tasks

Tasks use **0-based indexing**. Read the card first to confirm current task indices before toggling.

```
GET /projects/{slug}/cards/{card}                   → inspect tasks[] array
PATCH /projects/{slug}/cards/{card}/tasks/{index}   → {"checked": true}
```

## Creating Artifact Files

Attach files at natural checkpoints — not only at completion. Use `POST /projects/{slug}/cards/{card}/files`.

| When to create | Filename |
|----------------|----------|
| Before implementing — research, findings | `research.md` |
| Before significant implementation — architecture | `spec.md` |
| After all tasks complete (**required**) | `summary.md` |
| After verification | `test-results.md` |
| When architecture choices are finalized | `decisions.md` |

**Required summary at completion** — use this body:

```json
{
  "filename": "summary.md",
  "content": "# Summary\n\n## Objective\n[What this card was meant to solve]\n\n## Changes Made\n[Specific changes — be concrete, not vague]\n\n## Verification\n[How to confirm it works]\n\n## Notes\n[Edge cases, gotchas, follow-up items]",
  "description": "Completion summary"
}
```

## NEVER

- **NEVER use `PATCH /cards/{card}` to change lanes.** That endpoint only updates metadata (title, status, assignee, etc.). Using it with a `lane` field silently does nothing. The ONLY way to move a card is `PATCH /cards/{card}/move` with `{"lane": "..."}`.

- **NEVER include `- [ ]` or `- [x]` in task text.** The API adds checkbox syntax automatically. Sending `{"text": "- [ ] Do the thing"}` creates a nested double-checkbox in the rendered Markdown. Always send `{"text": "Do the thing"}`.

- **NEVER add tasks without reading the card first.** The card may already have tasks from the human author. Duplicating them pollutes the checklist and breaks 0-based index calculations.

- **NEVER update card `content` for substantial work output.** Use artifact files (`POST /files`) for implementation notes, specs, and summaries. Card content is for a brief description of what the card is — files are for artifacts.

- **NEVER assume project slugs.** Always discover via `GET /projects` unless already confirmed in conversation context. Slugs are lowercase-hyphenated folder names, not display names.

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| 404 card not found | Slug = filename without `.md` | List cards to get correct slug |
| 400 validation error | Invalid field value | Read `message` + `expected` fields in response |
| API unreachable | Server not running | Ask user to run `bun run dev` in DevPlanner directory |

## Lanes

| Slug | Meaning |
|------|---------|
| `01-upcoming` | Backlog / planned |
| `02-in-progress` | Active work |
| `03-complete` | Done |
| `04-archive` | Soft-archived |

See [api-reference.md](references/api-reference.md) for the full endpoint list, request shapes, and all enum values.
