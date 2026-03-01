---
title: DevPlanner card links (URL-first) implementation plan v1
type: spec
created: 2026-02-28
updated: 2026-02-28
tags: [spec, devplanner, links, url-validation, frontend, api]
project: devplanner
status: ready
sources:
  - https://github.com/illogical/DevPlanner/blob/main/README.md
related: []
owner: scribe
---

## Goal

Implement first-class card links in DevPlanner using a URL-first design so links remain portable across devices and clients.

## Scope

- **In scope**: create/read/update/delete links on cards; URL validation; UI rendering and edit flow; fine-grained WebSocket events; history tracking.
- **Out of scope**: local path resolution, rich document preview rendering, metadata scraping, permissions model changes, non-HTTP(S) targets.

## Architecture decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | `links[]` in card YAML frontmatter | Same proven pattern as `taskMeta`. No migration needed — missing field reads as `undefined`. Links are per-card data, not cross-card like files. |
| Service layer | New `src/services/link.service.ts` | Keeps `card.service.ts` from growing further. Follows separation of concerns. |
| Link IDs | `crypto.randomUUID()` | Consistent with history events and WS client IDs. Stable for update/delete (avoids array-index fragility of tasks). |
| WebSocket events | Fine-grained `link:added` / `link:updated` / `link:deleted` | Enables targeted store updates without refetching the entire card. |
| Kind UX | Visible dropdown, defaults to `other` | User can optionally categorize links without being forced to. |

## Requirements

- Validate links as proper URLs on both API and frontend before persisting.
- Store `links[]` in card frontmatter with objects containing `id`, `label`, `url`, `kind`, `createdAt`, and `updatedAt`.
- Require `label` and `url`, default `kind` to `other`, enforce protocol allow list (http/https), trim whitespace, and reject duplicate URLs per card.
- Expose CRUD endpoints for links (`POST /api/projects/:projectSlug/cards/:cardSlug/links`, `PATCH .../:linkId`, `DELETE .../:linkId`), and return `links[]` in the card GET response.
- Return structured API errors (`INVALID_URL`, `INVALID_LABEL`, `DUPLICATE_LINK`, `LINK_NOT_FOUND`).
- Render a `CardLinks` section between the existing `TaskList` and `CardFiles` components with a Label+URL+Kind form, inline validation, and safe target attributes for link launches.
- Broadcast fine-grained `link:added`, `link:updated`, `link:deleted` WebSocket events for real-time sync.
- Record link operations in activity history.

## Acceptance criteria

- [ ] Users can add/edit/remove URLs on cards via both the API and the UI.
- [ ] Server-side and client-side validation consistently reject invalid URLs and empty labels.
- [ ] The Links section appears between Tasks and Files and persists links across reloads.
- [ ] Links CRUD does not regress existing Files attachments or card behavior.
- [ ] Duplicate URLs are blocked per card.
- [ ] WebSocket events for link changes update other connected clients in real time.

## API contract

### Data model — `CardLink`

| Field       | Type   | Required | Description |
|-------------|--------|----------|-------------|
| `id`        | string | yes      | `crypto.randomUUID()` — stable identifier for update/delete. |
| `label`     | string | yes      | Human-readable name (1–200 chars). |
| `url`       | string | yes      | Absolute http/https URL, whitespace-trimmed, WHATWG-validated. |
| `kind`      | enum   | no       | `doc \| spec \| ticket \| repo \| reference \| other` — defaults to `other`. |
| `createdAt` | string | auto     | ISO 8601 timestamp, set by backend on create. |
| `updatedAt` | string | auto     | ISO 8601 timestamp, bumped by backend on every mutation. |

### Endpoints

| Method   | Path | Description |
|----------|------|-------------|
| `POST`   | `/api/projects/:projectSlug/cards/:cardSlug/links` | Create a new link. |
| `PATCH`  | `/api/projects/:projectSlug/cards/:cardSlug/links/:linkId` | Update link fields (partial). |
| `DELETE` | `/api/projects/:projectSlug/cards/:cardSlug/links/:linkId` | Remove a link. |
| `GET`    | `/api/projects/:projectSlug/cards/:cardSlug` | Returns full card including `frontmatter.links[]`. |

### Error codes

