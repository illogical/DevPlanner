#!/usr/bin/env bun
/**
 * WebSocket Verification Script
 * 
 * Comprehensive test suite for DevPlanner WebSocket infrastructure (Phase 12)
 * Tests connection, subscription, heartbeat, multi-client scenarios, and error handling
 * 
 * Usage:
 *   bun scripts/verify-websocket.ts
 * 
 * Prerequisites:
 *   - DevPlanner server running on port 17103
 *   - DEVPLANNER_WORKSPACE environment variable set
 */

import type { WebSocketMessage } from '../src/types';

const WS_URL = 'ws://localhost:17103/api/ws';
const TEST_PROJECT = 'test-project';
const TIMEOUT_MS = 45000; // 45 seconds for full test suite

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults: { name: string; status: 'PASS' | 'FAIL'; message?: string }[] = [];

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function pass(testName: string, message?: string): void {
  totalTests++;
  passedTests++;
  testResults.push({ name: testName, status: 'PASS', message });
  log(`✅ PASS: ${testName}${message ? ` - ${message}` : ''}`, colors.green);
}

function fail(testName: string, reason: string): void {
  totalTests++;
  failedTests++;
  testResults.push({ name: testName, status: 'FAIL', message: reason });
  log(`❌ FAIL: ${testName} - ${reason}`, colors.red);
}

function section(title: string): void {
  log(`\n${'='.repeat(80)}`, colors.cyan);
  log(`${colors.bold}${title}`, colors.cyan);
  log('='.repeat(80), colors.cyan);
}

function subsection(title: string): void {
  log(`\n${colors.bold}${title}`, colors.blue);
}

// Helper to wait for a specific message
function waitForMessage(
  ws: WebSocket,
  predicate: (msg: WebSocketMessage) => boolean,
  timeoutMs: number = 5000
): Promise<WebSocketMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for message'));
    }, timeoutMs);

    const handler = (event: MessageEvent) => {
      try {
        const msg: WebSocketMessage = JSON.parse(event.data as string);
        if (predicate(msg)) {
          clearTimeout(timeout);
          ws.removeEventListener('message', handler);
          resolve(msg);
        }
      } catch (err) {
        // Ignore parse errors
      }
    };

    ws.addEventListener('message', handler);
  });
}

// Helper to connect and wait for open
function connectWebSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);

    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timeout);
      resolve(ws);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Connection error'));
    };
  });
}

// Test Suite 1: Basic Connection
async function testBasicConnection(): Promise<void> {
  subsection('Test 1: Basic Connection');

  try {
    const ws = await connectWebSocket();
    pass('Basic connection', 'Connected to WebSocket server');
    ws.close();

    // Wait for close
    await new Promise((resolve) => {
      ws.onclose = resolve;
      setTimeout(resolve, 1000);
    });
  } catch (err) {
    fail('Basic connection', (err as Error).message);
  }
}

// Test Suite 2: Subscribe/Unsubscribe
async function testSubscription(): Promise<void> {
  subsection('Test 2: Subscribe/Unsubscribe');

  try {
    const ws = await connectWebSocket();

    // Test subscribe
    ws.send(JSON.stringify({ type: 'subscribe', projectSlug: TEST_PROJECT }));

    const subMsg = await waitForMessage(
      ws,
      (msg) => msg.type === 'subscribed' && msg.projectSlug === TEST_PROJECT
    );

    if (subMsg.type === 'subscribed' && subMsg.projectSlug === TEST_PROJECT) {
      pass('Subscribe message', 'Received correct subscription confirmation');
    } else {
      fail('Subscribe message', 'Incorrect subscription response');
    }

    // Test unsubscribe
    ws.send(JSON.stringify({ type: 'unsubscribe', projectSlug: TEST_PROJECT }));

    const unsubMsg = await waitForMessage(
      ws,
      (msg) => msg.type === 'unsubscribed' && msg.projectSlug === TEST_PROJECT
    );

    if (unsubMsg.type === 'unsubscribed' && unsubMsg.projectSlug === TEST_PROJECT) {
      pass('Unsubscribe message', 'Received correct unsubscription confirmation');
    } else {
      fail('Unsubscribe message', 'Incorrect unsubscription response');
    }

    ws.close();
    await new Promise((resolve) => {
      ws.onclose = resolve;
      setTimeout(resolve, 1000);
    });
  } catch (err) {
    fail('Subscribe/Unsubscribe', (err as Error).message);
  }
}

