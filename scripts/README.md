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

Live demonstration script that exercises all DevPlanner real-time features. It takes actions via the REST API and direct file edits, with 3-second pauses between actions so you can watch the UI respond with animations in real time.

**What it demonstrates:**
- Project creation (sidebar update)
- Card creation with blue glow + slide-in animations
- Task addition with progress bar updates
- Task completion with green flash + pulse animations
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