| Code | HTTP Status | When |
|------|-------------|------|
| `INVALID_URL` | 400 | URL fails WHATWG parse or protocol is not http/https. |
| `INVALID_LABEL` | 400 | Label is empty or whitespace-only. |
| `DUPLICATE_LINK` | 409 | Normalized URL already exists on this card. |
| `LINK_NOT_FOUND` | 404 | `linkId` does not match any link on this card. |

### Create-link request/response example

Request:
```http
POST /api/projects/my-project/cards/user-auth/links
Content-Type: application/json

{
  "label": "DevPlanner README",
  "url": "https://github.com/illogical/DevPlanner/blob/main/README.md",
  "kind": "reference"
}
```

Response:
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "link": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "label": "DevPlanner README",
    "url": "https://github.com/illogical/DevPlanner/blob/main/README.md",
    "kind": "reference",
    "createdAt": "2026-02-28T18:23:00Z",
    "updatedAt": "2026-02-28T18:23:00Z"
  }
}
```

## Frontend component design

### Placement

Insert `CardLinks` in the card detail side panel (`CardDetailPanel.tsx`) between `TaskList` and the `CardFiles` divider — matching the existing section pattern with `border-t border-gray-700 pt-4`.

### Component: `CardLinks`

- **Props**: `links: CardLink[]`, `cardSlug: string`
- **Empty state**: "No links yet — add a URL to get started."
- **Link list**: Each link renders as a row with:
  - Kind badge (small colored pill — doc=blue, spec=purple, ticket=amber, repo=green, reference=teal, other=gray)
  - Clickable label that opens `url` in new tab (`target="_blank" rel="noopener noreferrer"`)
  - Edit (pencil) and Delete (trash) icon buttons
- **Add form**: Toggled by "+ Add Link" button. Fields:
  - Label (text input, required, max 200 chars)
  - URL (text input, required)
  - Kind (dropdown, defaults to `other`, optional to change)
  - "Save" and "Cancel" buttons
  - Live inline validation — red border + message for empty label, invalid URL, duplicate URL
- **Edit mode**: Clicking edit on an existing link replaces the row with the same form pre-filled. URL changes re-validate for duplicates (excluding self).
- Follow existing styling conventions from `CardFiles.tsx` and `TaskList.tsx` for visual consistency.

## Codebase reference — patterns to follow

These are the specific files and patterns the implementing agent should study and mirror:

### Backend patterns

| Pattern | Reference file | Key details |
|---------|---------------|-------------|
| Service with per-card locking | `src/services/task.service.ts` | `acquireLock()` / `findCardLane()` private methods, reads card `.md` via `MarkdownService.parse()`, mutates frontmatter, serializes with `MarkdownService.serialize()`, writes file. **LinkService must replicate this pattern.** |
| Route factory | `src/routes/tasks.ts` | Factory function `taskRoutes(workspacePath)` returning `new Elysia()` chain. Uses `t.Object({...})` for body validation. Broadcasts WS event + records history after each mutation. |
| Type definitions | `src/types/index.ts` | `CardFrontmatter` (line ~27), `WebSocketEventType` union (line ~127), `HistoryActionType` union (line ~248), event payload interfaces. |
| Route registration | `src/server.ts` (line ~76) | `.use(taskRoutes(workspacePath))` chain — add `.use(linkRoutes(workspacePath))` after it. |
| Frontmatter array serialization | `taskMeta` field in `CardFrontmatter` | Proves that arrays of objects round-trip cleanly through `gray-matter` YAML. `links[]` will work identically. |
| History recording | `src/utils/history-helper.ts` | `recordAndBroadcastHistory(projectSlug, action, description, metadata)` — called from routes after mutations. |
| Structured errors | `src/types/index.ts` `ApiError` interface | `{ error: string, message: string, expected?: string }` — all link errors should follow this shape. |

### Frontend patterns

| Pattern | Reference file | Key details |
|---------|---------------|-------------|
| Card detail panel layout | `frontend/src/components/card-detail/CardDetailPanel.tsx` (line ~89) | Sections render in order: `CardMetadata` → `CardContent` → `TaskList` → `CardFiles`. Insert `CardLinks` between `TaskList` (line ~95) and the `CardFiles` div (line ~99). |
| Card-related component | `frontend/src/components/card-detail/CardFiles.tsx` | Section styling, header pattern, empty state, item list — follow this pattern for `CardLinks`. |
| API client | `frontend/src/api/client.ts` | `tasksApi` object (line ~165) — add `linksApi` with same `fetchJSON` wrapper pattern. |
| Zustand store | `frontend/src/store/index.ts` | Actions call API → update state → record local action for WS echo suppression. WS handlers at line ~1267+ check `_isRecentLocalAction()` before applying. File WS handlers (line ~1639+) are the best template for link WS handlers. |
| Frontend types | `frontend/src/types/index.ts` | Mirrors backend types manually. `CardFrontmatter` (line ~26) — add `links?: CardLink[]`. Also add `CardLink`, `CreateLinkInput`, `UpdateLinkInput`, and WS event data types. |
| WS event dispatch | `frontend/src/services/` or store | Find where `file:added` etc. are dispatched and add `link:added`, `link:updated`, `link:deleted` cases. |

## Implementation checklist

### Phase 1 — Backend: types, service, routes

#### Step 1.1: Define types in `src/types/index.ts`

- [ ] Add `CardLink` interface: `{ id: string; label: string; url: string; kind: 'doc' | 'spec' | 'ticket' | 'repo' | 'reference' | 'other'; createdAt: string; updatedAt: string }`
- [ ] Add `links?: CardLink[]` to `CardFrontmatter` (after `taskMeta` field, line ~39)
- [ ] Add `CreateLinkInput`: `{ label: string; url: string; kind?: CardLink['kind'] }`
- [ ] Add `UpdateLinkInput`: `{ label?: string; url?: string; kind?: CardLink['kind'] }`
- [ ] Add to `WebSocketEventType` union (line ~127): `| 'link:added' | 'link:updated' | 'link:deleted'`
- [ ] Add WS payload interfaces: `LinkAddedData { cardSlug: string; link: CardLink }`, `LinkUpdatedData { cardSlug: string; link: CardLink }`, `LinkDeletedData { cardSlug: string; linkId: string }`
- [ ] Add to `HistoryActionType` (line ~248): `| 'link:added' | 'link:updated' | 'link:deleted'`
- [ ] Add to `HistoryEventMetadata`: `linkId?: string; linkLabel?: string`

#### Step 1.2: Create `src/services/link.service.ts`

- [ ] Model after `src/services/task.service.ts`
- [ ] Constructor takes `workspacePath`
- [ ] Private `findCardLane()` — search all `ALL_LANES` from `src/constants.ts` (same implementation as TaskService)
- [ ] Private `acquireLock()` — per-card mutex via Map (same implementation as TaskService)
- [ ] Private `validateUrl(url: string): string` — trim whitespace, `new URL(url)`, check `protocol` is `http:` or `https:`, return normalized `.href`. Throw `{ error: 'INVALID_URL', message: '...' }` on failure.
- [ ] Private duplicate check — compare normalized `.href` values of existing `links[]` vs. new/updated URL
- [ ] `addLink(projectSlug, cardSlug, input: CreateLinkInput): Promise<CardLink>` — validate label (non-empty after trim), validate URL, check duplicates, generate `id` via `crypto.randomUUID()`, default `kind` to `'other'`, set timestamps, push to `frontmatter.links` (init array if `undefined`), bump `frontmatter.updated`, serialize and write. Return new `CardLink`.
- [ ] `updateLink(projectSlug, cardSlug, linkId, input: UpdateLinkInput): Promise<CardLink>` — find by `id`, apply partial updates, re-validate URL if changed, check duplicate if URL changed (excluding self), bump `updatedAt` + `frontmatter.updated`, write. Throw `LINK_NOT_FOUND` if missing.
- [ ] `deleteLink(projectSlug, cardSlug, linkId): Promise<void>` — find and splice by `id`, bump `frontmatter.updated`, write. Throw `LINK_NOT_FOUND` if missing.
- [ ] All methods acquire per-card lock and release in `finally` block

#### Step 1.3: Create `src/routes/links.ts`

- [ ] Factory function `linkRoutes(workspacePath)` returning `new Elysia()` chain
- [ ] Instantiate `LinkService`, `CardService`, `WebSocketService.getInstance()`
- [ ] **POST** `/api/projects/:projectSlug/cards/:cardSlug/links` — body: `t.Object({ label: t.String({ minLength: 1, maxLength: 200 }), url: t.String({ minLength: 1 }), kind: t.Optional(t.Union([t.Literal('doc'), t.Literal('spec'), t.Literal('ticket'), t.Literal('repo'), t.Literal('reference'), t.Literal('other')])) })`. Call `linkService.addLink()`, broadcast `link:added` WS event with `LinkAddedData`, call `recordAndBroadcastHistory()` with action `'link:added'`. Set status 201. Return `{ link }`.
- [ ] **PATCH** `/api/projects/:projectSlug/cards/:cardSlug/links/:linkId` — body: all fields optional. Call `linkService.updateLink()`, broadcast `link:updated`, record history. Return `{ link }`.
- [ ] **DELETE** `/api/projects/:projectSlug/cards/:cardSlug/links/:linkId` — call `linkService.deleteLink()`, broadcast `link:deleted` with `LinkDeletedData`, record history. Return `{ success: true }`.
- [ ] Wrap service errors in proper HTTP status codes (400 for INVALID_URL/INVALID_LABEL, 404 for LINK_NOT_FOUND, 409 for DUPLICATE_LINK)

#### Step 1.4: Register routes in `src/server.ts`

- [ ] Import `linkRoutes` from `./routes/links`
- [ ] Add `.use(linkRoutes(workspacePath))` to the Elysia chain (after `.use(taskRoutes(workspacePath))`)

#### Step 1.5: Verify GET card returns `links[]`

- [ ] Confirm `card.service.ts` `getCard()` passes through all frontmatter (it does — gray-matter round-trips unknown fields)
- [ ] Confirm `routes/cards.ts` GET handler doesn't filter out frontmatter fields
- [ ] No changes should be needed — this is a verification step

### Phase 2 — Frontend: types, API client, store, components

#### Step 2.1: Mirror types in `frontend/src/types/index.ts`

- [ ] Add `CardLink` interface (same fields as backend)
- [ ] Add `links?: CardLink[]` to `CardFrontmatter` (after `blockedReason`, line ~36)
- [ ] Add `CreateLinkInput` and `UpdateLinkInput`
- [ ] Add `LinkAddedData`, `LinkUpdatedData`, `LinkDeletedData` WS event types

#### Step 2.2: Add API client methods in `frontend/src/api/client.ts`

- [ ] Add `linksApi` object following `tasksApi` pattern:
  - `add(projectSlug, cardSlug, input: CreateLinkInput): Promise<{ link: CardLink }>` — POST
  - `update(projectSlug, cardSlug, linkId, input: UpdateLinkInput): Promise<{ link: CardLink }>` — PATCH
  - `delete(projectSlug, cardSlug, linkId): Promise<void>` — DELETE
- [ ] Import `CardLink`, `CreateLinkInput` types

#### Step 2.3: Add store actions and WS handlers in `frontend/src/store/index.ts`

- [ ] Add actions to the store interface:
  - `addLink(cardSlug: string, input: CreateLinkInput): Promise<void>`
  - `updateLink(cardSlug: string, linkId: string, input: UpdateLinkInput): Promise<void>`
  - `deleteLink(cardSlug: string, linkId: string): Promise<void>`
- [ ] Implement actions: call `linksApi.*` → on success update `activeCard.frontmatter.links` in state → `_recordLocalAction('link:added:...')` for echo suppression
- [ ] Add WS handlers to store interface:
  - `wsHandleLinkAdded(data: LinkAddedData): void`
  - `wsHandleLinkUpdated(data: LinkUpdatedData): void`
  - `wsHandleLinkDeleted(data: LinkDeletedData): void`
- [ ] Implement WS handlers: check `_isRecentLocalAction()`, then update `activeCard.frontmatter.links` if the affected card is currently open. Follow the pattern from `wsHandleFileAdded` etc.
- [ ] Wire handlers in the WS event dispatcher — add cases for `'link:added'`, `'link:updated'`, `'link:deleted'` that call the corresponding handlers

#### Step 2.4: Create `frontend/src/components/card-detail/CardLinks.tsx`

- [ ] Props: `links: CardLink[]`, `cardSlug: string`
- [ ] Empty state: "No links yet — add a URL to get started."
- [ ] Section header with link icon, "Links" title, count badge (matching `CardFiles` style)
- [ ] Link list: each row shows kind badge (colored pill), clickable label opens URL in new tab (`target="_blank" rel="noopener noreferrer"`), edit/delete icon buttons
- [ ] Kind badge color mapping: `{ doc: 'blue', spec: 'purple', ticket: 'amber', repo: 'green', reference: 'teal', other: 'gray' }` — use Tailwind dark-mode classes
- [ ] "+ Add Link" button toggles add form
- [ ] Add/edit form: Label input (required), URL input (required), Kind dropdown (defaults `other`)
- [ ] Live inline validation: red border + error text for empty label, invalid URL (try `new URL()` client-side), duplicate URL (check against existing links)
- [ ] Save calls `addLink()` or `updateLink()` store action
- [ ] Delete calls `deleteLink()` store action with confirmation
- [ ] Edit mode replaces the link row with the form pre-filled

#### Step 2.5: Insert `CardLinks` in `CardDetailPanel.tsx`

- [ ] Import `CardLinks` component
- [ ] Insert between `TaskList` (line ~95) and the `CardFiles` div (line ~99):
```tsx
{/* Links section */}
<div className="border-t border-gray-700 pt-4">
  <CardLinks links={activeCard.frontmatter.links ?? []} cardSlug={activeCard.slug} />
