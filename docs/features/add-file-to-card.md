# Add File to Card - AI Agent File Creation

## Context

DevPlanner's file management system (Phase 17) is complete with:
- FileService with CRUD operations
- 8 REST API endpoints  
- 3 MCP tools for AI agents (list, read)
- WebSocket real-time updates
- 30+ unit tests

**Critical Gap:** AI agents can LIST and READ files through MCP, but cannot CREATE them. This blocks the most common agent workflow: creating reference files (technical specs, design docs, implementation notes) directly linked to cards.

**Solution:** Add atomic "create text file and link to card" operation via:
1. New REST API endpoint: `POST /api/projects/:projectSlug/cards/:cardSlug/files`
2. New MCP tool: `add_file_to_card`

## Use Cases

**AI Agent Workflows:**
- Agent creates technical specification for a feature card
- Agent generates API documentation linked to implementation card  
- Agent writes test plan for a bug fix card
- Agent extracts requirements into a separate markdown file

**Design Decisions:**
- **Card association required** (not optional) — matches the stated workflow of "create file for this card"
- **Text files only** — consistent with MCP scope, binary files not needed for agent workflows
- **Atomic operation** — create + link in one call, no partial state if association fails
- **Filename deduplication** — reuses existing collision handling (`file.md` → `file-2.md`)
- **Both REST and MCP** — REST for future UI work, MCP for current agent needs

## API Specification

### REST Endpoint

#### `POST /api/projects/:projectSlug/cards/:cardSlug/files`

Create a text file and associate it with the specified card.

**Request Format 1: JSON (for text content)**
```json
{
  "filename": "technical-spec.md",
  "content": "# Technical Specification\n\n## Overview\n...",
  "description": "Detailed technical specifications"
}
```

**Request Format 2: Multipart (for file upload)**
```
Content-Type: multipart/form-data

file: <File object>
description: "Uploaded design document"
```

**Response 201:**
```json
{
  "filename": "technical-spec.md",
  "originalName": "technical-spec.md",
  "description": "Detailed technical specifications",
  "mimeType": "text/markdown",
  "size": 1247,
  "created": "2026-02-17T10:30:00.000Z",
  "cardSlugs": ["feature-authentication"]
}
```

**Errors:**
- `404` — Project or card not found
- `400` — Missing required fields, invalid filename, or empty content
- `500` — File system error

**Behavior:**
1. Validate project exists
2. Validate card exists in project
3. Create file using FileService (with automatic deduplication)
4. Associate file with card (appends to `cardSlugs` array in `_files.json`)
5. Broadcast `file:added` and `file:associated` WebSocket events
6. Return file metadata

**WebSocket Events:**
- `file:added` — Contains full `ProjectFileEntry` with `cardSlugs` populated
- `file:associated` — Contains `{ filename, cardSlug }` for real-time UI updates

## MCP Tool Specification

### `add_file_to_card`

Create a text file and link it to a card in one atomic operation.

**Input Schema:**
```typescript
{
  projectSlug: string;      // Required: project identifier
  cardSlug: string;         // Required: card identifier  
  filename: string;         // Required: e.g. "spec.md"
  content: string;          // Required: UTF-8 text content
  description?: string;     // Optional: file description
}
```

**Output:**
```typescript
{
  filename: string;         // May differ from input if deduplicated
  originalName: string;     // Original filename requested
  description: string;
  mimeType: string;
  size: number;
  created: string;
  associatedCards: string[];
  message: string;          // Confirmation message for LLM
}
```

**Examples:**

Success:
```json
{
  "filename": "api-spec.md",
  "originalName": "api-spec.md",
  "description": "REST API endpoint documentation",
  "mimeType": "text/markdown",
  "size": 2048,
  "created": "2026-02-17T10:30:00.000Z",
  "associatedCards": ["api-implementation"],
  "message": "Successfully created 'api-spec.md' (2.0 KB) and linked to card 'api-implementation'"
}
```

Filename deduplication:
```json
{
  "filename": "api-spec-2.md",
  "originalName": "api-spec.md",
  "description": "REST API endpoint documentation",
  "mimeType": "text/markdown",
  "size": 2048,
  "created": "2026-02-17T10:30:00.000Z",
  "associatedCards": ["api-implementation"],
  "message": "Successfully created 'api-spec-2.md' (filename was deduplicated) and linked to card 'api-implementation'"
}
```

**Error Handling:**

Project not found:
```json
{
  "code": "PROJECT_NOT_FOUND",
  "message": "Project 'invalid-project' not found.",
  "suggestion": "Available projects: media-manager, lm-api, memory-api"
}
```

Card not found:
```json
{
  "code": "CARD_NOT_FOUND",
  "message": "Card 'invalid-card' not found in project 'media-manager'.",
  "suggestion": "Available cards: user-auth, api-endpoints, ui-layout (showing 3 of 12)"
}
```

