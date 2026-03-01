---
name: devplanner
description: "API client for managing DevPlanner Kanban boards — cards, tasks, URL links, and artifact files tracked in real time. Default board is Hex; project boards specified by name. Use when: adding a new card, claiming existing work, toggling tasks complete, setting blocked status, moving cards between lanes, attaching reference files, or adding URL links to cards. Triggers for: create a card for, mark this done, add this to DevPlanner, claim this task, update my progress, I'm blocked on, add tasks for, begin working on, track this work, move to in-progress, link that to a card, add that link to a card, attach this URL to a card."
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
2. GET /projects/{slug}/cards/{card}           → read full card (existing tasks, links, context)
3. PATCH /projects/{slug}/cards/{card}         → claim: {"assignee":"agent","status":"in-progress"}
4. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"02-in-progress"}
5. [Work — toggle EACH task complete immediately as you finish it]
6. Ensure card has spec + summary links via `/links` (minimum 2 links on completion)
7. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"03-complete"}
```

### Creating a Card

**Title**: 1–4 words. **Description**: 1–5 sentences summarising what the card is for.

```
1. POST /projects/{slug}/cards                 → {"title":"Short Title","description":"1–5 sentence summary.","lane":"01-upcoming"}
2. POST /projects/{slug}/cards/{card}/tasks    → add each subtask (one request per task)
3. POST /projects/{slug}/cards/{card}/files    → {"filename":"INTRO.md","content":"# ...\n\nFull plan/instructions.","description":"File's purpose in 1 sentence"}
4. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"02-in-progress"}
5. [Work — toggle EACH task complete immediately as you finish it]
6. Create Scribe summary artifact in Obsidian and attach summary link via `/links`
7. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"03-complete"}
```

## Toggling Tasks

Tasks use **0-based indexing**. Read the card first to get the current task list.
Toggle tasks IMMEDIATELY as each completes — do not batch them at the end.

```
GET /projects/{slug}/cards/{card}                  → inspect tasks[] array (index, text, checked)
PATCH /projects/{slug}/cards/{card}/tasks/{index}  → {"checked": true}
```

## Managing Links

Attach structured URL references to cards. Use when the user shares a URL to associate
with a card — Obsidian docs, specs, tickets, repos, or any relevant external resource.

```
POST /projects/{slug}/cards/{card}/links
  → {"label":"Obsidian Design Doc","url":"https://...","kind":"doc"}
  → Returns {"link": {id, label, url, kind, createdAt, updatedAt}}

PATCH /projects/{slug}/cards/{card}/links/{linkId}
  → Partial update: {label?, url?, kind?}

DELETE /projects/{slug}/cards/{card}/links/{linkId}
  → Returns {"success": true}
```

**Read the card first** to check `frontmatter.links` before adding — avoid duplicates.

| Kind        | When to use                                               |
| ----------- | --------------------------------------------------------- |
| `doc`       | Documentation or wiki page (Obsidian, Notion, Confluence) |
| `spec`      | Technical specification or RFC                            |
| `ticket`    | Issue tracker link (GitHub Issue, Jira, Linear)           |
| `repo`      | Source code repository or PR                              |
| `reference` | Reference material (article, tutorial)                    |
| `other`     | Fallback for anything else                                |

## Card Identifiers

Every card response includes a `cardId` (e.g., `DE-12`) — a short human-readable
identifier useful as **conversation shorthand** between the agent and the user
(e.g., "I've completed DE-12" or "let's look at DE-12").

- Format: `{PREFIX}-{N}` where PREFIX is 2–4 uppercase letters unique to the project
- `cardId` is `null` for cards created before the numbering system (backward compat)
- **API endpoints still use `cardSlug`** (the filename slug), not `cardId`
  To act on a card referenced as "DE-12", call `GET /projects/{slug}/cards`
  and match on `cardId` to find the correct `slug`

## Card Fields Reference

| Field           | Type                                                  | Notes                                                                                              |
| --------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `cardId`        | `string\|null`                                        | Short ID e.g. `DE-12`. Computed; read-only. Null for old cards.                                    |
| `description`   | `string\|null`                                        | 1–5 sentence summary of the card. Set on create; update or clear via PATCH.                        |
| `status`        | `"in-progress"\|"blocked"\|"review"\|"testing"\|null` | Card workflow state                                                                                |
| `blockedReason` | `string\|null`                                        | Why blocked. Set alongside `status:"blocked"`.                                                     |
| `priority`      | `"low"\|"medium"\|"high"\|null`                       | Urgency level                                                                                      |
| `assignee`      | `"user"\|"agent"\|null`                               | Who owns the card                                                                                  |
| `links`         | `CardLink[]`                                          | URL references attached to the card. Each has `id`, `label`, `url`, `kind`. Add via POST `/links`. |

**Setting a blocked reason:**

```json
PATCH /projects/{slug}/cards/{card}
{"status":"blocked","blockedReason":"Waiting for API key from user"}
```

**Clearing blocked status:**

```json
{ "status": "in-progress", "blockedReason": null }
```

## Creating Artifact Files

Attach files at natural checkpoints — not only at completion.

| When to create                           | Filename          |
| ---------------------------------------- | ----------------- |
| Before implementing — research, findings | `research.md`     |
| Before significant implementation        | `spec.md`         |
| After all tasks complete (**required**)  | `summary.md`      |
| After verification                       | `test-results.md` |

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

- **NEVER include `- [ ]` or `- [x]` in task text.** The API adds checkboxes automatically. Always `{"text":"Do it"}` not `{"text":"- [ ] Do it"}`.

- **NEVER add tasks without reading the card first.** Existing tasks from the human author could be redundant, avoid redundancy.

- **NEVER batch task toggling.** Toggle each task the moment it's complete. The board must reflect current reality at all times.

- **NEVER rely on card-level files for core project documentation.** Prefer Obsidian artifacts + `/links` attachments; keep `description` short (1–5 sentence summary).

- **NEVER assume project slugs.** Use `GET /projects` if the project slug is not confirmed in context. Slugs are lowercase-hyphenated directory names.

- **NEVER add a duplicate URL to the same card.** The API returns `409 DUPLICATE_LINK`. Read `frontmatter.links` first to check existing links before posting a new one.

## Error Handling

| Error                | Cause                         | Fix                                                                        |
| -------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| 404 card not found   | Slug = filename without `.md` | List cards to get correct slug                                             |
| 400 validation error | Invalid field value           | Read `message` + `expected` in response                                    |
| 409 DUPLICATE_LINK   | URL already on this card      | Check `frontmatter.links`; update the existing link or use a different URL |
| 400 INVALID_URL      | URL missing or not http/https | Ensure URL starts with `http://` or `https://`                             |
| 400 INVALID_LABEL    | Label is empty or whitespace  | Provide a meaningful display label                                         |
| API unreachable      | Server not running            | Ask user to run `bun run dev` in DevPlanner directory                      |

## Lanes

| Slug             | Meaning           | Priority order         |
| ---------------- | ----------------- | ---------------------- |
| `01-upcoming`    | Backlog / planned | Top = highest priority |
| `02-in-progress` | Active work       | Top = most urgent      |
| `03-complete`    | Done              | —                      |
| `04-archive`     | Soft-archived     | —                      |

See [api-reference.md](references/api-reference.md) for the full endpoint reference.
