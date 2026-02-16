# DevPlanner Scripts

This directory contains utility scripts for testing and verifying DevPlanner functionality.

## Available Scripts

### `verify-websocket.ts`

Comprehensive verification script for the WebSocket infrastructure (Phase 12).

**What it tests:**
- Basic WebSocket connection establishment
- Subscribe/unsubscribe message handling
- Ping/pong mechanism (client-initiated and server heartbeat)
- Error handling (invalid messages, missing fields, malformed JSON)
- Multi-client scenarios (multiple simultaneous connections)
- Reconnection capabilities

**Prerequisites:**
- DevPlanner server must be running on port 17103
- `DEVPLANNER_WORKSPACE` environment variable must be set

**Usage:**
```bash
# Start the server first (in a separate terminal)
export DEVPLANNER_WORKSPACE="$PWD/workspace"
bun src/server.ts

# Run the verification script (in another terminal)
bun scripts/verify-websocket.ts
```

**Expected output:**
```
================================================================================
DevPlanner WebSocket Verification Suite
================================================================================
WebSocket URL: ws://localhost:17103/api/ws
Test Project: test-project
Timeout: 45000ms

Test 1: Basic Connection
✅ PASS: Basic connection - Connected to WebSocket server

Test 2: Subscribe/Unsubscribe
✅ PASS: Subscribe message - Received correct subscription confirmation
✅ PASS: Unsubscribe message - Received correct unsubscription confirmation

Test 3: Ping/Pong Mechanism
✅ PASS: Client ping - Server responded with pong
   Waiting for server heartbeat (30s)...
✅ PASS: Server heartbeat - Received server ping after ~30 seconds
✅ PASS: Heartbeat response - Sent pong response to server

Test 4: Error Handling
✅ PASS: Invalid message type - Server returned error: "Unknown message type or missing required fields"
✅ PASS: Missing projectSlug - Server returned error for missing field
✅ PASS: Malformed JSON - Server handled parse error gracefully

Test 5: Multi-Client Scenario
✅ PASS: Multi-client connection - Two clients connected simultaneously
✅ PASS: Multi-client subscription - Both clients subscribed to same project
✅ PASS: Client cleanup - Remaining client still functional after other disconnected

Test 6: Reconnection
✅ PASS: Client disconnect - First connection closed cleanly
✅ PASS: Client reconnect - New client can subscribe after previous disconnect

================================================================================
Test Summary
================================================================================

Total Tests: 13
Passed: 13
Failed: 0

Success Rate: 100.0%

🎉 All tests passed! WebSocket infrastructure is working correctly.
```

**Test Coverage:**

| Test Suite | Tests | Description |
|------------|-------|-------------|
| Basic Connection | 1 | Verifies WebSocket connection can be established |
| Subscribe/Unsubscribe | 2 | Tests project subscription lifecycle |
| Ping/Pong | 3 | Validates client-server heartbeat mechanism |
| Error Handling | 3 | Ensures proper error responses |
| Multi-Client | 3 | Tests concurrent connections |
| Reconnection | 2 | Validates connection cleanup and re-establishment |

**Exit codes:**
- `0` - All tests passed
- `1` - One or more tests failed or timeout occurred

**Troubleshooting:**

If tests fail with "Connection timeout":
- Ensure the server is running: `bun src/server.ts`
- Check that port 17103 is not blocked by firewall
- Verify `DEVPLANNER_WORKSPACE` environment variable is set

If heartbeat test fails:
- The server sends heartbeat pings every 30 seconds
- The test waits up to 35 seconds for the first ping
- Ensure your system time is accurate

If multi-client tests fail:
- Check server logs for connection/disconnection messages
- Verify the WebSocketService singleton is managing clients correctly
- Review subscription cleanup logic in `src/services/websocket.service.ts`

---

### `e2e-demo.ts`

Live demonstration script that exercises all DevPlanner real-time features. It takes actions via the REST API and direct file edits, with 5-second pauses between actions so you can watch the UI respond with animations in real time.

**What it demonstrates:**
- Project creation (sidebar update)
- Card creation with blue glow + slide-in animations
- Task addition with progress bar updates
- Task completion with green flash + pulse animations
- **Rapid-fire task toggling** (stress test for concurrent updates)
- Card movement between lanes with amber glow animation
- Card reordering within a lane
- Direct file edit triggering file watcher → WebSocket → violet glow animation
- Card archival (card disappearing from lane)
- Project metadata updates
- Activity history log

**Prerequisites:**
- DevPlanner server running (`bun run dev`)
- Frontend open in browser at `http://localhost:5173`
- `DEVPLANNER_WORKSPACE` environment variable set

**Usage:**
```bash
# With the dev server already running, in a separate terminal:
bun run demo:e2e
```

