# Implementation Plan: Card Artifact Read/Update via REST and MCP (DE-34)

> **Card:** DE-34 — Support artifact updates via API and MCP  
> **Lane:** 01-upcoming  
> **This document** is a self-contained handoff plan. The implementing session should
> read this file in full before touching code. No other artifact file needs to be read.

---

## Objective

Add first-class **card artifact resolve / read / update** support to DevPlanner's REST
API and MCP server. After this feature ships, AI agents can:

1. Resolve a DevPlanner viewer/editor URL → card + artifact identity + metadata.
2. Read a specific attached artifact by card reference or viewer URL.
3. Update an existing attached artifact in place (content + metadata), preserving the
   canonical link URL the user already has.
4. Do all of the above via either REST or MCP.

The key product outcome: the viewer URL the user already has is enough for an agent to
find and refine the right artifact without needing a card slug, link ID, or storage path.

---

## Codebase State (Verified May 2026)

**Entry points:**
- `src/server.ts` — Elysia server; registers all routes in a fixed order
- `src/routes/artifacts.ts` — existing `POST /api/projects/:projectSlug/cards/:cardSlug/artifacts` (create only)
- `src/routes/vault.ts` — low-level vault file endpoints (`GET/PUT/DELETE /api/vault/*`)
- `src/routes/card-context.ts` — `GET /api/projects/:projectSlug/cards/:cardSlug/context`

**Services:**
- `src/services/vault.service.ts` — `readArtifactContent(relativePath)`, `writeArtifactContent(relativePath, content)`, `createArtifact(...)`
- `src/services/link.service.ts` — `addLink(...)`, **`updateLink(projectSlug, cardSlug, linkId, input)`** ← already exists
- `src/services/config.service.ts` — exposes `artifactBaseUrl`, `artifactBasePath`, `fileBrowserBasePath`

**Shared utilities:**
- `src/utils/card-context.ts` — `buildCardContext()` + private `extractVaultPath(url, artifactBaseUrl)`
- `src/utils/history-helper.ts` — `recordAndBroadcastHistory(...)`

**MCP:**
- `src/mcp/tool-handlers.ts` — 18 handlers; includes `resolveCardRef(cardId)` helper that scans all projects
- `src/mcp/schemas.ts` — JSON Schema definitions for all tools
- `src/mcp/types.ts` — TypeScript input/output types

**Types:**
- `src/types/index.ts` — `Card`, `CardLink`, `CardFrontmatter`, `UpdateLinkInput`

**Tests:**
- `src/mcp/__tests__/tool-handlers.test.ts` — primary MCP test file
- `src/__tests__/` — service-level unit tests

**URL format for artifact links (live example):**
```
http://tiny-tower:5173/viewer?path=10-Projects%2Fdevplanner%2Fsupport-artifact-updates-via-api-and-mcp%2F2026-04-25_04-30-44_IMPLEMENTATION-PLAN.md
```
- `ARTIFACT_BASE_URL` env var = `http://tiny-tower:5173/viewer?path=` (the full URL prefix including `?path=`)
- Relative path after URL-decoding = `10-Projects/devplanner/.../filename.md`
- `FILE_BROWSER_BASE_PATH` = the vault root; the decoded path is relative to this
- `ARTIFACT_BASE_PATH` = a subdirectory of `FILE_BROWSER_BASE_PATH`; old artifact links may be relative to this

The existing `extractVaultPath(url, artifactBaseUrl)` in `card-context.ts` slices off the
base URL prefix and URL-decodes the remainder. **This function is private today; it must be
exported** and reused by the new service to avoid logic drift.

---

## Naming Decision

- **Rename** `create_vault_artifact` → `create_card_artifact` in all MCP code
  (schemas, types, tool-handlers).
- Keep the old name only as a **deprecated alias comment** in `SKILL.md` docs —
  no backward-compatible MCP registration needed.

---

## Complete File Change List

