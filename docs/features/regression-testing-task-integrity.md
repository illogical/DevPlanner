# Regression Testing: Card Task Integrity

## Context

DevPlanner has a recurring data loss bug: tasks on a card are silently erased (or their completion states reset) when a card's title or description is updated. The root cause is in `CardService.updateCard()` — when `updates.content` is provided, it completely replaces the card body with no preservation of the `## Tasks` section. If a caller sends only description text (without the tasks block), all tasks are permanently overwritten on disk.

This bug manifests through both direct API calls and the frontend's description editor, since both paths use the same `PATCH /api/projects/:slug/cards/:cardSlug` endpoint with a `content` field.

This feature adds:
1. A non-breaking fix to `CardService.updateCard()` that preserves existing tasks when a description-only update is received
2. Extended unit tests covering the interaction between card updates and task data
3. An API workflow verification script that exercises real Kanban scenarios with explicit regression guards

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/services/card.service.ts` | **Edit** — fix `updateCard()` to preserve tasks section |
| `src/__tests__/card.service.test.ts` | **Edit** — add `updateCard — task preservation` describe block (7 tests) |
| `src/__tests__/task.service.test.ts` | **Edit** — add `addTask — side effects` and `setTaskChecked — side effects` describe blocks (6 tests) |
| `scripts/verify-api-workflows.ts` | **Create** — API workflow verification script |
| `package.json` | **Edit** — add `verify:api-workflows` script |

## Root Cause Fix: `src/services/card.service.ts`

**Current code** (approximately line 303–304):

```typescript
// Use updated content if provided, otherwise keep existing
const updatedContent = updates.content !== undefined ? updates.content : content;
```

**Replace with:**

```typescript
let updatedContent: string;
if (updates.content !== undefined) {
  const newContent = updates.content;
  // If the new content omits the ## Tasks section but the existing card has one,
  // re-append the existing tasks block to prevent silent data loss.
  const existingTasksMatch = content.match(/((?:^|\n)## Tasks[\s\S]*$)/);
  const newContentHasTasks = /^## Tasks$/m.test(newContent);
  if (existingTasksMatch && !newContentHasTasks) {
    updatedContent = newContent.trimEnd() + '\n\n' + existingTasksMatch[1].trimStart();
  } else {
    updatedContent = newContent;
  }
} else {
  updatedContent = content;
}
```

**Edge cases this handles correctly:**

| Scenario | Before | After |
|----------|--------|-------|
| `PATCH { content: 'desc only' }`, card has tasks | Tasks erased | Tasks preserved |
| `PATCH { content: 'desc\n\n## Tasks\n- [ ] New' }` | Tasks replaced | Tasks replaced (caller intent respected) |
| `PATCH { title: 'New' }` only | No change | No change (content path not reached) |
| Card has no tasks, `PATCH { content: 'desc' }` | Correct | Correct (no tasks section added) |
| Card has empty `## Tasks` section | Preserved | Preserved |

## Unit Tests: `src/__tests__/card.service.test.ts`

Add a new `describe` block after the existing `updateCard` tests. Follow the existing pattern: real temp filesystem, `mkdtemp` in `beforeEach`, `rm` in `afterEach`. The new block requires a `CardService`, `TaskService`, and a project + card set up in `beforeEach`.

```
describe('updateCard — task preservation', () => {
```

### Setup for this describe block

In `beforeEach`, create a project and a card that already has tasks:
- Create card with `content: 'Original description\n\n## Tasks\n- [ ] Task A\n- [x] Task B'`
- Or: create card, then use `TaskService.addTask()` + `TaskService.setTaskChecked()` to populate tasks via the normal service path (preferred — exercises the full stack)

### Test cases

**1. `'updating title only: task count unchanged'`**
- PATCH `{ title: 'New Title' }`
- Assert `result.tasks.length === 2`

**2. `'updating title only: task completion states unchanged'`**
- PATCH `{ title: 'New Title' }`
- Assert `result.tasks[0].checked === false` and `result.tasks[1].checked === true`

**3. `'updating content with description only (no ## Tasks section): tasks preserved'`**
- PATCH `{ content: 'New description text only' }` — no `## Tasks` line
- Assert `result.tasks.length === 2`
- Assert `result.tasks[0].text === 'Task A'`
- Assert `result.tasks[1].text === 'Task B'`

**4. `'updating content with description only: task completion states preserved'`**
- PATCH `{ content: 'New description text only' }`
- Assert `result.tasks[0].checked === false`
- Assert `result.tasks[1].checked === true`

**5. `'updating content AND title simultaneously: tasks preserved'`**
- Create card with 3 tasks (2 unchecked at indices 0 and 1, 1 checked at index 2)
- PATCH `{ title: 'New Title', content: 'Combined update description' }`
- Assert `result.tasks.length === 3`
- Assert `result.tasks[2].checked === true`

**6. `'re-reading card from disk after title update confirms tasks persisted'`**
- PATCH `{ title: 'Disk Verify Title' }`
- Call `cardService.getCard(projectSlug, cardSlug)` separately (fresh read)
- Assert `card.tasks.length === 2` — confirms correct bytes were written, not just a correct return value

**7. `'re-reading card from disk after description update confirms tasks persisted'`**
- PATCH `{ content: 'Disk verify description' }`
- Call `cardService.getCard(projectSlug, cardSlug)` separately
- Assert `card.tasks.length === 2`
- Assert `card.tasks[1].checked === true` — completion state also written to disk correctly

## Unit Tests: `src/__tests__/task.service.test.ts`

Add two new `describe` blocks after the existing tests. Same temp-dir pattern. Each block needs a project + card with known frontmatter and body content set up in `beforeEach`.

### Block 1: `'addTask — side effects'`

**Setup**: Create card with `title: 'Original Title'`, `priority: 'high'`, `assignee: 'user'`, and `content: 'Original description text\n\n## Tasks\n- [ ] Pre-existing task'`.

**1. `'adding a task: card title unchanged'`**
- Call `taskService.addTask(projectSlug, cardSlug, 'New task')`
- Read card back with `cardService.getCard()`
- Assert `card.frontmatter.title === 'Original Title'`

**2. `'adding a task: card description text unchanged'`**
- Call `taskService.addTask(projectSlug, cardSlug, 'New task')`
- Read card back
- Assert card body content still contains `'Original description text'`

**3. `'adding a task: card priority and assignee unchanged'`**
- Call `taskService.addTask(projectSlug, cardSlug, 'New task')`
- Read card back
- Assert `card.frontmatter.priority === 'high'` and `card.frontmatter.assignee === 'user'`

### Block 2: `'setTaskChecked — side effects'`

**Setup**: Create card with `title: 'Toggle Title'`, `content: 'Toggle description\n\n## Tasks\n- [ ] Task Zero\n- [ ] Task One\n- [ ] Task Two'`.

**4. `'toggling a task: card title unchanged'`**
- Call `taskService.setTaskChecked(projectSlug, cardSlug, 1, true)`
- Read card back
- Assert `card.frontmatter.title === 'Toggle Title'`

**5. `'toggling a task: card description text unchanged'`**
- Call `taskService.setTaskChecked(projectSlug, cardSlug, 1, true)`
- Read card back
- Assert body content still contains `'Toggle description'`

**6. `'toggling a task: non-toggled tasks unchanged in text and completion state'`**
- Call `taskService.setTaskChecked(projectSlug, cardSlug, 1, true)`
- Read card back
- Assert `card.tasks[0].text === 'Task Zero'` and `card.tasks[0].checked === false`
- Assert `card.tasks[1].checked === true` (the one we toggled)
- Assert `card.tasks[2].text === 'Task Two'` and `card.tasks[2].checked === false`

## API Workflow Script: `scripts/verify-api-workflows.ts`

### Script structure

Follow the exact pattern of `scripts/verify-websocket.ts` and `scripts/e2e-demo.ts`:

```typescript
#!/usr/bin/env bun

const API_BASE = 'http://localhost:17103/api';
const TEST_PROJECT_SLUG = 'api-workflow-test';
const TEST_PROJECT_NAME = 'API Workflow Test';

// ANSI colors (copy object from verify-websocket.ts)
const colors = { ... };

// Test tracking
const testResults: { name: string; passed: boolean; reason?: string }[] = [];
let totalTests = 0;

// Helpers: pass(), fail(), section(), subsection()
// api<T>() typed fetch wrapper — throws descriptive error on non-2xx
// checkPrerequisites() — GET /api/projects, exit 1 if server not running
// printSummary() — prints results table, exits with code 0 or 1
// runTests() — calls all scenario functions, then printSummary()
```

### Project lifecycle

- `setupTestProject()`: `POST /api/projects` with `{ name: TEST_PROJECT_NAME }` if it doesn't exist; called at start of `runTests()`
- `cleanupTestProject()`: `DELETE /api/projects/${TEST_PROJECT_SLUG}` at end of `runTests()` (in a `finally` block so it runs even if scenarios fail)
- Each scenario creates cards with timestamped slugs (e.g., `wf1-${Date.now()}`) and deletes its own card at the end via `DELETE /api/projects/${TEST_PROJECT_SLUG}/cards/${cardSlug}`

### Scenario 1: `testWorkflow1_TaskLifecycleWithEdits()`

**Represents:** "Complete existing task" — create → claim → add tasks → toggle → update metadata → complete

```
section('Workflow 1: Task lifecycle through title and description updates')

1. POST card in 01-upcoming → pass: 201, slug created
2. POST task "Alpha" → pass: text matches, checked false
3. POST task "Beta" → pass: tasks.length === 2
4. PATCH tasks/0 with { checked: true } → pass: checked true
5. GET card → pass: tasks.length === 2, tasks[0].checked, !tasks[1].checked
6. PATCH card { title: 'Updated Title WF1' }
7. GET card → pass: tasks.length === 2 [REGRESSION GUARD]
              pass: tasks[0].checked === true [REGRESSION GUARD]
              pass: tasks[1].checked === false [REGRESSION GUARD]
8. PATCH card { content: 'Updated description only' }  (no ## Tasks)
9. GET card → pass: tasks.length === 2 [REGRESSION GUARD]
              pass: tasks[0].checked === true [REGRESSION GUARD]
              pass: tasks[1].checked === false [REGRESSION GUARD]
10. PATCH move to 03-complete
11. GET card → pass: tasks.length === 2 (survive lane move)
12. DELETE card (cleanup)
```

### Scenario 2: `testWorkflow2_CreateAndComplete()`

**Represents:** "Create and complete new card" — create → description → tasks → in-progress → toggle → complete

```
section('Workflow 2: Create card, add description, then tasks')

1. POST card with no content
2. PATCH card { content: 'Initial description' } → pass: 200
3. GET card → pass: tasks.length === 0, content contains 'Initial description'
4. POST task "Gamma" → pass: 1 task
5. POST task "Delta" → pass: 2 tasks
6. PATCH tasks/0 { checked: true } → pass: checked
7. PATCH tasks/1 { checked: true } → pass: checked
8. PATCH card { title: 'WF2 Card Title' }
9. GET card → pass: tasks.length === 2 [REGRESSION GUARD]
              pass: tasks[0].checked === true [REGRESSION GUARD]
              pass: tasks[1].checked === true [REGRESSION GUARD]
              pass: title === 'WF2 Card Title'
10. PATCH move to 02-in-progress
11. PATCH card { content: 'Different description after tasks exist' }
12. GET card → pass: tasks.length === 2 [REGRESSION GUARD]
               pass: tasks[0].checked === true [REGRESSION GUARD]
               pass: tasks[1].checked === true [REGRESSION GUARD]
               pass: content contains 'Different description after tasks exist'
13. PATCH move to 03-complete
14. DELETE card (cleanup)
```

### Scenario 3: `testRegressionGuard_TitleOnlyPatch()`

Isolated regression test — no workflow overhead, just the critical assertion.

```
section('Regression guard: title-only PATCH must not erase tasks')

1. POST card
2. POST task "Task 1"
3. POST task "Task 2"
4. PATCH tasks/1 { checked: true }
5. PATCH card { title: 'Regression Title Guard' }
6. GET card
   pass/fail: tasks.length === 2
   pass/fail: tasks[0].text === 'Task 1' && tasks[0].checked === false
   pass/fail: tasks[1].text === 'Task 2' && tasks[1].checked === true
7. DELETE card (cleanup)
```

### Scenario 4: `testRegressionGuard_DescriptionOnlyPatch()`

The critical regression guard — directly tests the failure mode.

```
section('Regression guard: description-only PATCH must not erase tasks')

1. POST card
2. POST task "Task 1"
3. POST task "Task 2"
4. PATCH tasks/1 { checked: true }
5. PATCH card { content: 'Brand new description — no tasks section here' }
6. GET card
   pass/fail: tasks.length === 2
   pass/fail: tasks[0].checked === false
   pass/fail: tasks[1].checked === true
   pass/fail: card body contains 'Brand new description'  (description was actually updated)
   pass/fail: card body contains '## Tasks'               (tasks section still in file)
7. DELETE card (cleanup)
```

### Package.json addition

```json
"verify:api-workflows": "bun scripts/verify-api-workflows.ts"
```

## On Frontend Component Tests

**Not recommended at this time.** The root cause is in the backend service layer, so the API workflow script provides regression coverage regardless of whether a bug originates from the frontend or a direct API call. The frontend (`CardContent.tsx`) already performs client-side re-combination of description + tasks section before calling `updateCard`; fixing the backend makes this a safety net rather than load-bearing logic.

If frontend tests are added in the future, the highest-value test would be verifying that `CardContent.handleSave()` calls the `updateCard` store action with a `content` string that still includes the original `## Tasks` block. Recommended stack: **Vitest + React Testing Library + msw** (mock service worker for API mocking). Add to `frontend/package.json`: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`.

## Verification

### Step 1: Confirm existing tests pass (baseline)

```bash
bun test
```

All tests should pass before any changes are made.

### Step 2: TDD — add unit tests before the fix (optional but recommended)

```bash
bun test --filter "task preservation"
bun test --filter "side effects"
```

Expected: the 4 key regression tests FAIL — this proves they correctly detect the bug. Specifically:
- `'updating content with description only (no ## Tasks section): tasks preserved'` → FAIL (result.tasks.length will be 0)
- `'updating content with description only: task completion states preserved'` → FAIL
- `'re-reading card from disk after description update confirms tasks persisted'` → FAIL

### Step 3: Apply the fix, then confirm tests pass

After updating `CardService.updateCard()` with the task-preservation logic:

```bash
bun test
```

Expected: all tests pass including the new regression tests. Zero failures.

### Step 4: Run the API workflow script

Requires the dev server to be running:

```bash
# Terminal 1
bun run dev

# Terminal 2
bun run verify:api-workflows
```

Expected console output:
```
================================================================================
  DevPlanner API Workflow Verification
================================================================================

--- Workflow 1: Task lifecycle through title and description updates ---
  [PASS] WF1: card created successfully
  [PASS] WF1: task Alpha added
  [PASS] WF1: task Beta added (count = 2)
  [PASS] WF1: task Alpha toggled to checked
  [PASS] WF1: initial state verified (2 tasks, correct states)
  [PASS] WF1 [REGRESSION GUARD]: tasks.length === 2 after title-only PATCH
  [PASS] WF1 [REGRESSION GUARD]: task[0].checked === true after title-only PATCH
  [PASS] WF1 [REGRESSION GUARD]: task[1].checked === false after title-only PATCH
  [PASS] WF1 [REGRESSION GUARD]: tasks.length === 2 after description-only PATCH
  [PASS] WF1 [REGRESSION GUARD]: task[0].checked === true after description-only PATCH
  [PASS] WF1 [REGRESSION GUARD]: task[1].checked === false after description-only PATCH
  ...

--- Regression guard: description-only PATCH must not erase tasks ---
  [PASS] GUARD: tasks.length === 2 after PATCH { content: '...' }
  [PASS] GUARD: task[0].checked === false
  [PASS] GUARD: task[1].checked === true
  [PASS] GUARD: description text was updated
  [PASS] GUARD: ## Tasks section still present in card body
  ...

================================================================================
  Results: 28 passed | 0 failed
================================================================================
```

Exit code must be `0`. If the fix is not applied, regression guard scenarios will report failures and the script will exit with code `1`.

### Step 5: Manual smoke test (verifies frontend path)

1. `bun run dev`, open `http://localhost:5173`
2. Create a card, add 2 tasks, check one
3. Open card detail, edit the description field, save
4. Verify both tasks appear with their original checked states
5. Edit the card title, save
6. Verify both tasks still appear with correct checked states