**How to use:**
1. Open `http://localhost:5173` in your browser
2. Run the script in a terminal
3. When prompted, click on the "E2E Demo" project in the sidebar
4. Watch the UI update in real time as the script takes actions

**What it creates:**
- A project called "E2E Demo" with a space-themed narrative
- Cards: "Navigation System", "Hull Integrity Monitor", "Fuel Cell Optimizer"
- Tasks on multiple cards with some completed
- The project is left in place after the script finishes so you can inspect it

**Re-running:**
The script is idempotent — it removes any existing "E2E Demo" project before creating a new one.

**Exit codes:**
- `0` - Demo completed successfully
- `1` - Fatal error or timeout (90s)

---

### `verify-mcp-agent.ts`

Tests the MCP (Model Context Protocol) server by having a local LLM agent work through a realistic project scenario using MCP tools. This validates that DevPlanner's MCP tools are intuitive and effective for AI-driven project management.

**What it tests:**
- Tool selection accuracy (does the agent choose the right tools?)
- Parameter correctness (lane slugs, card slugs, required fields)
- Workflow logic (does the sequence make sense?)
- Task completion rate (what % of actions succeed?)

**Prerequisites:**
1. **Ollama installed and running:**
   ```bash
   # Install Ollama (macOS)
   brew install ollama
   
   # Install Ollama (Linux)
   curl -fsSL https://ollama.com/install.sh | sh
   
   # Start Ollama server
   ollama serve
   
   # Pull a model with tool calling support
   ollama pull qwen2.5      # Recommended (excellent tool calling)
   # OR
   ollama pull llama3.1     # Good alternative
   ```

2. **DevPlanner workspace configured:**
   ```bash
   export DEVPLANNER_WORKSPACE=/path/to/workspace
   ```

**Usage:**
```bash
# Basic run (default: qwen2.5 model, 2s pauses)
bun run verify:mcp

# With different model
bun scripts/verify-mcp-agent.ts --model llama3.1

# Verbose mode (show full LLM responses)
bun run verify:mcp:verbose

# Custom pause duration (milliseconds)
bun scripts/verify-mcp-agent.ts --pause 1000

# JSON output for CI/CD
bun run verify:mcp:json > results.json
```

**Workflow Scenario:**
The script guides an AI agent through building an autonomous delivery robot project:

1. **Phase 1: Project Setup** - Create project and verify lane structure
2. **Phase 2: Create Cards** - Create subsystem cards (Navigation, Motor Control, API Backend)
3. **Phase 3: Add Tasks** - Add detailed checklist items to each card
4. **Phase 4: Start Work** - Move cards to in-progress and toggle tasks
5. **Phase 5: Complete Work** - Batch complete tasks and move to complete lane

**Metrics & Scoring:**
The agent is scored on 4 metrics (25% weight each):

| Metric | Description | What it measures |
|--------|-------------|------------------|
| Tool Selection | Did it choose the right tools? | Correct tool usage vs expected |
| Parameter Correctness | Are lane slugs, card slugs correct? | Format validation (02-in-progress vs in-progress) |
| Workflow Logic | Is the sequence logical? | Card movement order, redundant calls |
| Task Completion | What % of actions succeeded? | Success rate of tool calls |

**Rating Scale:**
- **Excellent (90-100%)** - Agent can effectively work with DevPlanner ✅
- **Good (75-89%)** - Agent mostly succeeds, minor issues ⚠️
- **Fair (60-74%)** - Agent struggles with some tools/params ⚠️
- **Poor (<60%)** - Agent cannot reliably use MCP tools ❌

**Exit codes:**
- `0` - Score >= 75% (agent is production-ready)
- `1` - Score < 75% (needs improvement)

**Output:**
The script provides real-time colored terminal output showing each tool call, parameters, results, and pauses between actions. Final report includes metrics breakdown, scoring across 4 dimensions, and a rating (Excellent/Good/Fair/Poor). See `docs/features/mcp-verification-summary.md` for detailed output examples.

---

### `test-mcp-tools.ts`

Comprehensive test harness that evaluates how accurately different LLM models utilize MCP (Model Context Protocol) tools when processing prompts via LMAPI. This is a **systematic evaluation tool** that compares model performance across tool calling tasks, whereas `verify-mcp-agent.ts` validates that the MCP server works correctly.

**Features:**
- **24 Test Cases**: Covers all 20 DevPlanner MCP tools
- **Model Comparison**: Test multiple models sequentially
- **Category Analysis**: CRUD (12 tests), Smart/Workflow (9 tests), File Management (3 tests)
- **Difficulty Levels**: Easy, Medium, Hard for each test case
- **Interactive Dashboard**: Self-contained HTML report with charts and filtering
- **Memory Efficient**: Tests one model at a time