| Action | File |
|--------|------|
| **Modify** | `src/utils/card-context.ts` — export `extractVaultPath` |
| **Modify** | `src/services/vault.service.ts` — add `computeHash()` + `getArtifactMetadata()` |
| **Create** | `src/services/card-artifact.service.ts` — resolver + update logic |
| **Create** | `src/routes/card-artifacts.ts` — REST endpoints |
| **Modify** | `src/routes/artifacts.ts` — add GET + PATCH card-scoped artifact routes |
| **Modify** | `src/server.ts` — register `card-artifacts` route |
| **Modify** | `src/mcp/tool-handlers.ts` — add 3 new tools, rename `create_vault_artifact` |
| **Modify** | `src/mcp/schemas.ts` — add 3 new schemas, rename |
| **Modify** | `src/mcp/types.ts` — add 3 new input/output types, rename |
| **Modify** | `src/mcp/__tests__/tool-handlers.test.ts` — new test cases |
| **Modify** | `docs/features/artifact-storage.md` — update with new endpoints/workflow |
| **Modify** | `README.md` — add brainstorm→card→artifact→refinement loop description |
| **Modify** | `.claude/skills/devplanner/SKILL.md` — update agent guidance |

---

## Phase 1 — Export `extractVaultPath` from `card-context.ts`

`extractVaultPath` is currently a private function. Export it so the new service can
import it without duplicating the URL-decoding logic.

**Change in `src/utils/card-context.ts`:**

```diff
-function extractVaultPath(url: string, artifactBaseUrl: string): string | null {
+export function extractVaultPath(url: string, artifactBaseUrl: string): string | null {
```

No other changes in this file. The `buildCardContext` function already imports it locally;
exporting it does not change behavior.

---

## Phase 2 — Add `VaultService` Helpers

Add two methods to `VaultService` in `src/services/vault.service.ts`:

### `computeContentHash(content: string): string`

```ts
import { createHash } from 'crypto';

computeContentHash(content: string): string {
  return 'sha256:' + createHash('sha256').update(content, 'utf-8').digest('hex');
}
```

Make this a plain (non-async) method. Used both for computing the current hash on read
and for comparing against `expectedHash` on write.

### `getArtifactMetadata(relativePath: string): Promise<{ hash: string; sizeBytes: number; lineCount: number }>`

```ts
async getArtifactMetadata(relativePath: string): Promise<{
  hash: string;
  sizeBytes: number;
  lineCount: number;
}> {
  const content = await this.readArtifactContent(relativePath);
  return {
    hash: this.computeContentHash(content),
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    lineCount: content.split('\n').length,
  };
}
```

`readArtifactContent` already handles path traversal protection — no need to repeat it.

---

## Phase 3 — Create `CardArtifactService`

**New file: `src/services/card-artifact.service.ts`**

This is the shared resolver used by both REST and MCP. It must not be duplicated in
route handlers or MCP handlers.

### Core types (define in this file)

```ts
export interface ResolvedCardArtifact {
  projectSlug: string;
  cardSlug: string;
  cardId: string | null;
  link: CardLink;                  // The matched card link
  relativePath: string;            // Vault-relative path (relative to fileBrowserBasePath)
  viewerUrl: string;               // Canonical viewer URL from the link
  hash: string;                    // sha256:... of current content
  sizeBytes: number;
  lineCount: number;
  content?: string;                // Only present when includeContent=true
}

export interface CardArtifactUpdateResult {
  projectSlug: string;
  cardSlug: string;
  cardId: string | null;
  link: CardLink;                  // Updated link (may have new label/kind/updatedAt)
  relativePath: string;
  viewerUrl: string;
  hash: string;                    // sha256:... of NEW content
  updatedAt: string;
}

// Error codes thrown as plain objects (matching existing pattern in codebase)
// { error: 'ARTIFACT_NOT_FOUND', message: string, available?: string[] }
// { error: 'AMBIGUOUS_ARTIFACT_REF', message: string, candidates: AmbiguousCandidate[] }
// { error: 'ARTIFACT_CONFLICT', message: string, currentHash: string }
// { error: 'UNSUPPORTED_ARTIFACT_SOURCE', message: string, url: string }
// { error: 'ARTIFACT_NOT_CONFIGURED', message: string }
```

### Constructor

```ts
constructor(
  private workspacePath: string,
  private vaultService: VaultService,
  private linkService: LinkService,
  private cardService: CardService,
  private projectService: ProjectService,
  private artifactBaseUrl: string,
) {}
```

All services are injected. Instantiate this alongside other services in `server.ts`
route setup (see Phase 5).

### Method: `resolveCardArtifact(input, includeContent?)`

```ts
async resolveCardArtifact(
  input: {
    url?: string;          // Viewer/editor URL — primary for URL-first flow
    projectSlug?: string;
    cardSlug?: string;
    cardId?: string;
    artifactRef?: string;  // linkId | label | path (checked in that order)
  },
  includeContent = false
): Promise<ResolvedCardArtifact>
```

