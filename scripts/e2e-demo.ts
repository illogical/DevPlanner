#!/usr/bin/env bun
/**
 * E2E Demo Script
 *
 * Exercises all DevPlanner real-time features by taking actions via the REST API
 * and direct file edits, with pauses between actions so you can watch the UI
 * respond with animations in real time.
 *
 * Usage:
 *   bun scripts/e2e-demo.ts
 *
 * Prerequisites:
 *   - DevPlanner server running (bun run dev)
 *   - Frontend open in browser (http://localhost:5173)
 *   - DEVPLANNER_WORKSPACE environment variable set
 */

import matter from 'gray-matter';
import { readFile, writeFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'http://localhost:17103/api';
const PROJECT_NAME = 'E2E Demo';
const PROJECT_SLUG = 'e2e-demo';
const PAUSE_MS = 3000;
const TIMEOUT_MS = 90000;

// ---------------------------------------------------------------------------
// Terminal colors
// ---------------------------------------------------------------------------

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(msg: string, color = c.reset): void {
  console.log(`${color}${msg}${c.reset}`);
}

function section(title: string): void {
  log(`\n${'='.repeat(64)}`, c.cyan);
  log(`  ${title}`, `${c.bold}${c.cyan}`);
  log('='.repeat(64), c.cyan);
}

function action(msg: string): void {
  log(`\n  → ${msg}`, c.blue);
}

function watch(msg: string): void {
  log(`  👀 ${msg}`, c.yellow);
}

function ok(msg: string): void {
  log(`  ✓ ${msg}`, c.green);
}

function error(msg: string): void {
  log(`  ✗ ${msg}`, c.red);
}

function info(msg: string): void {
  log(`    ${msg}`, c.dim);
}

async function pause(): Promise<void> {
  log(`\n  ⏳ pausing ${PAUSE_MS / 1000}s...`, c.dim);
  await sleep(PAUSE_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : null,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(
      `API ${method} ${path} failed (${res.status}): ${(err as { message?: string }).message || JSON.stringify(err)}`
    );
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------

async function checkPrerequisites(): Promise<string> {
  // Check workspace env var
  const workspacePath = process.env.DEVPLANNER_WORKSPACE;
  if (!workspacePath) {
    error('DEVPLANNER_WORKSPACE environment variable is not set.');
    info('Set it to your workspace path, e.g.:');
    info('  export DEVPLANNER_WORKSPACE="$PWD/workspace"');
    process.exit(1);
  }

  // Check server is running
  try {
    await fetch(`${API_BASE}/projects`);
    ok('Server is running');
  } catch {
    error('Cannot connect to server at http://localhost:17103');
    info('Start the server first: bun run dev');
    process.exit(1);
  }

  return workspacePath;
}

async function cleanupPreviousRun(workspacePath: string): Promise<void> {
  // Check if project exists and clear its cards (preserve project so frontend stays focused)
  try {
    action(`Checking for existing "${PROJECT_NAME}" project...`);
    const response = await fetch(`${API_BASE}/projects/${PROJECT_SLUG}`);
    
    if (response.ok) {
      info('Project exists — clearing all existing cards...');
      
      // Fetch all cards from all lanes
      const { cards } = await api<{ cards: any[] }>('GET', `/projects/${PROJECT_SLUG}/cards`);
      
      if (cards.length > 0) {
        watch('Watch the UI — cards will be hard-deleted one by one');
        info(`Deleting ${cards.length} cards...`);
        
        // Hard delete each card via API so WebSocket events are broadcast
        for (const card of cards) {
          await api('DELETE', `/projects/${PROJECT_SLUG}/cards/${card.slug}?hard=true`);
          info(`  ✓ Deleted: ${card.slug}`);
          await sleep(300); // Short delay so user can see cards disappear
        }
        
        ok(`Deleted ${cards.length} cards`);
        
        // Wait for WebSocket propagation
        info('Waiting for WebSocket sync...');
        await sleep(1000);
        
        // Verify cleanup
        const { cards: remaining } = await api<{ cards: any[] }>('GET', `/projects/${PROJECT_SLUG}/cards`);
        if (remaining.length === 0) {
          ok('✓ Verified: All cards cleared from project');
        } else {
          error(`⚠ Warning: ${remaining.length} cards still remain after cleanup`);
          remaining.forEach(c => info(`  - ${c.slug} in ${c.lane}`));
        }
      } else {
        ok('No cards to clear');
      }
    } else {
      info('Project does not exist yet — will be created in Act 1');
    }
  } catch (err) {
    info('Project does not exist yet — will be created in Act 1');
  }
}

// ---------------------------------------------------------------------------
// ACT 1: Ensure Project Exists
// ---------------------------------------------------------------------------

async function act1_ensureProject(): Promise<void> {
  section('ACT 1: Setting the Stage');

  // Check if project already exists
  try {
    const response = await fetch(`${API_BASE}/projects/${PROJECT_SLUG}`);
    
    if (response.ok) {
      ok(`Project "${PROJECT_NAME}" already exists`);
      info('Frontend should remain focused on this project throughout the demo');
    } else {
      // Project doesn't exist, create it
      action(`Creating project "${PROJECT_NAME}"...`);
      await api('POST', '/projects', {
        name: PROJECT_NAME,
        description: 'End-to-end demo of real-time features',
      });
      ok(`Project created: ${PROJECT_SLUG}`);
      watch('Look at the sidebar — a new project should appear');
      info('Click on it now to watch the rest of the demo!');
    }
  } catch (err) {
    // Project doesn't exist, create it
    action(`Creating project "${PROJECT_NAME}"...`);
    await api('POST', '/projects', {
      name: PROJECT_NAME,
      description: 'End-to-end demo of real-time features',
    });
    ok(`Project created: ${PROJECT_SLUG}`);
    watch('Look at the sidebar — a new project should appear');
    info('Click on it now to watch the rest of the demo!');
  }
  
  await pause();
}

// ---------------------------------------------------------------------------
// ACT 2: Create Cards
// ---------------------------------------------------------------------------

async function act2_createCards(): Promise<void> {
  section('ACT 2: Populating the Board');

  // Card 1 — Upcoming
  action('Creating card "Navigation System" in Upcoming...');
  await api('POST', `/projects/${PROJECT_SLUG}/cards`, {
    title: 'Navigation System',
    lane: '01-upcoming',
    priority: 'high',
    assignee: 'agent',
    tags: ['core', 'nav'],
    content:
      'Design and implement the spacecraft navigation system.\n\nRequires star chart integration and autopilot module.',
  });
  ok('Card created: navigation-system');
  watch('Blue glow + slide-in animation in the Upcoming lane');
  await pause();

  // Card 2 — Upcoming
  action('Creating card "Hull Integrity Monitor" in Upcoming...');
  await api('POST', `/projects/${PROJECT_SLUG}/cards`, {
    title: 'Hull Integrity Monitor',
    lane: '01-upcoming',
    priority: 'medium',
    assignee: 'user',
    tags: ['safety', 'sensors'],
    content: 'Real-time hull integrity monitoring system with structural alerts.',
  });
  ok('Card created: hull-integrity-monitor');
  watch('Another blue glow in Upcoming — second card slides in');
  await pause();

  // Card 3 — In Progress
  action('Creating card "Fuel Cell Optimizer" in In Progress...');
  await api('POST', `/projects/${PROJECT_SLUG}/cards`, {
    title: 'Fuel Cell Optimizer',
    lane: '02-in-progress',
    priority: 'high',
    assignee: 'user',
    tags: ['propulsion', 'efficiency'],
    status: 'in-progress' as const,
    content: 'Optimize fuel cell energy output for deep space travel.',
  });
  ok('Card created: fuel-cell-optimizer');
  watch('Blue glow appearing directly in the In Progress lane');
  await pause();
}

// ---------------------------------------------------------------------------
// ACT 3: Add Tasks
// ---------------------------------------------------------------------------

async function act3_addTasks(): Promise<void> {
  section('ACT 3: Adding Tasks');

  const navTasks = [
    'Integrate star chart database',
    'Build autopilot module',
    'Implement collision avoidance',
  ];

  for (const text of navTasks) {
    action(`Adding task to Navigation System: "${text}"`);
    await api('POST', `/projects/${PROJECT_SLUG}/cards/navigation-system/tasks`, { text });
    ok('Task added');
    watch('Task progress indicator updates on the Navigation System card');
    await pause();
  }

  const fuelTasks = [
    'Benchmark current efficiency',
    'Implement power routing algorithm',
  ];

  for (const text of fuelTasks) {
    action(`Adding task to Fuel Cell Optimizer: "${text}"`);
    await api('POST', `/projects/${PROJECT_SLUG}/cards/fuel-cell-optimizer/tasks`, { text });
    ok('Task added');
    watch('Task count updates on the Fuel Cell Optimizer card');
    await pause();
  }
}

// ---------------------------------------------------------------------------
// ACT 4: Toggle Tasks
// ---------------------------------------------------------------------------

async function act4_toggleTasks(): Promise<void> {
  section('ACT 4: Completing Tasks');

  action('Checking off "Benchmark current efficiency" on Fuel Cell Optimizer...');
  await api('PATCH', `/projects/${PROJECT_SLUG}/cards/fuel-cell-optimizer/tasks/0`, {
    checked: true,
  });
  ok('Task completed (1/2)');
  watch('Green flash + pulse on the Fuel Cell Optimizer progress bar');
  await pause();

  action('Checking off "Integrate star chart database" on Navigation System...');
  await api('PATCH', `/projects/${PROJECT_SLUG}/cards/navigation-system/tasks/0`, {
    checked: true,
  });
  ok('Task completed (1/3)');
  watch('Green flash + pulse on the Navigation System progress bar');
  await pause();
}

// ---------------------------------------------------------------------------
// ACT 4B: Rapid Task Toggle (Concurrent Update Test)
// ---------------------------------------------------------------------------

async function act4b_rapidTaskToggle(): Promise<void> {
  section('ACT 4B: Rapid-Fire Task Completion (Stress Test)');

  info('Toggling multiple tasks in quick succession (500ms intervals)');
  watch('Verify frontend handles concurrent updates without race conditions');

  action('Checking off "Build autopilot module" on Navigation System...');
  await api('PATCH', `/projects/${PROJECT_SLUG}/cards/navigation-system/tasks/1`, {
    checked: true,
  });
  ok('Task completed (2/3)');
  await sleep(500); // Short delay, not full pause

  action('Checking off "Implement collision avoidance" on Navigation System...');
  await api('PATCH', `/projects/${PROJECT_SLUG}/cards/navigation-system/tasks/2`, {
    checked: true,
  });
  ok('Task completed (3/3) — all Navigation tasks complete!');
  await sleep(500);

  action('Checking off "Implement power routing algorithm" on Fuel Cell Optimizer...');
  await api('PATCH', `/projects/${PROJECT_SLUG}/cards/fuel-cell-optimizer/tasks/1`, {
    checked: true,
  });
  ok('Task completed (2/2) — all Fuel Cell tasks complete!');
  watch('All three animations should appear without flickering or disappearing tasks');
  await pause();
}

// ---------------------------------------------------------------------------
// ACT 6: Move Card Between Lanes
// ---------------------------------------------------------------------------

async function act6_moveCard(): Promise<void> {
  section('ACT 6: Moving Cards');

  action('Moving "Navigation System" from Upcoming → In Progress...');
  await api('PATCH', `/projects/${PROJECT_SLUG}/cards/navigation-system/move`, {
    lane: '02-in-progress',
  });
  ok('Card moved to In Progress');
  watch('Card disappears from Upcoming and appears in In Progress with amber glow');
  await pause();
}

// ---------------------------------------------------------------------------
// ACT 7: Reorder Cards
// ---------------------------------------------------------------------------

async function act7_reorderCards(): Promise<void> {
  section('ACT 7: Reordering Cards');

  // Fetch current order
  action('Fetching current card order in In Progress...');
  const beforeCards = await api<{ cards: any[] }>('GET', `/projects/${PROJECT_SLUG}/cards?lane=02-in-progress`);
  const beforeOrder = beforeCards.cards.map(c => c.slug);
  const beforeFilenames = beforeCards.cards.map(c => c.filename);
  info(`Current order (slugs): ${beforeOrder.join(', ')}`);
  info(`Current order (filenames): ${beforeFilenames.join(', ')}`);

  action('Swapping card order in In Progress lane...');
  info('Sending new order: fuel-cell-optimizer.md FIRST, navigation-system.md SECOND');
  info('This should REVERSE the current alphabetical order');
  watch('⚠️ IMPORTANT: Check your browser console for WebSocket logs!');
  watch('Look for "[WebSocket] ========== RECEIVED lane:reordered EVENT ==========" ');
  
  // Reverse the current order to ensure we see a visual change
  const newOrder = ['fuel-cell-optimizer.md', 'navigation-system.md'];
  const response = await api<{ lane: string; order: string[] }>('PATCH', `/projects/${PROJECT_SLUG}/lanes/02-in-progress/order`, {
    order: newOrder,
  });
  
  info(`API response - lane: ${response.lane}, order: ${response.order.join(', ')}`);
  ok('Reorder API call completed');
  watch('Cards should swap positions in the In Progress lane');
  watch('Fuel Cell Optimizer should now be FIRST, Navigation System SECOND');
  watch('If cards don\'t move, check if WebSocket is connected (green indicator in UI)');
  
  // Wait longer for WebSocket propagation and file system sync
  info('Waiting 3 seconds for WebSocket event to propagate...');
  await sleep(3000);
  
  // Verify the reorder
  action('Verifying card positions...');
  const afterCards = await api<{ cards: any[] }>('GET', `/projects/${PROJECT_SLUG}/cards?lane=02-in-progress`);
  const afterOrder = afterCards.cards.map(c => c.slug);
  const afterFilenames = afterCards.cards.map(c => c.filename);
  
  info(`After reorder (slugs): ${afterOrder.join(', ')}`);
  info(`After reorder (filenames): ${afterFilenames.join(', ')}`);
  
  const expectedOrder = ['fuel-cell-optimizer', 'navigation-system'];
  const orderMatches = afterOrder.length === expectedOrder.length && 
                      afterOrder.every((slug, i) => slug === expectedOrder[i]);
  
  if (orderMatches) {
    ok('✓ Cards are in correct order (reversed from alphabetical)');
  } else {
    error(`❌ VERIFICATION FAILED: Expected [${expectedOrder.join(', ')}], got [${afterOrder.join(', ')}]`);
  }
  
  await pause();
}

// ---------------------------------------------------------------------------
// ACT 8: Direct File Edit (File Watcher Test)
// ---------------------------------------------------------------------------

async function act8_directFileEdit(workspacePath: string): Promise<void> {
  section('ACT 8: File Watcher Test (Direct Disk Edit)');

  const filePath = join(
    workspacePath,
    PROJECT_SLUG,
    '02-in-progress',
    'fuel-cell-optimizer.md'
  );

  action('Writing directly to fuel-cell-optimizer.md on disk...');
  info('This bypasses the API entirely — tests the file watcher → WebSocket → UI pipeline');

  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = matter(raw);

    // Modify frontmatter
    parsed.data.priority = 'low';
    parsed.data.assignee = 'agent';
    parsed.data.tags = [...(parsed.data.tags || []), 'optimized'];
    parsed.data.updated = new Date().toISOString();

    const updated = matter.stringify(parsed.content, parsed.data);
    await writeFile(filePath, updated, 'utf-8');

    ok('File written — priority: high→low, assignee: user→agent, added tag "optimized"');
    watch('Violet glow animation on the Fuel Cell Optimizer card (3s duration)');
  } catch (err) {
    error(`Failed to edit file: ${(err as Error).message}`);
    info(`Expected file at: ${filePath}`);
  }

  await pause();
}

// ---------------------------------------------------------------------------
// ACT 9: Archive a Card
// ---------------------------------------------------------------------------

async function act9_archiveCard(): Promise<void> {
  section('ACT 9: Archiving a Card');

  // Get initial card counts
  action('Fetching initial lane counts...');
  const beforeUpcoming = await api<{ cards: any[] }>('GET', `/projects/${PROJECT_SLUG}/cards?lane=01-upcoming`);
  const beforeArchive = await api<{ cards: any[] }>('GET', `/projects/${PROJECT_SLUG}/cards?lane=04-archive`);
  
  info(`Before: Upcoming has ${beforeUpcoming.cards.length} cards, Archive has ${beforeArchive.cards.length} cards`);
  
  // Verify the card exists before archiving
  const targetCard = beforeUpcoming.cards.find(c => c.slug === 'hull-integrity-monitor');
  if (!targetCard) {
    error('❌ Card "hull-integrity-monitor" not found in Upcoming!');
    info('Available cards in Upcoming:');
    beforeUpcoming.cards.forEach(c => info(`  - ${c.slug}`));
    return;
  }
  
  info(`Found target card: ${targetCard.slug} in lane ${targetCard.lane}`);

  action('Archiving "Hull Integrity Monitor"...');
  await api('DELETE', `/projects/${PROJECT_SLUG}/cards/hull-integrity-monitor`);
  ok('Card archived');
  watch('Card should disappear from Upcoming and appear in Archive');
  
  // Longer pause for file move and WebSocket propagation
  await sleep(1500);
  
  // Verify the move
  action('Verifying archive operation...');
  const afterUpcoming = await api<{ cards: any[] }>('GET', `/projects/${PROJECT_SLUG}/cards?lane=01-upcoming`);
  const afterArchive = await api<{ cards: any[] }>('GET', `/projects/${PROJECT_SLUG}/cards?lane=04-archive`);
  
  info(`After: Upcoming has ${afterUpcoming.cards.length} cards, Archive has ${afterArchive.cards.length} cards`);
  
  // Verify card is not in Upcoming
  const stillInUpcoming = afterUpcoming.cards.some(c => c.slug === 'hull-integrity-monitor');
  if (stillInUpcoming) {
    error('❌ VERIFICATION FAILED: Card still in Upcoming lane!');
  } else {
    ok('✓ Card removed from Upcoming');
  }
  
  // Verify card is in Archive
  const inArchive = afterArchive.cards.some(c => c.slug === 'hull-integrity-monitor');
  if (!inArchive) {
    error('❌ VERIFICATION FAILED: Card not found in Archive lane!');
    info('Cards currently in Archive:');
    afterArchive.cards.forEach(c => info(`  - ${c.slug}`));
  } else {
    ok('✓ Card found in Archive');
  }
  
  // Verify counts changed correctly
  if (afterUpcoming.cards.length === beforeUpcoming.cards.length - 1 && 
      afterArchive.cards.length === beforeArchive.cards.length + 1) {
    ok('✓ Lane counts updated correctly');
  } else {
    error(`❌ VERIFICATION FAILED: Expected Upcoming: ${beforeUpcoming.cards.length - 1}, got ${afterUpcoming.cards.length}; Expected Archive: ${beforeArchive.cards.length + 1}, got ${afterArchive.cards.length}`);
  }
  
  await pause();
}

// ---------------------------------------------------------------------------
// ACT 9B: Verify Archive Persistence
// ---------------------------------------------------------------------------

async function act9b_verifyArchivePersistence(): Promise<void> {
  section('ACT 9B: Archive Persistence Check');
  
  info('Waiting 2 seconds to ensure no race conditions cause card reappearance...');
  await sleep(2000);
  
  action('Re-fetching all cards to verify archived card stayed in archive...');
  const allCards = await api<{ cards: any[] }>('GET', `/projects/${PROJECT_SLUG}/cards`);
  
  info(`Total cards in project: ${allCards.cards.length}`);
  
  // List all cards by lane for debugging
  const cardsByLane: Record<string, string[]> = {};
  allCards.cards.forEach(c => {
    if (!cardsByLane[c.lane]) {
      cardsByLane[c.lane] = [];
    }
    cardsByLane[c.lane]!.push(c.slug);
  });
  
  Object.entries(cardsByLane).forEach(([lane, slugs]) => {
    info(`  ${lane}: ${slugs.join(', ')}`);
  });
  
  // Check if hull-integrity-monitor appears in any non-archive lane
  const nonArchiveLanes = ['01-upcoming', '02-in-progress', '03-complete'];
  const foundInWrongLane = allCards.cards.find(c => 
    c.slug === 'hull-integrity-monitor' && nonArchiveLanes.includes(c.lane)
  );
  
  if (foundInWrongLane) {
    error(`❌ BUG DETECTED: Archived card reappeared in ${foundInWrongLane.lane}!`);
  } else {
    ok('✓ Archived card remained in archive (no reappearance)');
  }
  
  // Verify it's still in archive
  const stillInArchive = allCards.cards.find(c => 
    c.slug === 'hull-integrity-monitor' && c.lane === '04-archive'
  );
  
  if (stillInArchive) {
    ok('✓ Card confirmed in archive lane');
  } else {
    error('❌ BUG DETECTED: Archived card disappeared completely!');
    // Check if there's a variant with a different slug (e.g., hull-integrity-monitor-2)
    const variants = allCards.cards.filter(c => c.slug.startsWith('hull-integrity-monitor'));
    if (variants.length > 0) {
      error(`Found ${variants.length} variant(s) with similar slug:`);
      variants.forEach(v => info(`  - ${v.slug} in ${v.lane}`));
    }
  }
  
  await pause();
}

// ---------------------------------------------------------------------------
// ACT 10: Update Project Metadata
// ---------------------------------------------------------------------------

async function act10_updateProject(): Promise<void> {
  section('ACT 10: Updating Project');

  action('Updating project description...');
  await api('PATCH', `/projects/${PROJECT_SLUG}`, {
    description: 'Spaceship launch system — all systems nominal. Demo complete!',
  });
  ok('Project metadata updated');
  watch('Project description updates if visible in sidebar');
  await pause();
}

// ---------------------------------------------------------------------------
// Finale: Activity History
// ---------------------------------------------------------------------------

interface HistoryEvent {
  id: string;
  timestamp: string;
  action: string;
  description: string;
}

async function finale_showHistory(): Promise<void> {
  section('Finale: Activity History');

  action('Fetching activity history...');

  try {
    const data = await api<{ events: HistoryEvent[]; total: number }>(
      'GET',
      `/projects/${PROJECT_SLUG}/history?limit=20`
    );

    if (data.events.length === 0) {
      info('No history events recorded (history may require WebSocket events to propagate)');
    } else {
      log('');
      log(
        `  ${'#'.padEnd(4)} ${'Time'.padEnd(12)} ${'Action'.padEnd(18)} Description`,
        c.bold
      );
      log(`  ${'─'.repeat(4)} ${'─'.repeat(12)} ${'─'.repeat(18)} ${'─'.repeat(28)}`, c.dim);

      data.events.forEach((event, i) => {
        const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const num = String(i + 1).padEnd(4);
        const act = event.action.padEnd(18);
        log(`  ${num} ${time.padEnd(12)} ${act} ${event.description}`, c.reset);
      });

      log(`\n  Total events: ${data.total}`, c.dim);
    }
  } catch (err) {
    error(`Failed to fetch history: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runDemo(): Promise<void> {
  section('DevPlanner E2E Demo');
  log(`  Server:    ${c.blue}http://localhost:17103${c.reset}`);
  log(`  Project:   ${c.blue}${PROJECT_NAME} (${PROJECT_SLUG})${c.reset}`);
  log(`  Delay:     ${c.blue}${PAUSE_MS / 1000}s between actions${c.reset}`);

  const workspacePath = await checkPrerequisites();
  log(`  Workspace: ${c.blue}${workspacePath}${c.reset}`);

  await cleanupPreviousRun(workspacePath);

  try {
    await act1_ensureProject();
  } catch (err) {
    error(`Project creation failed: ${(err as Error).message}`);
    error('Cannot continue without a project. Aborting.');
    process.exit(1);
  }

  const acts = [
    { fn: act2_createCards, name: 'Create Cards' },
    { fn: act3_addTasks, name: 'Add Tasks' },
    { fn: act4_toggleTasks, name: 'Toggle Tasks' },
    { fn: act4b_rapidTaskToggle, name: 'Rapid Task Toggle' },
    { fn: act6_moveCard, name: 'Move Card' },
    { fn: act7_reorderCards, name: 'Reorder Cards' },
    { fn: () => act8_directFileEdit(workspacePath), name: 'Direct File Edit' },
    { fn: act9_archiveCard, name: 'Archive Card' },
    { fn: act9b_verifyArchivePersistence, name: 'Verify Archive Persistence' },
    { fn: act10_updateProject, name: 'Update Project' },
    { fn: finale_showHistory, name: 'Show History' },
  ];

  for (const act of acts) {
    try {
      await act.fn();
    } catch (err) {
      error(`${act.name} failed: ${(err as Error).message}`);
      info('Continuing to next step...');
      await pause();
    }
  }

  section('Demo Complete!');
  log('');
  log(`  The "${PROJECT_NAME}" project has been left in place.`, c.green);
  log(`  Open ${c.blue}http://localhost:5173${c.reset} to explore it.`);
  log('');
  log(`  To run again, just re-run the script — it resets automatically.`, c.dim);
  log('');
}

// Global timeout
const timeout = setTimeout(() => {
  error('\nDemo timed out!');
  process.exit(1);
}, TIMEOUT_MS);

runDemo()
  .then(() => {
    clearTimeout(timeout);
    process.exit(0);
  })
  .catch((err) => {
    clearTimeout(timeout);
    error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