**Prerequisites:**
1. **LMAPI Server Running**:
   ```bash
   bun run dev:backend
   ```

2. **Ollama Models Available**:
   ```bash
   ollama pull llama3-groq-tool-use  # Recommended
   ollama pull phi4
   ollama pull qwen2.5
   ```

**Usage:**
```bash
# Run with default models
bun run test:mcp-tools

# Test specific models
bun scripts/test-mcp-tools.ts llama3.1 qwen2.5

# Quick test (single model)
bun run test:mcp-tools:quick

# Test multiple models
bun run test:mcp-tools:all

# Custom options
bun scripts/test-mcp-tools.ts --endpoint http://localhost:8000 \
  --output ./my-reports --verbose llama3.1
```

**Command Line Options:**
- `--endpoint <url>` - LMAPI base URL (default: http://localhost:17103)
- `--output <dir>` - Output directory (default: ./test-reports)
- `--no-html` - Skip HTML dashboard generation
- `--verbose` - Show detailed request/response information
- `--help, -h` - Show help message

**Test Categories:**

*CRUD Tools (12 cases):*
- Project operations: list, get, create
- Card operations: list (with filters), get, create, update, move
- Task operations: add, toggle

*Smart/Workflow Tools (9 cases):*
- Board overview and progress tracking
- Next tasks recommendations
- Batch task updates
- Card search (with filters)
- Card content updates
- Card archival

*File Management Tools (3 cases):*
- List project files
- List card files
- Read file content

**Output:**

The script generates two types of output:

1. **JSON Report** (`test-reports/mcp-tool-test-report-<timestamp>.json`)
   - Complete test results for all models
   - Accuracy statistics by category and difficulty
   - Response times and metadata

2. **HTML Dashboard** (`test-reports/mcp-tool-test-dashboard-<timestamp>.html`)
   - Summary cards (total tests, accuracy, etc.)
   - Model comparison table (sortable)
   - 4 interactive charts (accuracy by model, category, difficulty, performance)
   - Filterable detailed results table
   - Test cases reference
   - Dark mode GitHub-inspired theme
   - Self-contained (no external dependencies except Chart.js CDN)

**Example Console Output:**
```
═══════════════════════════════════════════════════════════
  MCP Tool Calling Test Suite
═══════════════════════════════════════════════════════════
LMAPI Endpoint: http://localhost:17103
Models: llama3.1, qwen2.5
Test Cases: 24
Total Tests: 48
═══════════════════════════════════════════════════════════

Testing model: llama3.1
────────────────────────────────────────────────────────────
  ✓ list_projects_01 (1234ms)
  ✓ list_projects_02 (1456ms)
  ✗ get_project_01 (987ms) - Got: list_projects
  ...

═══════════════════════════════════════════════════════════
  TEST SUMMARY
═══════════════════════════════════════════════════════════

llama3.1
  Overall: 20/24 (83%)
  Avg Duration: 1523ms
  By Category:
    CRUD: 10/12 (83%)
    Smart: 8/9 (89%)
    FileManagement: 2/3 (67%)
  By Difficulty:
    Easy: 6/6 (100%)
    Medium: 8/10 (80%)
    Hard: 6/8 (75%)
```

**Interpreting Results:**
- **Green ✓**: Model called the correct tool
- **Red ✗**: Model called wrong tool or no tool
- **Accuracy**: (Correct calls / Total tests) × 100
- **Duration**: Full LMAPI response time including inference

**Typical Runtime:**
- ~1-5 seconds per test case
- Total: 2-10 minutes depending on models and test count

**Troubleshooting:**

*"Cannot reach LMAPI"*
- Ensure backend is running: `bun run dev:backend`
- Check LMAPI is at http://localhost:17103

*"No models available"*
- Verify Ollama is running: `ollama list`
- Pull models: `ollama pull llama3-groq-tool-use`

*Low accuracy*
- Some models are better at tool calling
- Models with "tool-use" in name are specifically trained
- Check if model supports function calling

**Exit codes:**
- `0` - All tests completed (check accuracy in report)
- `1` - Fatal error (cannot reach LMAPI, no models, etc.)

**Adding Test Cases:**

Edit `TEST_CASES` array in the script:
```typescript
{
  id: 'unique_test_id',
  prompt: 'Natural language instruction',
  expectedTool: 'mcp_tool_name',
  category: 'CRUD' | 'Smart' | 'FileManagement',
  difficulty: 'Easy' | 'Medium' | 'Hard',
  expectedParams: { /* optional */ },
  description: 'Human-readable description',
}
```

**Comparison with verify-mcp-agent.ts:**
- `verify-mcp-agent.ts`: Tests that MCP server *works correctly* (validation)
- `test-mcp-tools.ts`: Tests which models *use tools best* (comparison)

