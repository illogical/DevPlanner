# DevPlanner API Reference

Base URL: `http://192.168.7.45:17103/api`
All requests/responses: `Content-Type: application/json`

## Projects

| Method | Path | Key Body Fields | Purpose |
|--------|------|-----------------|---------|
| GET | `/projects` | — (`?includeArchived=true`) | List projects |
| GET | `/projects/{slug}` | — | Project config + lane definitions |
| POST | `/projects` | `{name, description?}` | Create project |
| PATCH | `/projects/{slug}` | `{name?, description?, archived?}` | Update |
| DELETE | `/projects/{slug}` | — (`?hard=true` for permanent) | Archive or delete |

## Cards

| Method | Path | Key Body Fields | Purpose |
|--------|------|-----------------|---------|
| GET | `/projects/{slug}/cards` | — (`?lane=02-in-progress`) | List cards (summary only) |
| POST | `/projects/{slug}/cards` | `{title, lane?, priority?, assignee?, tags?, content?, status?}` | Create |
| GET | `/projects/{slug}/cards/{card}` | — | Full card with content + tasks array |
| PATCH | `/projects/{slug}/cards/{card}` | `{title?, status?, priority?, assignee?, tags?, content?}` | Update metadata/content |
| **PATCH** | **`/projects/{slug}/cards/{card}/move`** | **`{lane, position?}`** | **Move between lanes** |
| DELETE | `/projects/{slug}/cards/{card}` | — (`?hard=true` permanent) | Archive or delete |
| GET | `/projects/{slug}/cards/search` | — (`?q=query`) | Search by title/tasks/tags |

## Tasks

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/projects/{slug}/cards/{card}/tasks` | `{text}` | Add task — plain text, no `- [ ]` prefix |
| PATCH | `/projects/{slug}/cards/{card}/tasks/{index}` | `{checked: true\|false}` | Toggle (0-based index) |

## Files

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/projects/{slug}/cards/{card}/files` | `{filename, content, description?}` | Create text file + associate (atomic) |
| GET | `/projects/{slug}/cards/{card}/files` | — | List files associated with card |
| GET | `/projects/{slug}/files/{filename}/download` | — | Retrieve file content |
| PATCH | `/projects/{slug}/files/{filename}` | `{description}` | Update file description |
| DELETE | `/projects/{slug}/files/{filename}` | — | Delete file + remove all card associations |

## Other

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/projects/{slug}/history` | Activity log (`?limit=N`, default 50) |
| GET | `/projects/{slug}/tags` | All tags used across project cards |
| PATCH | `/projects/{slug}/lanes/{lane}/order` | Reorder cards: `{order: ["a.md","b.md"]}` |

## Enums

**assignee**: `user` | `agent`
**priority**: `low` | `medium` | `high`
**status**: `in-progress` | `blocked` | `review` | `testing`
**lane** (default): `01-upcoming` | `02-in-progress` | `03-complete` | `04-archive`

## Error Response Format

```json
{"error": "not_found", "message": "Card 'my-card' not found", "expected": "..."}
```

Status codes: `200` OK · `201` Created · `400` Bad Request · `404` Not Found · `409` Conflict · `500` Server Error

## Card Response Shape (summary)

```json
{
  "slug": "user-auth",
  "filename": "user-auth.md",
  "lane": "01-upcoming",
  "frontmatter": {
    "title": "User Authentication",
    "priority": "high",
    "assignee": "user",
    "status": null,
    "tags": ["feature"],
    "created": "2026-02-04T10:00:00Z",
    "updated": "2026-02-04T14:30:00Z"
  },
  "taskProgress": {"total": 4, "checked": 1}
}
```

Full card (`GET /cards/{card}`) adds `content` (Markdown body) and `tasks` array:

```json
"tasks": [
  {"index": 0, "text": "Set up OAuth2 client", "checked": false},
  {"index": 1, "text": "Create session management", "checked": true}
]
```
