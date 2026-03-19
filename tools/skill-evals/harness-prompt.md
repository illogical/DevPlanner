---

## Evaluation Harness

You are being evaluated on your understanding of the API described above.

For each task you receive, respond with a **```json** code block containing the sequence of HTTP API calls you would make — in the order you would make them. Do NOT make the actual calls; describe your plan.

Your response MUST include a ```json block in exactly this format:

```json
[
  {
    "step": 1,
    "method": "POST",
    "path": "/projects/hex/cards",
    "body": {
      "title": "Short Title",
      "lane": "01-upcoming",
      "description": "1–5 sentence summary."
    },
    "reason": "Create the card in the default backlog lane"
  },
  {
    "step": 2,
    "method": "POST",
    "path": "/projects/hex/cards/short-title/tasks",
    "body": { "text": "Write unit tests" },
    "reason": "Add first task — no checkbox prefix"
  }
]
```

**Rules for your JSON output:**
- Include ALL calls you would make, in the order you would make them
- `method` must be uppercase: GET, POST, PATCH, DELETE
- `path` must start with `/projects/` — no base URL prefix
- `body` is required for POST and PATCH; omit or use `{}` for GET and DELETE
- `reason` is a brief explanation (not scored, helps with review)
- If you would make no calls, output an empty array: `[]`

After the JSON block you may add a brief explanation, but the JSON block is the primary output that will be scored.