**Resolution algorithm:**

1. **URL-first path** (when `input.url` is provided):
   a. Call `extractVaultPath(input.url, this.artifactBaseUrl)` (the now-exported helper).
   b. If `null` → `UNSUPPORTED_ARTIFACT_SOURCE`.
   c. `relativePath` = the decoded path (may include `10-Projects/` prefix).
   d. If path structure is `10-Projects/{project}/{card}/{file}` or `{project}/{card}/{file}`:
      - Extract `projectSlug` and `cardSlug` from the path segments.
      - Fetch the card via `cardService.getCard(projectSlug, cardSlug)`.
      - Find the link in `card.frontmatter.links` whose URL matches `input.url` exactly.
      - If found → resolved. If card/link not found, fall through to scan.
   e. **Fallback scan**: iterate all projects and cards, find a link where `link.url === input.url`.
   f. If still not found → `ARTIFACT_NOT_FOUND`.

2. **Card-reference path** (when `input.projectSlug`+`input.cardSlug` or `input.cardId`):
   a. Resolve card: if `cardId` provided, use `resolveCardRef(cardId)` pattern from MCP
      (scan all projects, match `card.cardId === cardId` case-insensitively).
   b. If `projectSlug`+`cardSlug` provided, fetch card directly.
   c. Filter `card.frontmatter.links` to only local-vault links
      (those whose `url.startsWith(this.artifactBaseUrl)`).
   d. If no `artifactRef` and only one local link → use it.
   e. If no `artifactRef` and multiple local links → `AMBIGUOUS_ARTIFACT_REF` listing all candidates.
   f. If `artifactRef` provided, match in this priority order:
      - Exact `link.id === artifactRef`
      - Decoded URL match: `extractVaultPath(link.url, ...) === artifactRef`
      - Exact `link.label === artifactRef` (unique only — if multiple match → `AMBIGUOUS_ARTIFACT_REF`)
   g. Non-vault links (external URLs) that match `artifactRef` by ID or label → `UNSUPPORTED_ARTIFACT_SOURCE`.
   h. No match → `ARTIFACT_NOT_FOUND` with list of available artifact labels + IDs.

3. **After resolving link → get `relativePath`:**
   - Call `extractVaultPath(link.url, this.artifactBaseUrl)`.
   - This gives the path relative to `fileBrowserBasePath`.

4. **Get metadata** via `vaultService.getArtifactMetadata(relativePath)`.

5. **If `includeContent`**, read via `vaultService.readArtifactContent(relativePath)`.

6. Return `ResolvedCardArtifact`.

### Method: `updateCardArtifact(input)`

```ts
async updateCardArtifact(input: {
  projectSlug: string;
  cardSlug: string;
  cardId: string | null;
  link: CardLink;
  relativePath: string;
  content?: string;
  label?: string;
  kind?: string;
  expectedHash?: string;
}): Promise<CardArtifactUpdateResult>
```

**Steps:**
1. If `expectedHash` provided:
   - Read current content + compute hash.
   - If hashes differ → `ARTIFACT_CONFLICT` with `currentHash`.
2. If `content` provided:
   - Call `vaultService.writeArtifactContent(relativePath, content)`.
3. If `label` or `kind` provided (or content changed → update `updatedAt`):
   - Call `linkService.updateLink(projectSlug, cardSlug, link.id, { label?, kind? })`.
   - `updateLink` already bumps `frontmatter.version` and `frontmatter.updated`.
4. If only `content` changed (no label/kind update), still call `linkService.updateLink`
   with an empty-ish update just to bump `updatedAt` on the link. Actually — only call
   `updateLink` if label or kind is changing; the file write alone is sufficient for
   content updates. The `link.updatedAt` in the response should reflect the current time.
5. Broadcast WebSocket event:
   ```ts
   wsService.broadcast(projectSlug, {
     type: 'event',
     event: { type: 'link:updated', projectSlug, data: { cardSlug, link: updatedLink } }
   });
   ```
6. Call `recordAndBroadcastHistory(projectSlug, 'artifact:updated', ...)`.
7. Compute hash of new content (read back or compute from input).
8. Return `CardArtifactUpdateResult`.

**Important:** Re-use the same backing file path. The whole point is that the viewer URL
remains valid. Do NOT create a new timestamped file.

---

## Phase 4 — REST Endpoints

