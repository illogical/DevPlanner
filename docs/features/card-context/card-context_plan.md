# Card Context Endpoint

## Purpose

Provides a single "pull" endpoint for AI coding agents to retrieve everything needed to implement a card: the card ID, slug, description, task checklist, and full contents of any linked vault artifact files.

When a human tells an agent "implement DEV-42", the agent calls `get_card_context` with the card ID and immediately receives all context, without needing to make multiple calls or parse link URLs manually.

---

## REST Endpoint

```
GET /api/projects/:projectSlug/cards/:cardSlug/context
```

### Response

```typescript
{
  cardId: string | null;       // "DEV-42"
  slug: string;                // "implement-auth-feature"
  title: string;               // "Implement Auth Feature"
  description: string | null;  // frontmatter.description (1-5 sentence summary)
  tasks: string;               // "- [ ] Set up JWT...\n- [x] Create model"
  artifacts: Array<{
    label: string;             // Link display label
    kind: string;              // 'doc' | 'spec' | 'ticket' | 'repo' | 'reference' | 'other'
    path: string;              // Relative vault path
    content: string;           // Full file content
  }>;
  links: Array<{               // Non-artifact links (external URLs), metadata only
    label: string;
    kind: string;
    url: string;
  }>;
  contextText: string;         // Pre-formatted markdown (see below)
}
```

### `contextText` format

```markdown
# Card DEV-42: Implement Auth Feature

**Lane:** 02-in-progress

## Description

This card tracks the implementation of the authentication feature...

## Tasks

- [ ] Set up JWT middleware
- [x] Create user model

## Artifact: Feature Spec (spec)

---
[vault file content here]
---

## Links

- [GitHub Issue #123](https://github.com/...) (ticket)
```

### Artifact detection

A link is a local vault artifact if `link.url.startsWith(ARTIFACT_BASE_URL)`. Its file content is read via `VaultService.readArtifactContent()`. All other links appear in the `links` array as metadata only.

If `ARTIFACT_BASE_URL` / `ARTIFACT_BASE_PATH` are not configured, the `artifacts` array is empty and the endpoint still succeeds.

---

## MCP Tool

**Tool name:** `get_card_context`

**Description:** Get a complete implementation context for a card: ID, slug, description, task checklist, and full contents of any linked vault artifact files. Use this when told to implement a card (e.g. "implement DEV-42") — provide the `cardId` to resolve it automatically.

### Input

```typescript
{
  cardId?: string;        // "DEV-42" — preferred, resolves across all projects
  projectSlug?: string;   // Required if cardId is not provided
  cardSlug?: string;      // Required if cardId is not provided
}
```

At least one of: `cardId`, or both `projectSlug` + `cardSlug`.

### `cardId` resolution

When `cardId` is provided, the handler iterates `listProjects()` + `listCards()` to find the matching card. This allows agents to use the human-facing ID without knowing the project slug.

### Output

Returns the same `CardContextResult` as the REST endpoint, serialized as JSON. Agents can use the `contextText` field directly as a context block.

---

## Implementation

| File | Role |
|------|------|
| `src/utils/card-context.ts` | Shared `buildCardContext()` helper + `CardContextResult` types |
| `src/routes/card-context.ts` | Elysia route handler |
| `src/server.ts` | Route registration |
| `src/mcp/schemas.ts` | `GET_CARD_CONTEXT_SCHEMA` |
| `src/mcp/types.ts` | `GetCardContextInput` |
| `src/mcp/tool-handlers.ts` | `handleGetCardContext` |
| `src/mcp-server.ts` | Tool registration |

---

## Future: Artifact Filtering

In the future, individual links could be flagged to be excluded from context (e.g. `contextIgnore: true` on a `CardLink`) to allow agents to work with cards that have many artifacts without exhausting context window space. The initial implementation includes all vault artifact files.