</div>
```

### Phase 3 — Tests

#### Step 3.1: Create `src/__tests__/link.service.test.ts`

- [ ] Follow `src/__tests__/task.service.test.ts` pattern: temp dir setup/teardown, real file I/O
- [ ] Test `addLink`: valid URL returns `CardLink` with UUID `id`, correct `kind` default, timestamps set
- [ ] Test validation: invalid URL (no protocol, `ftp://`, empty string), empty label, whitespace-only label
- [ ] Test duplicate detection: adding same URL twice returns `DUPLICATE_LINK` error
- [ ] Test URL normalization: trailing whitespace trimmed, special chars in query string preserved
- [ ] Test `updateLink`: partial updates work, URL re-validation triggers, duplicate check excludes self
- [ ] Test `deleteLink`: removes from `links[]`, returns `LINK_NOT_FOUND` for bad ID
- [ ] Verify `frontmatter.updated` is bumped on each mutation
- [ ] Test that card content (markdown body, tasks) is not corrupted by link operations

#### Step 3.2: Verify end-to-end (manual)

- [ ] `bun test --filter "link"` — all tests pass
- [ ] `bun run dev` — full stack starts, open a card, Links section visible between Tasks and Files
- [ ] Add a link → appears in list, click opens in new tab, browser reload persists it
- [ ] Add duplicate URL → inline error shown, not persisted
- [ ] Edit link label/URL/kind → saved, reflected immediately
- [ ] Delete link → removed from UI and card `.md` file
- [ ] Open card `.md` file → `links:` array in YAML frontmatter with correct structure
- [ ] Open same card in two browser tabs → link change in one tab updates the other via WebSocket