**New file: `src/routes/card-artifacts.ts`**  
Contains `POST /api/card-artifacts/resolve`.

**Modify: `src/routes/artifacts.ts`**  
Add `GET` and `PATCH` endpoints for card-scoped artifact read/update.

### 4a. `POST /api/card-artifacts/resolve`

```
POST /api/card-artifacts/resolve
Content-Type: application/json

{
  "url": "http://tiny-tower:5173/viewer?path=...",   // URL-first
  "includeContent": false                              // optional, default false
}
```

OR:

```json
{
  "cardId": "DE-34",
  "artifactRef": "Implementation Plan",
  "includeContent": true
}
```

OR:

```json
{
  "projectSlug": "devplanner",
  "cardSlug": "support-artifact-updates-via-api-and-mcp",
  "artifactRef": "1687eca3-ab4e-4f1e-9859-56a51a330789"
}
```

**Response 200:**

```json
{
  "card": {
    "projectSlug": "devplanner",
    "cardSlug": "support-artifact-updates-via-api-and-mcp",
    "cardId": "DE-34",
    "title": "Support artifact updates via API and MCP"
  },
  "link": {
    "id": "1687eca3-ab4e-4f1e-9859-56a51a330789",
    "label": "Implementation Plan",
    "kind": "doc",
    "url": "http://tiny-tower:5173/viewer?path=..."
  },
  "artifact": {
    "path": "10-Projects/devplanner/support-artifact-updates-via-api-and-mcp/2026-04-25_04-30-44_IMPLEMENTATION-PLAN.md",
    "hash": "sha256:...",
    "lineCount": 494,
    "sizeBytes": 18052,
    "content": "# Implementation Plan..."   // only when includeContent=true
  }
}
```

**Error responses** (use the error object shape from `CardArtifactService`):

| HTTP | Error code | Cause |
|------|-----------|-------|
| 400 | `ARTIFACT_NOT_CONFIGURED` | `ARTIFACT_BASE_URL` not set |
| 400 | `AMBIGUOUS_ARTIFACT_REF` | Multiple label matches; includes `candidates[]` |
| 400 | `UNSUPPORTED_ARTIFACT_SOURCE` | External URL, not a local DevPlanner artifact |
| 404 | `ARTIFACT_NOT_FOUND` | No matching artifact; includes `available[]` when card is known |
| 500 | (generic) | Unexpected error |

### 4b. `GET /api/projects/:projectSlug/cards/:cardRef/artifacts/:artifactRef`

`:cardRef` accepts **either** a card slug (e.g., `support-artifact-updates-via-api-and-mcp`)
or a card ID (e.g., `DE-34`). Since `projectSlug` is in the path, resolution stays within
that one project:

```ts
// Resolution within a known project:
let card = await cardService.getCard(projectSlug, cardRef); // try as slug first
if (!card) {
  // try as cardId within this project
  const cards = await cardService.listCards(projectSlug);
  card = cards.find(c => c.cardId?.toLowerCase() === cardRef.toLowerCase()) ?? null;
}
if (!card) throw 404;
```

Then call `cardArtifactService.resolveCardArtifact({ projectSlug, cardSlug: card.slug, artifactRef })` with `includeContent: true`.

**Response 200:**

```json
{
  "cardId": "DE-34",
  "cardSlug": "support-artifact-updates-via-api-and-mcp",
  "artifact": {
    "id": "1687eca3-ab4e-4f1e-9859-56a51a330789",
    "label": "Implementation Plan",
    "kind": "doc",
    "url": "http://tiny-tower:5173/viewer?path=...",
    "path": "10-Projects/devplanner/support-artifact-updates-via-api-and-mcp/2026-04-25_04-30-44_IMPLEMENTATION-PLAN.md",
    "hash": "sha256:...",
    "sizeBytes": 18052,
    "lineCount": 494,
    "content": "# Implementation Plan...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### 4c. `PATCH /api/projects/:projectSlug/cards/:cardRef/artifacts/:artifactRef`

**Request body** (all optional, but at least one required):

```json
{
  "content": "# Updated markdown...",
  "label": "Implementation Plan v2",
  "kind": "spec",
  "expectedHash": "sha256:abc123..."
}
```

Validation:
- At least one of `content`, `label`, `kind` must be present.
- `kind` must be one of: `doc | spec | ticket | repo | reference | other`.
- `label`, if provided, must be non-empty after trim.

**Response 200:**

```json
{
  "ok": true,
  "cardId": "DE-34",
  "cardSlug": "support-artifact-updates-via-api-and-mcp",
  "artifact": {
    "id": "1687eca3-...",
    "label": "Implementation Plan",
    "kind": "doc",
    "url": "http://tiny-tower:5173/viewer?path=...",
    "path": "10-Projects/devplanner/.../2026-04-25_04-30-44_IMPLEMENTATION-PLAN.md",
    "hash": "sha256:...",
    "updatedAt": "2026-05-10T..."
  }
}
```

**Error responses:**

| HTTP | Error code | Cause |
|------|-----------|-------|
| 400 | `AMBIGUOUS_ARTIFACT_REF` | Multiple label matches |
| 404 | `ARTIFACT_NOT_FOUND` | No matching artifact |
| 409 | `ARTIFACT_CONFLICT` | `expectedHash` mismatch; includes `currentHash` |

---

## Phase 5 — Register Routes in `server.ts`

Import and register `cardArtifactRoutes` before the wildcard SPA handler.

Find the route registration block and add:

```ts
import { cardArtifactRoutes } from './routes/card-artifacts.js';

