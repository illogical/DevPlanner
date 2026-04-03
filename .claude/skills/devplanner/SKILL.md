---
name: devplanner
description: "API client for managing DevPlanner Kanban boards — cards, tasks, URL links, and artifact files tracked in real time. Default board is Hex; project boards specified by name. Use when: adding a new card, claiming existing work, implementing a card by ID (e.g. 'implement HE-4'), fetching full card context with artifact contents, toggling tasks complete, setting blocked status, moving cards between lanes, attaching reference files, or adding URL links to cards. Triggers for: create a card for, mark this done, add this to DevPlanner, claim this task, update my progress, I'm blocked on, add tasks for, begin working on, implement card, work on HE-4, pick up DE-12, track this work, move to in-progress, link that to a card, add that link to a card, attach this URL to a card."
---

# DevPlanner

Real-time Kanban board API. All state persists to text files — actions are
immediately visible in the web UI.

**Base URL**: `http://192.168.7.45:17103/api`

## Default Board

**"Hex" is the default board.** When no project is specified, use `hex` as the slug.
Project boards are only used when the user names a specific project.

```
GET /projects     → lists all boards; use this if uncertain which slug to use
```

## Card Context

When asked to implement a specific card (e.g., "implement HE-4"), always start by
fetching its full context. This single call returns everything needed — description,
task checklist, full contents of linked vault artifact files, and external links —
so the agent can understand the work without making multiple API calls.

```
GET /projects/{slug}/cards/{card}/context
```

**Response:**

```json
{
  "cardId": "HE-4",
  "slug": "implement-auth",
  "title": "Implement Auth",
  "description": "Add JWT-based authentication to the API.",
  "tasks": "- [ ] Set up JWT middleware\n- [x] Create user model",
  "artifacts": [
    {
      "label": "Implementation Spec",
      "kind": "spec",
      "path": "hex/implement-auth/2026-03-28_10-00-00_IMPLEMENTATION-SPEC.md",
      "content": "# Implementation Spec\n\nFull file contents here..."
    }
  ],
  "links": [
    { "label": "GitHub Issue #42", "kind": "ticket", "url": "https://github.com/..." }
  ],
  "contextText": "# Card HE-4: Implement Auth\n\n**Lane:** 02-in-progress\n\n## Description\n...\n\n## Tasks\n...\n\n## Artifact: Implementation Spec (spec)\n\n---\n[full file content]\n---\n\n## Links\n- [GitHub Issue #42](https://...) (ticket)"
}
```

- **`artifacts`** — vault-linked documents with **full file contents** already inlined. These contain implementation specs, research notes, plans — everything the human author attached to prepare the card for work.
- **`links`** — external URLs (metadata only, no file content). These are references like GitHub issues, docs, or repos.
- **`contextText`** — a pre-formatted markdown summary of the entire card. Can be used directly as a context block.

**Resolving a `cardId` to a slug:** API endpoints use `cardSlug`, not `cardId`.
To call this endpoint when you only have a `cardId` (e.g., "HE-4"):
1. `GET /projects` → list all projects
2. `GET /projects/{slug}/cards` → for each project, find the card where `cardId` matches
3. Use the matched `slug` and `projectSlug` to call `/context`

## Workflow

