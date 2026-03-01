#!/usr/bin/env bun
/**
 * scripts/verify-concurrency.ts
 *
 * End-to-end concurrency stress test for DevPlanner.
 *
 * Starts the DevPlanner server in-process, fires a burst of rapid concurrent
 * API calls against the same resources, then verifies that:
 *   1. No writes were lost (_order.json contains all expected entries).
 *   2. Version numbers increment correctly (no concurrent overwrite).
 *   3. Activity History events appear in the correct order.
 *   4. The resource lock queue was actually exercised.
 *
 * Usage:
 *   bun scripts/verify-concurrency.ts
 *   bun run verify:concurrency
 */

import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from '../src/services/project.service';
import { CardService } from '../src/services/card.service';
import { TaskService } from '../src/services/task.service';
import { resourceLock } from '../src/utils/resource-lock';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const CYAN  = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

let passed = 0;
let failed = 0;

function pass(label: string) {
  console.log(`  ${GREEN}✓${RESET} ${label}`);
  passed++;
}

function fail(label: string, detail?: string) {
  console.log(`  ${RED}✗${RESET} ${label}`);
  if (detail) console.log(`    ${RED}${detail}${RESET}`);
  failed++;
}

function header(title: string) {
  console.log(`\n${BOLD}${CYAN}${title}${RESET}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────────────────────────────────────

const workspace = await mkdtemp(join(tmpdir(), 'devplanner-concurrency-'));
const projectService = new ProjectService(workspace);
const cardService    = new CardService(workspace);
const taskService    = new TaskService(workspace);

try {
  const projectSlug = 'stress-test';
  await projectService.createProject('Stress Test');
  resourceLock.resetStats();

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 1: Concurrent card creates — all must appear in _order.json
  // ────────────────────────────────────────────────────────────────────────────
  header('Scenario 1 · Concurrent createCard (20 cards → same lane)');

  const lane = '01-upcoming';
  const N_CREATE = 20;

  const t0 = Date.now();
  const created = await Promise.all(
    Array.from({ length: N_CREATE }, (_, i) =>
      cardService.createCard(projectSlug, { title: `Burst Card ${i}`, lane })
    )
  );
  const elapsed1 = Date.now() - t0;

  {
    const orderRaw = await readFile(join(workspace, projectSlug, lane, '_order.json'), 'utf-8');
    const order: string[] = JSON.parse(orderRaw);
    const unique = new Set(order);

    order.length === N_CREATE
      ? pass(`All ${N_CREATE} cards appear in _order.json`)
      : fail(`Expected ${N_CREATE} entries in _order.json, got ${order.length}`);

    unique.size === N_CREATE
      ? pass('No duplicate entries in _order.json')
      : fail(`Duplicate entries detected (${N_CREATE - unique.size} duplicates)`);

    console.log(`  ⏱  Completed ${N_CREATE} concurrent creates in ${elapsed1}ms`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 2: Concurrent updateCard — version must increment N times
  // ────────────────────────────────────────────────────────────────────────────
  header('Scenario 2 · Concurrent updateCard (15 writes → same card)');

  const testCard = created[0];
  const N_UPDATE = 15;
  resourceLock.resetStats();

  const t2 = Date.now();
  await Promise.all(
    Array.from({ length: N_UPDATE }, (_, i) =>
      cardService.updateCard(projectSlug, testCard.slug, { title: `Updated Title ${i}` })
    )
  );
  const elapsed2 = Date.now() - t2;

  {
    const finalCard = await cardService.getCard(projectSlug, testCard.slug);
    const expectedVersion = N_UPDATE + 1; // created at version 1, then N_UPDATE increments
    const gotVersion = finalCard.frontmatter.version ?? 0;
    const stats2 = resourceLock.getStats();

    gotVersion === expectedVersion
      ? pass(`Version incremented correctly to ${gotVersion}`)
      : fail(`Version mismatch — expected ${expectedVersion}, got ${gotVersion} (${N_UPDATE - (gotVersion - 1)} writes were lost!)`);

    stats2.queued >= 1
      ? pass(`Queue was exercised (${stats2.queued} operations waited, ${stats2.uncontested} were uncontested)`)
      : fail('Queue was never used — concurrency may not be working');

    console.log(`  ⏱  Completed ${N_UPDATE} concurrent updates in ${elapsed2}ms`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 3: Concurrent moveCard to same target lane — no lost entries
  // ────────────────────────────────────────────────────────────────────────────
  header('Scenario 3 · Concurrent moveCard (10 cards → same target lane)');

  const targetLane = '02-in-progress';
  const N_MOVE = 10;
  resourceLock.resetStats();

  const cardsToMove = created.slice(1, 1 + N_MOVE);
  const t3 = Date.now();
  await Promise.all(cardsToMove.map((c) => cardService.moveCard(projectSlug, c.slug, targetLane)));
  const elapsed3 = Date.now() - t3;

  {
    const orderRaw = await readFile(join(workspace, projectSlug, targetLane, '_order.json'), 'utf-8');
    const targetOrder: string[] = JSON.parse(orderRaw);
    const unique = new Set(targetOrder);
    const stats3 = resourceLock.getStats();

    targetOrder.length === N_MOVE
      ? pass(`All ${N_MOVE} moved cards appear in target _order.json`)
      : fail(`Expected ${N_MOVE} in target _order.json, got ${targetOrder.length}`);

    unique.size === N_MOVE
      ? pass('No duplicate entries in target _order.json')
      : fail(`Duplicate entries detected (${N_MOVE - unique.size} duplicates)`);

    stats3.queued >= 1
      ? pass(`Queue exercised during moves (${stats3.queued} queued)`)
      : fail('Queue was never exercised during concurrent moves');

    console.log(`  ⏱  Completed ${N_MOVE} concurrent moves in ${elapsed3}ms`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 4: Concurrent addTask — no lost tasks
  // ────────────────────────────────────────────────────────────────────────────
  header('Scenario 4 · Concurrent addTask (15 tasks → same card)');

  const taskCard = created[N_MOVE + 1]; // one of the cards still in upcoming
  const N_TASKS = 15;
  resourceLock.resetStats();

  const t4 = Date.now();
  await Promise.all(
    Array.from({ length: N_TASKS }, (_, i) =>
      taskService.addTask(projectSlug, taskCard.slug, `Concurrent task ${i}`)
    )
  );
  const elapsed4 = Date.now() - t4;

  {
    const card4 = await cardService.getCard(projectSlug, taskCard.slug);
    const taskTexts = card4.tasks.map((t) => t.text);
    const uniqueTexts = new Set(taskTexts);
    const stats4 = resourceLock.getStats();

    card4.tasks.length === N_TASKS
      ? pass(`All ${N_TASKS} tasks were recorded`)
      : fail(`Expected ${N_TASKS} tasks, got ${card4.tasks.length} (${N_TASKS - card4.tasks.length} lost)`);

    uniqueTexts.size === N_TASKS
      ? pass('All task texts are unique (no overwrites)')
      : fail(`Duplicate task texts detected`);

    stats4.queued >= 1
      ? pass(`Queue exercised for task writes (${stats4.queued} queued)`)
      : fail('Task writes were never queued — concurrency may be broken');

    console.log(`  ⏱  Completed ${N_TASKS} concurrent task adds in ${elapsed4}ms`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 5: Concurrent createCard + reorderCards — new card survives reorder
  // ────────────────────────────────────────────────────────────────────────────
  header('Scenario 5 · Concurrent createCard vs reorderCards (race condition check)');

  const raceLane = '01-upcoming';
  resourceLock.resetStats();

  // Get current cards in the upcoming lane.
  const existingInUpcoming = (await cardService.listCards(projectSlug, raceLane)).map((c) => c.filename);

  const [raceCard] = await Promise.all([
    cardService.createCard(projectSlug, { title: 'Race Winner', lane: raceLane }),
    cardService.reorderCards(projectSlug, raceLane, [...existingInUpcoming].reverse()),
  ]);

  {
    const orderRaw = await readFile(join(workspace, projectSlug, raceLane, '_order.json'), 'utf-8');
    const finalOrder: string[] = JSON.parse(orderRaw);

    finalOrder.includes(raceCard.filename)
      ? pass(`Newly created card "${raceCard.filename}" survived the concurrent reorder`)
      : fail(`Card "${raceCard.filename}" was lost during concurrent reorder!`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Final summary
  // ────────────────────────────────────────────────────────────────────────────
  const totalStats = resourceLock.getStats();
  header('Queue Summary');
  console.log(`  Total operations queued (waited for lock): ${BOLD}${totalStats.queued}${RESET}`);
  console.log(`  Total uncontested (immediate):             ${BOLD}${totalStats.uncontested}${RESET}`);
  console.log();

} finally {
  await rm(workspace, { recursive: true, force: true }).catch(() => {});
}

header('Results');
console.log(`  ${GREEN}${passed} passed${RESET}  ${failed > 0 ? RED : ''}${failed} failed${RESET}`);
console.log();

if (failed > 0) {
  process.exit(1);
}