// Test Suite 3: Ping/Pong
async function testPingPong(): Promise<void> {
  subsection('Test 3: Ping/Pong Mechanism');

  try {
    const ws = await connectWebSocket();

    // Test client -> server ping
    ws.send(JSON.stringify({ type: 'ping' }));

    const pongMsg = await waitForMessage(ws, (msg) => msg.type === 'pong');

    if (pongMsg.type === 'pong') {
      pass('Client ping', 'Server responded with pong');
    } else {
      fail('Client ping', 'No pong response received');
    }

    // Test server -> client ping (heartbeat)
    subsection('   Waiting for server heartbeat (30s)...');

    const serverPing = await waitForMessage(ws, (msg) => msg.type === 'ping', 35000);

    if (serverPing.type === 'ping') {
      pass('Server heartbeat', 'Received server ping after ~30 seconds');

      // Respond with pong
      ws.send(JSON.stringify({ type: 'pong' }));
      pass('Heartbeat response', 'Sent pong response to server');
    } else {
      fail('Server heartbeat', 'No heartbeat ping received');
    }

    ws.close();
    await new Promise((resolve) => {
      ws.onclose = resolve;
      setTimeout(resolve, 1000);
    });
  } catch (err) {
    fail('Ping/Pong', (err as Error).message);
  }
}

// Test Suite 4: Error Handling
async function testErrorHandling(): Promise<void> {
  subsection('Test 4: Error Handling');

  try {
    const ws = await connectWebSocket();

    // Test invalid message type
    ws.send(JSON.stringify({ type: 'invalid' }));

    const errorMsg = await waitForMessage(ws, (msg) => msg.type === 'error');

    if (errorMsg.type === 'error' && errorMsg.error) {
      pass('Invalid message type', `Server returned error: "${errorMsg.error}"`);
    } else {
      fail('Invalid message type', 'No error response received');
    }

    // Test subscribe without projectSlug
    ws.send(JSON.stringify({ type: 'subscribe' }));

    const errorMsg2 = await waitForMessage(ws, (msg) => msg.type === 'error');

    if (errorMsg2.type === 'error') {
      pass('Missing projectSlug', 'Server returned error for missing field');
    } else {
      fail('Missing projectSlug', 'No error response received');
    }

    // Test malformed JSON
    ws.send('not valid json');

    const errorMsg3 = await waitForMessage(ws, (msg) => msg.type === 'error');

    if (errorMsg3.type === 'error') {
      pass('Malformed JSON', 'Server handled parse error gracefully');
    } else {
      fail('Malformed JSON', 'No error response received');
    }

    ws.close();
    await new Promise((resolve) => {
      ws.onclose = resolve;
      setTimeout(resolve, 1000);
    });
  } catch (err) {
    fail('Error handling', (err as Error).message);
  }
}