**Asked to implement a specific card?** → [Implementing a Card](#implementing-a-card)
**Finding work to do?** → [Claiming Existing Work](#claiming-existing-work)
**Starting fresh work?** → [Creating a Card](#creating-a-card)
**Resuming in-progress work?** → Skip to step 4 of whichever path started it

### Implementing a Card

Use this workflow when the user references a specific card by ID (e.g., "implement HE-4",
"work on HE-4", "pick up DE-12"). The context endpoint gives you everything in one call.

```
1. GET /projects/{slug}/cards/{card}/context   → full context: description, tasks, artifact contents, links
2. Read contextText + artifacts to understand the work scope
3. PATCH /projects/{slug}/cards/{card}         → claim: {"assignee":"agent","status":"in-progress"}
4. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"02-in-progress"}
5. [Work — toggle EACH task complete immediately as you finish it]
6. POST /projects/{slug}/cards/{card}/artifacts → {"label":"Summary","content":"# Summary\n\n...","kind":"doc"}
7. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"03-complete"}
```

The artifacts from step 1 contain the human's implementation plans and specs.
Read them carefully — they define what "done" looks like for this card.

### Claiming Existing Work

Lane order = priority order. **Cards at the top of a lane are highest priority.**
When choosing what to claim, prefer cards near position 0 of `01-upcoming`.

```
1. GET /projects/hex/cards?lane=01-upcoming    → find candidates (filter: no assignee or assignee:"user")
2. GET /projects/{slug}/cards/{card}/context   → [REQUIRED] read full card context (tasks, artifact contents, links)
3. PATCH /projects/{slug}/cards/{card}         → claim: {"assignee":"agent","status":"in-progress"}
4. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"02-in-progress"}
5. [Work — toggle EACH task complete immediately as you finish it]
6. Ensure card has spec + summary artifacts via `/artifacts` (minimum 2 links on completion)
7. PATCH /projects/{slug}/cards/{card}/move    → {"lane":"03-complete"}   ```

Do not skip step 2 — artifact contents and existing tasks on the card inform the work.

### Creating a Card

**Title**: 1–4 words. **Description**: 1–5 sentences summarising what the card is for.

```
1. POST /projects/{slug}/cards                      → {"title":"Short Title","description":"1–5 sentence summary.","lane":"01-upcoming"}
2. POST /projects/{slug}/cards/{card}/tasks         → add each subtask — one POST per task, never batch
3. POST /projects/{slug}/cards/{card}/artifacts     → {"label":"Intro Plan","content":"# ...\n\nFull plan/instructions.","kind":"doc"}
4. PATCH /projects/{slug}/cards/{card}/move         → {"lane":"02-in-progress"}
5. [Work — toggle EACH task complete immediately as you finish it]
6. POST /projects/{slug}/cards/{card}/artifacts     → {"label":"Summary","content":"# Summary\n\n...","kind":"doc"}   ← required before completing
7. PATCH /projects/{slug}/cards/{card}/move         → {"lane":"03-complete"}   ```

**One POST per task — never batch multiple tasks into a single call.**

## Toggling Tasks

Tasks use **0-based indexing**. Read the card first to get the current task list.
Toggle tasks IMMEDIATELY as each completes — do not batch them at the end.

```
GET /projects/{slug}/cards/{card}                  → inspect tasks[] array (index, text, checked)
PATCH /projects/{slug}/cards/{card}/tasks/{index}  → {"checked": true}
PATCH /projects/{slug}/cards/{card}/tasks/{index}  → {"text": "Updated task description"}   (edit text)
```

The task PATCH endpoint accepts `{checked}`, `{text}`, or both in the same call.

## Managing Links

Attach structured URL references to cards. Use when the user shares a URL to associate
with a card — Obsidian docs, specs, tickets, repos, or any relevant external resource.

```
0. GET /projects/{slug}/cards/{card}           → inspect frontmatter.links (required — prevent 409)
1. POST /projects/{slug}/cards/{card}/links    → {"label":"Obsidian Design Doc","url":"https://...","kind":"doc"}
                                                  Returns {"link": {id, label, url, kind, createdAt, updatedAt}}

PATCH /projects/{slug}/cards/{card}/links/{linkId}
  → Partial update: {label?, kind?}   ← url is immutable via PATCH; use delete + re-add to change a URL

DELETE /projects/{slug}/cards/{card}/links/{linkId}
  → Returns {"success": true}
```

### Recovery: 409 DUPLICATE_LINK

The 409 response body includes the existing link:
```json
{ "error": "DUPLICATE_LINK", "message": "...", "existingLink": { "id": "uuid", "label": "...", "url": "...", "kind": "doc" } }
```

Use `existingLink.id` directly — no extra GET needed:
1. If metadata needs updating: `PATCH /links/{existingLink.id}` with `{label?, kind?}` only — **never include `url` in the body**
2. If the existing link is already correct: take no further action — do not retry the POST

The `url` field must NOT appear in any recovery PATCH body. The link already exists with that URL.

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
| `version`       | `number`                                              | Optimistic locking counter. Incremented on each update.                                            |

**Setting a blocked reason:**

```json
PATCH /projects/{slug}/cards/{card}
{"status":"blocked","blockedReason":"Waiting for API key from user"}
```

**Clearing blocked status:**

```json
{ "status": "in-progress", "blockedReason": null }
```

## Creating Vault Artifacts

Write Markdown files directly to the artifact vault. The API automatically writes the file and attaches a link to your card.

**Requires** `ARTIFACT_BASE_URL` and `ARTIFACT_BASE_PATH` in server `.env`.
(Legacy names `OBSIDIAN_BASE_URL` / `OBSIDIAN_VAULT_PATH` still work but are deprecated.)

### Canonical Workflow

```
POST /projects/{slug}/cards/{card}/artifacts
  → {"label":"...", "content":"...", "kind":"doc"}
  → API writes file to {ARTIFACT_BASE_PATH}/{project}/{card}/{TIMESTAMP}_{LABEL-SLUG}.md
  → API auto-attaches link to card
  → Response: { "link": { ... }, "filePath": "..." }
```

**Use the returned `link.url` for all portable references.** The `filePath` is the internal implementation detail and is not guaranteed to be accessible from other clients.

Attach artifacts at natural checkpoints — not only at completion:

| When to create                           | Label                |
| ---------------------------------------- | -------------------- |
| Before implementing — research, findings | `"Research Notes"`   |
| Before significant implementation        | `"Implementation Spec"` |
| After all tasks complete (**required**)  | `"Summary"`          |
| After verification                       | `"Test Results"`     |

**Required summary template:**

```json
POST /projects/{slug}/cards/{card}/artifacts
{
  "label": "Summary",
  "kind": "doc",
  "content": "# Summary\n\n## Objective\n[What this card solved]\n\n## Changes Made\n[Concrete changes]\n\n## Verification\n[How to confirm it works]\n\n## Notes\n[Gotchas, follow-ups]"
}
```

**Response 201:**
```json
{
  "link": {
    "id": "uuid",
    "label": "Summary",
    "url": "https://vaultpad.example.com/view?path=10-Projects%2Fhex%2Fmy-card%2F2026-03-05_14-00-00_SUMMARY.md",
    "kind": "doc",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "filePath": "/absolute/path/to/vault/hex/my-card/2026-03-05_14-00-00_SUMMARY.md"
}
```

The `link.url` is portable and shareable. Use it in references, messages, and cross-references.

**Error 400 `OBSIDIAN_NOT_CONFIGURED`**: Set `ARTIFACT_BASE_URL` and `ARTIFACT_BASE_PATH` in `.env`.

## NEVER

- **Prefer `PATCH /cards/{card}/move` for lane changes.** Both `PATCH /cards/{card}/move` and `PATCH /cards/{card}` accept a `lane` field and will move the card. The `/move` endpoint is the canonical form.

- **NEVER mark a task complete by editing its text to add `[x]`.** Use `PATCH /cards/{card}/tasks/{index}` with `{"checked": true}`. Always use the toggle endpoint, never `{"text":"[x] Do it"}`.

- **NEVER add tasks without reading the card first.** Existing tasks from the human author could be redundant, avoid redundancy.

- **NEVER batch task toggling.** Toggle each task the moment it's complete. The board must reflect current reality at all times.

- **NEVER rely on core project documentation outside of vault artifacts + `/links`.** Keep card `description` short (1–5 sentence summary); put full docs in vault artifacts via `/artifacts`.

- **NEVER assume project slugs.** Use `GET /projects` if the project slug is not confirmed in context. Slugs are lowercase-hyphenated directory names.

- **NEVER add a duplicate URL to the same card.** The API returns `409 DUPLICATE_LINK`. Read `frontmatter.links` first to check existing links before posting a new one.

## Error Handling

| Error                         | Cause                              | Fix                                                                        |
| ----------------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| 404 card not found            | Slug = filename without `.md`      | List cards to get correct slug                                             |
| 400 validation error          | Invalid field value                | Read `message` + `expected` in response                                    |
| 409 DUPLICATE_LINK            | URL already on this card           | GET card, find existing link in `frontmatter.links`, PATCH label/kind only — never include `url` in recovery body |
| 400 INVALID_URL               | URL missing or not http/https      | Ensure URL starts with `http://` or `https://`                             |
| 400 INVALID_LABEL             | Label is empty or whitespace       | Provide a meaningful display label                                         |
| 400 OBSIDIAN_NOT_CONFIGURED   | Missing env vars for vault         | Set `ARTIFACT_BASE_URL` and `ARTIFACT_BASE_PATH` in server `.env`          |
| API unreachable               | Server not running                 | Ask user to run `bun run dev` in DevPlanner directory                      |

## Lanes

| Slug             | Meaning           | Priority order         |
| ---------------- | ----------------- | ---------------------- |
| `01-upcoming`    | Backlog / planned | Top = highest priority |
| `02-in-progress` | Active work       | Top = most urgent      |
| `03-complete`    | Done              | —                      |
| `04-archive`     | Soft-archived     | —                      |

See [api-reference.md](references/api-reference.md) for the full endpoint reference.