// ... existing routes ...
.use(artifactRoutes(workspacePath))
.use(cardArtifactRoutes(workspacePath))   // ← add after artifactRoutes
.use(vaultRoutes(workspacePath))
```

`cardArtifactRoutes` handles `POST /api/card-artifacts/resolve`.

The `GET` and `PATCH` card-scoped artifact endpoints added to `artifacts.ts` are
automatically included since `artifactRoutes` is already registered.

---

## Phase 6 — MCP Tools

### 6a. Rename `create_vault_artifact` → `create_card_artifact`

In `src/mcp/schemas.ts`, `src/mcp/types.ts`, and `src/mcp/tool-handlers.ts`:

- Rename the schema key from `'create_vault_artifact'` to `'create_card_artifact'`.
- Rename types `CreateVaultArtifactInput` / `CreateVaultArtifactOutput` →
  `CreateCardArtifactInput` / `CreateCardArtifactOutput`.
- Update the tool description to say: _"Creates and attaches a new markdown artifact
  to a DevPlanner card. Use `update_card_artifact` instead if refining an existing
  plan, spec, or notes artifact."_
- Update `src/mcp-server.ts` if it registers tools by name.

> **No backward-compatible MCP alias needed.** The SKILL.md will note the old name.

### 6b. Add `resolve_card_artifact`

**Schema (`src/mcp/schemas.ts`):**

```ts
export const RESOLVE_CARD_ARTIFACT_SCHEMA = {
  type: 'object',
  properties: {
    url: { type: 'string', description: 'DevPlanner viewer or editor URL for the artifact.' },
    cardId: { type: 'string', description: 'Card ID, e.g. "DE-34".' },
    projectSlug: { type: 'string' },
    cardSlug: { type: 'string' },
    artifactRef: {
      type: 'string',
      description: 'Link ID (UUID), exact label (unique), or relative vault path. Prefer link ID when available.',
    },
  },
  // At least one of url, cardId, (projectSlug+cardSlug) must be provided.
  // Validate in handler — JSON Schema cannot express this easily.
};
```

**Types (`src/mcp/types.ts`):**

```ts
export interface ResolveCardArtifactInput {
  url?: string;
  cardId?: string;
  projectSlug?: string;
  cardSlug?: string;
  artifactRef?: string;
}