// Test Suite 5: Multi-Client Scenario
async function testMultiClient(): Promise<void> {
  subsection('Test 5: Multi-Client Scenario');

  try {
    // Connect two clients
    const ws1 = await connectWebSocket();
    const ws2 = await connectWebSocket();

    pass('Multi-client connection', 'Two clients connected simultaneously');

    // Both subscribe to same project
    ws1.send(JSON.stringify({ type: 'subscribe', projectSlug: TEST_PROJECT }));
    ws2.send(JSON.stringify({ type: 'subscribe', projectSlug: TEST_PROJECT }));

    const sub1 = await waitForMessage(ws1, (msg) => msg.type === 'subscribed');
    const sub2 = await waitForMessage(ws2, (msg) => msg.type === 'subscribed');

    if (sub1.type === 'subscribed' && sub2.type === 'subscribed') {
      pass('Multi-client subscription', 'Both clients subscribed to same project');
    } else {
      fail('Multi-client subscription', 'Subscription failed for one or both clients');
    }

    // Close one client
    ws1.close();
    await new Promise((resolve) => {
      ws1.onclose = resolve;
      setTimeout(resolve, 1000);
    });

    // Second client should still work
    ws2.send(JSON.stringify({ type: 'ping' }));
    const pong = await waitForMessage(ws2, (msg) => msg.type === 'pong');

    if (pong.type === 'pong') {
      pass('Client cleanup', 'Remaining client still functional after other disconnected');
    } else {
      fail('Client cleanup', 'Remaining client not responding');
    }

    ws2.close();
    await new Promise((resolve) => {
      ws2.onclose = resolve;
      setTimeout(resolve, 1000);
    });
  } catch (err) {
    fail('Multi-client scenario', (err as Error).message);
  }
}

// Test Suite 6: Reconnection
async function testReconnection(): Promise<void> {
  subsection('Test 6: Reconnection');

  try {
    const ws1 = await connectWebSocket();
    ws1.send(JSON.stringify({ type: 'subscribe', projectSlug: TEST_PROJECT }));
    await waitForMessage(ws1, (msg) => msg.type === 'subscribed');

    // Close and reconnect
    ws1.close();
    await new Promise((resolve) => {
      ws1.onclose = resolve;
      setTimeout(resolve, 1000);
    });

    pass('Client disconnect', 'First connection closed cleanly');

    const ws2 = await connectWebSocket();
    ws2.send(JSON.stringify({ type: 'subscribe', projectSlug: TEST_PROJECT }));
    const sub2 = await waitForMessage(ws2, (msg) => msg.type === 'subscribed');

    if (sub2.type === 'subscribed') {
      pass('Client reconnect', 'New client can subscribe after previous disconnect');
    } else {
      fail('Client reconnect', 'Reconnection failed');
    }

    ws2.close();
    await new Promise((resolve) => {
      ws2.onclose = resolve;
      setTimeout(resolve, 1000);
    });
  } catch (err) {
    fail('Reconnection', (err as Error).message);
  }
}

// Print summary
function printSummary(): void {
  section('Test Summary');

  log(`\nTotal Tests: ${totalTests}`, colors.bold);
  log(`Passed: ${passedTests}`, colors.green);
  log(`Failed: ${failedTests}`, failedTests > 0 ? colors.red : colors.reset);

  if (failedTests > 0) {
    log('\nFailed Tests:', colors.red);
    testResults
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        log(`  - ${r.name}: ${r.message}`, colors.red);
      });
  }

  const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : '0.0';
  log(`\nSuccess Rate: ${successRate}%`, colors.bold);

  if (failedTests === 0) {
    log('\n🎉 All tests passed! WebSocket infrastructure is working correctly.', colors.green);
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', colors.yellow);
  }

  log('\n' + '='.repeat(80) + '\n', colors.cyan);
}

// Main test runner
async function runTests(): Promise<void> {
  section('DevPlanner WebSocket Verification Suite');
  log(`WebSocket URL: ${WS_URL}`, colors.blue);
  log(`Test Project: ${TEST_PROJECT}`, colors.blue);
  log(`Timeout: ${TIMEOUT_MS}ms\n`, colors.blue);

  try {
    await testBasicConnection();
    await testSubscription();
    await testPingPong();
    await testErrorHandling();
    await testMultiClient();
    await testReconnection();
  } catch (err) {
    log(`\n❌ Test suite error: ${(err as Error).message}`, colors.red);
  }

  printSummary();

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

// Set timeout for entire test suite
const testTimeout = setTimeout(() => {
  log('\n⏱️  Test suite timeout reached!', colors.red);
  printSummary();
  process.exit(1);
}, TIMEOUT_MS);

// Run tests
runTests()
  .then(() => {
    clearTimeout(testTimeout);
  })
  .catch((err) => {
    clearTimeout(testTimeout);
    log(`\n❌ Fatal error: ${err.message}`, colors.red);
    process.exit(1);
  });
