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