export interface ResolveCardArtifactOutput {
  cardId: string | null;
  cardSlug: string;
  card: { projectSlug: string; cardSlug: string; cardId: string | null; title: string };
  link: { id: string; label: string; kind: string; url: string };
  artifact: { path: string; hash: string; lineCount: number; sizeBytes: number };
}
```

**Handler (`src/mcp/tool-handlers.ts`):**

```ts
case 'resolve_card_artifact': {
  const input = args as ResolveCardArtifactInput;
  // Use cardArtifactService.resolveCardArtifact(input, false)
  // Map CardArtifactService errors to structured MCPError responses
  ...
}
```

Tool description: _"Resolve a DevPlanner viewer/editor URL or card + artifact reference
to card and artifact identity metadata. Returns path, hash, size — no file content.
Use when the user gives you a DevPlanner viewer URL or you need to confirm artifact
identity before reading or updating. Follow with `read_card_artifact` or
`update_card_artifact`."_

### 6c. Add `read_card_artifact`

Same input schema as `resolve_card_artifact`, but always fetches full content.

**Output:**

```ts
export interface ReadCardArtifactOutput {
  cardId: string | null;
  cardSlug: string;
  artifact: {
    id: string;
    label: string;
    kind: string;
    path: string;
    url: string;
    hash: string;
    sizeBytes: number;
    lineCount: number;
    content: string;
    createdAt: string;
    updatedAt: string;
  };
}
```

Tool description: _"Read the full content of a card artifact. Accepts a DevPlanner
viewer/editor URL, a card ID + artifact label, or a card slug + link ID. Returns the
current content and a hash for use with `update_card_artifact`. Use `resolve_card_artifact`
first if you only need metadata."_

**Handler:** calls `cardArtifactService.resolveCardArtifact(input, true)`.

### 6d. Add `update_card_artifact`

**Schema:**

```ts
export const UPDATE_CARD_ARTIFACT_SCHEMA = {
  type: 'object',
  properties: {
    url:         { type: 'string' },
    cardId:      { type: 'string' },
    projectSlug: { type: 'string' },
    cardSlug:    { type: 'string' },
    artifactRef: { type: 'string' },
    content:     { type: 'string', description: 'Full replacement content for the artifact.' },
    label:       { type: 'string' },
    kind:        { type: 'string', enum: ['doc','spec','ticket','repo','reference','other'] },
    expectedHash:{ type: 'string', description: 'sha256:... hash from a prior read. If provided and stale, returns 409 ARTIFACT_CONFLICT.' },
  },
};
```

**Types:**

```ts
export interface UpdateCardArtifactInput {
  url?: string;
  cardId?: string;
  projectSlug?: string;
  cardSlug?: string;
  artifactRef?: string;
  content?: string;
  label?: string;
  kind?: string;
  expectedHash?: string;
}

export interface UpdateCardArtifactOutput {
  cardId: string | null;
  cardSlug: string;
  artifact: {
    id: string;
    label: string;
    kind: string;
    path: string;
    url: string;
    hash: string;
    updatedAt: string;
  };
  message: string;
}
```

**Handler:** calls `cardArtifactService.resolveCardArtifact(input, false)` to resolve,
then `cardArtifactService.updateCardArtifact(...)`.

Tool description: _"Update an existing card artifact in place. Use this instead of
`create_card_artifact` when refining an existing implementation plan, spec, summary,
or notes artifact. Preserves the canonical viewer URL — the user's existing link
remains valid after the update. Supply `expectedHash` from a prior `read_card_artifact`
call to guard against stale overwrites. After updating, verify with `get_card_context`."_

### 6e. Error handling in MCP handlers

Map `CardArtifactService` error objects to structured MCP errors. The existing MCP
handlers throw `new MCPError(...)` — follow the same pattern:

```ts
if (err?.error === 'AMBIGUOUS_ARTIFACT_REF') {
  throw new MCPError(
    err.message,
    { candidates: err.candidates, suggestedNextCall: { tool: 'read_card_artifact', input: { artifactRef: err.candidates[0].linkId } } }
  );
}
if (err?.error === 'ARTIFACT_CONFLICT') {
  throw new MCPError(
    err.message,
    { currentHash: err.currentHash, suggestedNextCall: { tool: 'read_card_artifact', input: {} } }
  );
}
// etc.
```

---

## Phase 7 — Tests

### Primary test file: `src/mcp/__tests__/tool-handlers.test.ts`

Follow the existing pattern (temp workspace, `beforeEach`/`afterEach` with `mkdtemp`/`rm`).
The test setup will need a real or mocked `VaultService`. Check if existing tests mock it
or write to temp directories — follow the existing pattern.

**New test cases to add:**

1. **`resolve_card_artifact` by URL** — create a card + artifact, then resolve using
   the viewer URL returned by `create_card_artifact`. Assert card/link/path metadata returned.

2. **`resolve_card_artifact` by cardId + label** — same card, resolve by `{ cardId, artifactRef: label }`.

3. **`read_card_artifact` by cardId + label** — assert `content` matches what was written.

4. **`read_card_artifact` by link ID** — assert same result as label-based read.

5. **Ambiguous label → `AMBIGUOUS_ARTIFACT_REF`** — create two artifacts with the same label,
   attempt to resolve by label, assert error with `candidates[]`.

6. **`update_card_artifact` — content update** — read hash, update content, assert new hash
   differs, assert original `link.url` unchanged (viewer URL preserved), assert
   `get_card_context` returns updated content.

7. **`update_card_artifact` — label + kind update** — assert link metadata updated in card
   frontmatter, old label no longer matches.

8. **`update_card_artifact` — `expectedHash` success** — supply correct hash, assert success.

9. **`update_card_artifact` — `expectedHash` mismatch → `ARTIFACT_CONFLICT`** — supply wrong
   hash, assert 409/error with `currentHash` in response.

10. **Card ID alias in REST GET** — `GET /api/projects/devplanner/cards/DE-34/artifacts/<ref>`
    should return same as `GET .../cards/support-artifact-updates-via-api-and-mcp/artifacts/<ref>`.

11. **`POST /api/card-artifacts/resolve` with URL** — integration-style test if REST
    integration tests exist in the test suite; otherwise add as a handler unit test.

Run with:
```bash
bun test src/mcp/__tests__/tool-handlers.test.ts
```

---

## Phase 8 — Documentation Updates

### 8a. `docs/features/artifact-storage.md`

Add or update the following sections:

- **Creating an artifact** — existing, update any stale path/URL format references.
- **Resolving an artifact** — `POST /api/card-artifacts/resolve`; both URL-first and
  card-reference examples.
- **Reading an artifact** — `GET /api/projects/:slug/cards/:cardRef/artifacts/:artifactRef`.
- **Updating an artifact** — `PATCH` same path; explain `expectedHash` optional concurrency.
- **When to use card-artifact endpoints vs. raw vault endpoints** — card-artifact endpoints
  preserve link identity, metadata, history, and WebSocket refresh; use raw vault endpoints
  only for the file browser or files not attached to a card.
- **Viewer URL path compatibility** — document the `10-Projects/` prefix handling and
  `FILE_BROWSER_BASE_PATH` relationship.

### 8b. `README.md`

Add a short section (after the existing quick-start) titled
**"Brainstorm → Card → Artifact → Refinement Workflow"** explaining:

1. Agent brainstorms/summarizes in conversation.
2. Agent creates a DevPlanner card.
3. Agent attaches an implementation-plan artifact (`create_card_artifact`).
4. Agent shares the viewer URL with the user.
5. User reviews in DevPlanner viewer; gives AI agent feedback.
6. Agent calls `resolve_card_artifact` or `read_card_artifact` to load the artifact.
7. Agent calls `update_card_artifact` to refine in place — viewer URL stays valid.
8. Agent verifies with `get_card_context`.

### 8c. `.claude/skills/devplanner/SKILL.md`

Add or update the **Creating Vault Artifacts** section:

```md
## Card Artifacts (Read/Update)