Empty content:
```json
{
  "code": "INVALID_INPUT",
  "message": "File content cannot be empty.",
  "suggestion": "Provide text content for the file. Minimum 1 character required."
}
```

## Implementation Details

### Service Layer

Add method to `src/services/file.service.ts`:

```typescript
async addFileToCard(
  projectSlug: string,
  cardSlug: string,
  filename: string,
  content: string,
  description?: string
): Promise<ProjectFileEntry>
```

**Implementation approach:**
- Validate card exists first (fail-fast before creating file)
- Create file buffer from UTF-8 string: `Buffer.from(content, 'utf-8')`
- Call existing `addFile()` method (handles deduplication, MIME detection, writes to `_files/`)
- Call existing `associateFile()` method with resulting filename (may be deduplicated)
- Return file entry with `cardSlugs` populated

**Why not a transaction?** File creation and association are already atomic at the filesystem level:
- `addFile()` writes file + updates `_files.json`
- `associateFile()` updates `_files.json` (modifies existing entry)
- If association fails, the file exists but is unassociated (acceptable, can be linked later)
- Cleanup on error is handled by existing error boundaries

### Validation Order

1. Project exists (throws `PROJECT_NOT_FOUND` if missing)
2. Card exists in project (throws `CARD_NOT_FOUND` if missing)
3. Filename is valid (non-empty, no path separators like `/` or `\\`)
4. Content is non-empty string (throws `INVALID_INPUT` if empty)
5. Content is valid UTF-8 (Buffer.from handles this automatically)

### MIME Type Detection

Reuses existing `getMimeType()` utility based on file extension:
- `.md` → `text/markdown`
- `.txt` → `text/plain`
- `.json` → `application/json`
- `.js` → `application/javascript`
- `.ts` → `application/typescript`
- Unknown → `application/octet-stream`

Text file detection via `isTextFile()` not needed here (all inputs are text by definition).

### Filename Deduplication

Existing `addFile()` method handles collision detection:
- `spec.md` exists → creates `spec-2.md`
- `spec-2.md` exists → creates `spec-3.md`
- Original filename preserved in `originalName` field
- Agent receives both `filename` (actual) and `originalName` (requested) in response

### Content Size Limits

No explicit limit enforced. Practical considerations:
- Text files typically < 1 MB (reasonable for specs, docs)
- Large files (> 10 MB) may cause performance issues
- Future enhancement: Add configurable size limit in service constructor

## Testing Strategy

### Unit Tests (`src/__tests__/file.service.test.ts`)

Add test suite: `addFileToCard`:

1. ✅ Creates file and associates with card
   - Verifies file exists in `_files/` directory
   - Verifies file metadata in `_files.json`
   - Verifies `cardSlugs` array contains target card
2. ✅ Throws error if card not found  
   - Mock `cardService.getCard()` to throw
   - Verify error message is clear
3. ✅ Handles filename deduplication correctly
   - Create `spec.md` twice
   - Second call should create `spec-2.md`
   - Both should be associated with their respective cards
4. ✅ Preserves UTF-8 encoding
   - Create file with emoji, accented characters
   - Read back and verify content matches
5. ✅ Validates non-empty content
   - Pass empty string for content
   - Verify throws with helpful error message
6. ✅ Description is optional
   - Create file without description
   - Verify description defaults to empty string

### MCP Tool Tests (`src/mcp/__tests__/add-file-to-card.test.ts`)

Create new test file with 6 test cases:

1. ✅ Valid input returns success with file metadata
   - Call tool with all required fields
   - Verify response contains file metadata and confirmation message
2. ✅ Project not found returns helpful error with suggestions
   - Mock project service to return empty list
   - Verify error includes available projects
3. ✅ Card not found returns helpful error with card list
   - Mock card service to throw
   - Verify error includes available cards (truncated to 10)
4. ✅ Empty content rejected
   - Pass `content: ""`
   - Verify validation error with helpful message
5. ✅ Filename deduplication reflected in response
   - Create same filename twice
   - Verify second response shows deduplicated name
6. ✅ Description is optional and persisted correctly
   - Create with and without description
   - Verify both cases work

### Integration Tests (E2E Demo)

**Act 7B** in `scripts/e2e-demo.ts` (insert between Act 6 and Act 7):