### Phase 4 — MCP integration (stretch, implement if time allows)

- [ ] Add `add_link`, `update_link`, `delete_link` tools in `src/mcp/tool-handlers.ts` and `src/mcp/schemas.ts`
- [ ] Follow existing tool patterns (e.g., `add_task`)

## Files to create

| File | Purpose |
|------|---------|
| `src/services/link.service.ts` | Link CRUD logic, URL validation, per-card locking |
| `src/routes/links.ts` | REST endpoints for link CRUD |
| `src/__tests__/link.service.test.ts` | Backend unit tests |
| `frontend/src/components/card-detail/CardLinks.tsx` | Links section UI component |

## Files to modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `CardLink`, `CreateLinkInput`, `UpdateLinkInput`, WS event types, history types, metadata fields |
| `src/server.ts` | Add `.use(linkRoutes(workspacePath))` to route chain |
| `frontend/src/types/index.ts` | Mirror all new types from backend |
| `frontend/src/api/client.ts` | Add `linksApi` object with add/update/delete methods |
| `frontend/src/store/index.ts` | Add link CRUD actions + WS handlers + echo suppression |
| `frontend/src/components/card-detail/CardDetailPanel.tsx` | Import and insert `CardLinks` between `TaskList` and `CardFiles` |

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| YAML serialization edge cases with URLs containing special chars (colons, query strings) | `gray-matter` handles this correctly (proven by `taskMeta` with ISO timestamps containing colons). Add a test with complex URLs. |
| Frontend/backend type drift (types maintained in two separate files) | Use identical field names. Add comments referencing the counterpart file. |
| Card file rewrites on every link operation | Acceptable — same pattern as task add/toggle. Per-card lock prevents races. |
| Duplicate detection inconsistencies between client and server | Both sides normalize via WHATWG `new URL().href` before comparison. |

## Caveats

- Local file paths, rich previews, and permissions changes are explicitly out of scope for v1.
- No migration is needed for existing cards — `links` being `undefined` is handled gracefully throughout.
