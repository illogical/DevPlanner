# Feature: Flexible Card Lookup — Slug or Card ID

## Context

DevPlanner cards have two identifiers:
- **Slug** — the filesystem filename (e.g. `feature-auth`), derived from the card title
- **Card ID** — a human-friendly computed identifier (e.g. `DEV-42`), formed from `{project.prefix}-{card.cardNumber}`

Previously all REST endpoints and MCP tools only accepted the **slug** form. AI agents commonly refer to cards by ID (e.g. `DEV-42`), and slight formatting variations (`dev42`, `dev-42`, `DEV42`) all mean the same thing. This caused agents to receive unhelpful 404s when using the ID they see on the board.

**Goal:** Make every card endpoint accept either form, resolve it to the canonical slug transparently, and return a clear error when no matching card exists.

## Implementation

### `src/utils/card-resolver.ts` (new file)

Central resolution utility shared by all three services.

```
resolveCardRef(workspacePath, projectSlug, cardRef) → { lane, slug } | null
```

Resolution order:
1. **Slug lookup** — check if `{cardRef}.md` exists in any lane
2. **ID lookup** — if cardRef matches `/^([A-Za-z]+)-?(\d+)$/i`, scan all cards for matching `cardNumber`
3. Return `null` if neither succeeds

Also exports `slugExists()` for `generateUniqueSlug` (pure file existence check — avoids false positives where slug `mp-1` would match card `MP-1`).

**ID matching rules:**
- Regex: `^([A-Za-z]+)-?(\d+)$` (case-insensitive)
- Prefix is not validated — lookup is already project-scoped, matching by `cardNumber` alone is correct
- `DEV-42`, `dev42`, `DEV42`, `dev-42` all resolve to card #42

### Changed files

| File | Change |
|---|---|
| `src/utils/card-resolver.ts` | New — `resolveCardRef`, `slugExists` |
| `src/services/card.service.ts` | `findCardLane` return type `{ lane, slug } \| null`; updated 4 callers; `generateUniqueSlug` uses `slugExists` |
| `src/services/task.service.ts` | Replaced private `findCardLane`; updated 4 callers |
| `src/services/link.service.ts` | Replaced private `findCardLane`; updated 3 callers |
| `src/services/dispatch.service.ts` | Uses `card.slug` (resolved) for branch name, worktree creation, env var, and stored record |
| `src/routes/dispatch.ts` | GET/cancel/output handlers resolve `cardRef` via `cardService.getCard` before dispatch record lookup |
| `src/mcp/schemas.ts` | All `cardSlug` field descriptions updated to note ID acceptance |
| `docs/openapi.yaml` | `cardSlug` parameter description updated (line 1034) |
| `docs/SPECIFICATION.md` | Slug-matching note updated (line 515) |
| `README.md` | Note added to MCP Server section |

### Error messages

Improved from `Card not found: ${slug}` to `Card '${cardRef}' not found in project '${projectSlug}'` — surfaces the original input and project for clearer agent feedback.

## Tests added

- `src/__tests__/card.service.test.ts` — `describe('ID-based card lookup')`: 10 cases covering slug regression, ID variants, non-existent IDs, `updateCard`/`moveCard`/`deleteCard` with ID, and `generateUniqueSlug` false-positive prevention
- `src/__tests__/task.service.test.ts` — `describe('ID-based card lookup')`: 4 cases
- `src/__tests__/link.service.test.ts` — `describe('ID-based card lookup')`: 4 cases

## Verification

```bash
# Run tests
bun test src/__tests__/card.service.test.ts src/__tests__/task.service.test.ts src/__tests__/link.service.test.ts

# REST smoke test (with server running)
curl http://localhost:17103/api/projects/my-project/cards/DEV-1
curl http://localhost:17103/api/projects/my-project/cards/dev1
# Both should return same card as:
curl http://localhost:17103/api/projects/my-project/cards/feature-auth

# Non-existent card ID
curl http://localhost:17103/api/projects/my-project/cards/DEV-999
# Expected: { "error": "Card 'DEV-999' not found in project 'my-project'" }
```