### Resolving an artifact

When the user gives you a DevPlanner viewer/editor URL, call `resolve_card_artifact`
first to confirm artifact identity before reading or updating.

When the user references a card by ID (e.g. "update HE-14's implementation plan"),
call `get_card_context` first. If only one artifact is attached, use it by default.
If multiple artifacts exist, prefer an exact label match or call `resolve_card_artifact`
with `cardId` + `artifactRef`.

### Reading an artifact

Use `read_card_artifact` when you need the full content of one specific artifact.
Prefer `get_card_context` when you need all card context at once.

### Updating an artifact

Use `update_card_artifact` to refine an existing implementation plan, spec, summary,
or notes artifact. Do NOT call `create_card_artifact` to create a "v2" duplicate.

Supply `expectedHash` from a prior `read_card_artifact` call when possible; omit it
for simple single-agent workflows.

After updating, verify by calling `get_card_context` or `read_card_artifact` to confirm
the canonical content reflects the update.

### Creating an artifact

Use `create_card_artifact` when a genuinely new document is needed. The old name
`create_vault_artifact` is deprecated — do not use it in new agent workflows.
```

---

## Acceptance Criteria

### REST

- [ ] `POST /api/card-artifacts/resolve` resolves a live DevPlanner viewer URL →
      card/link/artifact metadata
- [ ] `POST /api/card-artifacts/resolve` with `includeContent: true` returns file content
- [ ] `POST /api/card-artifacts/resolve` with `cardId` + `artifactRef` (label) returns same result
- [ ] `GET /api/projects/devplanner/cards/DE-34/artifacts/<ref>` returns artifact content
- [ ] `GET .../cards/support-artifact-updates-via-api-and-mcp/artifacts/<ref>` also works
- [ ] `PATCH .../cards/DE-34/artifacts/<ref>` updates backing file, not a new file
- [ ] After PATCH, `GET /context` returns updated content
- [ ] After PATCH, `link.url` in card frontmatter is unchanged (viewer URL preserved)
- [ ] PATCH with correct `expectedHash` → 200
- [ ] PATCH with stale `expectedHash` → 409 `ARTIFACT_CONFLICT` with `currentHash`
- [ ] Ambiguous label → 400 `AMBIGUOUS_ARTIFACT_REF` with `candidates[]`

### MCP

- [ ] `resolve_card_artifact({ url: "..." })` → card/link/artifact metadata (no content)
- [ ] `resolve_card_artifact({ cardId: "DE-34", artifactRef: "Implementation Plan" })` →
      same artifact
- [ ] `read_card_artifact(...)` → artifact content + hash
- [ ] `update_card_artifact({ cardId: "DE-34", artifactRef: "...", content: "..." })` →
      updates same backing file; `get_card_context` reflects new content
- [ ] `update_card_artifact` with wrong `expectedHash` → structured `ARTIFACT_CONFLICT` error
      with `suggestedNextCall`
- [ ] `create_card_artifact` works (renamed from `create_vault_artifact`)
- [ ] MCP errors are structured and include suggested next calls where relevant

### Docs

- [ ] `docs/features/artifact-storage.md` documents create/resolve/read/update semantics
- [ ] `README.md` describes the artifact refinement loop
- [ ] `.claude/skills/devplanner/SKILL.md` updated with `resolve_card_artifact`,
      `read_card_artifact`, `update_card_artifact` guidance; `create_vault_artifact`
      marked deprecated

---

## Key Implementation Pitfalls

1. **Do not duplicate `extractVaultPath`** — export it from `card-context.ts` (Phase 1)
   and import it in `card-artifact.service.ts`. If path-decoding logic drifts, card context
   and artifact reads will disagree.

2. **Viewer URL format has a `?path=` query param** — `ARTIFACT_BASE_URL` ends with `?path=`
   (e.g. `http://tiny-tower:5173/viewer?path=`). The `extractVaultPath` function slices off
   that full prefix. Do not assume the URL structure; use the config value.

