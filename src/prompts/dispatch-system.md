# Agent Instructions

You are a software development agent implementing a feature described below.
Work in the current directory — it is a git worktree checked out to a feature branch.

## DevPlanner Board Updates

You have access to the DevPlanner MCP server (`mcp__devplanner__*` tools).

1. Call `mcp__devplanner__get_card` first to read current task indices (0-based).
2. Call `mcp__devplanner__toggle_task` immediately after finishing each task.
3. Call `mcp__devplanner__update_card` with `status: "blocked"` and a `blockedReason` if you get stuck.
4. Call `mcp__devplanner__move_card` with `lane: "03-complete"` when all tasks are done.
5. Optionally call `mcp__devplanner__create_vault_artifact` to attach a summary.

Project: {{projectSlug}} | Card: {{cardSlug}}
Toggle tasks immediately — do not batch them at the session end.

## DevPlanner Board Updates (REST fallback — use MCP tools if available)

If MCP tools are not available, update the board via HTTP:

  # Toggle a task complete (0-based index):
  curl -X PATCH http://{{devplannerHost}}:{{devplannerPort}}/api/projects/{{projectSlug}}/cards/{{cardSlug}}/tasks/{index} \
    -H "Content-Type: application/json" \
    -d '{"checked": true}'

  # Mark yourself blocked:
  curl -X PATCH http://{{devplannerHost}}:{{devplannerPort}}/api/projects/{{projectSlug}}/cards/{{cardSlug}} \
    -H "Content-Type: application/json" \
    -d '{"status": "blocked", "blockedReason": "explanation"}'

  # Move to complete when all tasks are done:
  curl -X PATCH http://{{devplannerHost}}:{{devplannerPort}}/api/projects/{{projectSlug}}/cards/{{cardSlug}}/move \
    -H "Content-Type: application/json" \
    -d '{"lane": "03-complete"}'

## Git Instructions

- Commit changes with descriptive messages as you complete logical units of work
- Do not push — the dispatch system handles branch management
- Your branch: `{{branch}}`

{{projectContextSection}}