```typescript
async function act7b_createFileForCard(): Promise<void> {
  section('ACT 7B: Creating File for Card (Atomic Operation)');

  action('Creating technical spec file for Navigation System card...');
  const file = await api<ProjectFileEntry>(
    'POST',
    `/projects/${PROJECT_SLUG}/cards/navigation-system/files`,
    {
      filename: 'navigation-technical-spec.md',
      content: '# Navigation System Technical Specification\n\n## Overview\n\nDetailed technical specifications for the navigation system.\n\n## Components\n\n- Star chart integration\n- Autopilot module\n- Collision avoidance system',
      description: 'Technical specifications for navigation system implementation'
    }
  );
  ok(`File created and linked: ${file.filename}`);
  watch('File should appear in card files list (check card detail panel)');
  
  // Verify file exists
  action('Verifying file is associated with card...');
  const cardFiles = await api<{ files: ProjectFileEntry[] }>(
    'GET',
    `/projects/${PROJECT_SLUG}/cards/navigation-system/files`
  );
  const found = cardFiles.files.find(f => f.filename === file.filename);
  if (found) {
    ok(`Verified: File exists in card's file list`);
    info(`File: ${found.filename} (${formatFileSize(found.size)})`);
    info(`Description: ${found.description}`);
  } else {
    error('File not found in card files list!');
  }
  
  await pause();
}
```

**Update E2E demo docs** (`docs/features/e2e-demo.md`):

Add Act 7B section:
- **Purpose:** Test atomic create-and-link file operation
- **What to observe:** File creation without multi-step API calls, WebSocket events for file:added and file:associated
- **Expected behavior:** File appears immediately in card's file list, no partial state

## Files Modified

| File | Change |
|------|--------|
| `src/services/file.service.ts` | Add `addFileToCard()` method (~30 lines) |
| `src/routes/files.ts` | Add `POST /cards/:cardSlug/files` endpoint (~40 lines) |
| `src/mcp/schemas.ts` | Add `ADD_FILE_TO_CARD_SCHEMA` (~20 lines) |
| `src/mcp/tool-handlers.ts` | Add `handleAddFileToCard()` function (~60 lines) |
| `src/mcp-server.ts` | Register tool in tools array (1 line, 18 → 19 tools) |
| `src/types/index.ts` | Add `AddFileToCardInput`, `AddFileToCardOutput` interfaces (~10 lines) |
| `src/__tests__/file.service.test.ts` | Add 6 test cases (~120 lines) |
| `src/mcp/__tests__/add-file-to-card.test.ts` | Create new test file (~150 lines) |
| `scripts/e2e-demo.ts` | Add Act 7B scenario (~30 lines) |
| `docs/features/e2e-demo.md` | Document Act 7B (~20 lines) |
| `docs/SPECIFICATION.md` | Add endpoint and MCP tool docs (~60 lines) |
| `docs/openapi.yaml` | Add endpoint definition (~50 lines) |
| `docs/TASKS.md` | Add Phase 19B tasks (~15 lines) |
| `frontend/src/api/client.ts` | Add `addFileToCard()` API client method (~15 lines) |
| `frontend/src/types/index.ts` | Mirror backend types (~10 lines) |

**Total estimate:** ~640 lines of code/docs across 15 files

## Future Enhancements

- **Optional card association:** Make `cardSlug` optional parameter for standalone files (would require path change to `/api/projects/:projectSlug/files/create`)
- **Bulk creation:** Upload multiple files in one operation for batch workflows
- **Template support:** Create files from templates (e.g., "API spec template", "Test plan template")
- **Binary file support:** Allow PDF/image uploads via MCP (encode as base64 in JSON)
- **File size limits:** Add configurable max file size validation (e.g., 10 MB default)
- **Content validation:** Lint/validate specific formats (JSON schema validation, Markdown linting)

## Verification Checklist

After implementation, verify:

- [ ] Unit tests pass (20+ total in file.service.test.ts)
- [ ] MCP tool tests pass (6 in add-file-to-card.test.ts)
- [ ] E2E demo Act 7B executes successfully
- [ ] File appears in card files list after creation
- [ ] WebSocket events broadcast correctly (`file:added`, `file:associated`)
- [ ] MCP tool works from actual AI agent (`verify-mcp-agent.ts` or live test)
- [ ] Filename deduplication works (create same filename twice)
- [ ] Error messages are LLM-friendly (clear, actionable suggestions)
- [ ] Documentation is complete (feature doc, API spec, OpenAPI spec, E2E doc)
- [ ] Frontend API client method works (can test with curl to verify endpoint first)
- [ ] File content encoding preserved (test with multi-byte UTF-8 characters)

## Related Documentation

- **Backend File Management:** `docs/features/reference-file-management.md`
- **Frontend File Management:** `docs/features/frontend-file-management.md`
- **MCP Server:** `docs/features/mcp-server.md`
- **E2E Demo:** `docs/features/e2e-demo.md`
- **API Specification:** `docs/SPECIFICATION.md` (Section 3.3)
- **OpenAPI Spec:** `docs/openapi.yaml`