3. **Paths may have a `10-Projects/` prefix** — live artifact paths look like
   `10-Projects/devplanner/card-slug/2026-...md`. When inferring project+card from a path,
   strip this prefix first. `VaultService.readArtifactContent` treats paths as relative to
   `fileBrowserBasePath`, so this prefix is part of the valid relative path.

4. **Update writes to the same file** — do not create a new timestamped file during
   `updateCardArtifact`. The entire value of this feature is that the canonical viewer URL
   stays valid after refinement.

5. **`LinkService.updateLink` already exists** — use it for label/kind updates. Do not
   try to patch the card frontmatter directly; `updateLink` handles locking + versioning.

6. **WebSocket event for content-only updates** — broadcast `link:updated` when content
   changes even if link metadata (label, kind) does not change. This ensures open UIs
   refresh the artifact preview.

7. **Card ID resolution in REST routes** — REST routes have `:projectSlug` in the path,
   so card ID lookup stays within that project. Try card slug first (fast path), then
   scan by cardId within the project (slower but correct).

8. **MCP `resolveCardRef` is a local helper** — it currently lives inside `tool-handlers.ts`
   and scans all projects. Extract it into `CardArtifactService` or a shared util so both
   REST and MCP can use it without duplication.

---

## Handoff Summary for Implementing Session

> "Implement DE-34 using this plan as the canonical spec. Start by exporting
> `extractVaultPath` from `card-context.ts`. Then build `CardArtifactService` in
> `src/services/card-artifact.service.ts` as the single resolver used by both REST and MCP.
> Add the three REST endpoints (`POST /api/card-artifacts/resolve`, `GET` and `PATCH`
> card-scoped artifact routes). Rename `create_vault_artifact` to `create_card_artifact`
> in all MCP code and add `resolve_card_artifact`, `read_card_artifact`, and
> `update_card_artifact` tools. Add tests covering URL-first and card-reference flows,
> hash conflict protection, and `get_card_context` reflecting updated artifact content.
> Update `docs/features/artifact-storage.md`, `README.md`, and
> `.claude/skills/devplanner/SKILL.md` with the card-artifact terminology and workflow.
> Do NOT create a new timestamped file during artifact updates — preserve the canonical
> viewer URL. Toggle each DE-34 task complete in DevPlanner as you finish it."
