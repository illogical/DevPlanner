/**
 * Concurrency integration tests.
 *
 * Fires multiple concurrent operations against the same resources and verifies
 * that the FIFO resource-lock prevents lost writes, duplicate order entries, and
 * data corruption.
 */
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from '../services/project.service';
import { CardService } from '../services/card.service';
import { TaskService } from '../services/task.service';
import { resourceLock } from '../utils/resource-lock';

describe('Concurrency — concurrent card operations', () => {
  let testWorkspace: string;
  let projectService: ProjectService;
  let cardService: CardService;
  let taskService: TaskService;
  const projectSlug = 'test-project';

  beforeEach(async () => {
    testWorkspace = await mkdtemp(join(tmpdir(), 'devplanner-concurrent-'));
    projectService = new ProjectService(testWorkspace);
    cardService = new CardService(testWorkspace);
    taskService = new TaskService(testWorkspace);
    await projectService.createProject('Test Project');
    resourceLock.resetStats();
  });

  afterEach(async () => {
    await rm(testWorkspace, { recursive: true, force: true }).catch(() => {});
  });

  // -------------------------------------------------------------------------
  // Concurrent updateCard — no data loss
  // -------------------------------------------------------------------------
  test('10 concurrent updateCard calls on the same card all succeed without lost writes', async () => {
    await cardService.createCard(projectSlug, { title: 'Concurrent Card' });
    const cardSlug = 'concurrent-card';

    // Each concurrent call sets a unique tag so we can verify all ran.
    const priorities = [
      'low', 'medium', 'high', 'low', 'medium',
      'high', 'low', 'medium', 'high', 'low',
    ] as const;

    const updates = priorities.map((priority, i) =>
      cardService.updateCard(projectSlug, cardSlug, { priority, title: `Title ${i}` })
    );

    const results = await Promise.all(updates);

    // All promises resolved without throwing.
    expect(results).toHaveLength(10);

    // Each result should have a title set (no undefined overwrites).
    for (const card of results) {
      expect(card.frontmatter.title).toMatch(/^Title \d$/);
    }

    // Version should have been incremented 10 times (started at 1, incremented once per write).
    const finalCard = await cardService.getCard(projectSlug, cardSlug);
    expect(finalCard.frontmatter.version).toBe(11); // 1 + 10 writes

    const stats = resourceLock.getStats();
    expect(stats.queued).toBeGreaterThanOrEqual(1); // At least some contention observed.
  });

  // -------------------------------------------------------------------------
  // Concurrent createCard — no lost order entries
  // -------------------------------------------------------------------------
  test('5 concurrent createCard calls in the same lane all appear in _order.json', async () => {
    const lane = '01-upcoming';

    const creates = Array.from({ length: 5 }, (_, i) =>
      cardService.createCard(projectSlug, { title: `Card ${i}`, lane })
    );

    await Promise.all(creates);

    const orderRaw = await readFile(
      join(testWorkspace, projectSlug, lane, '_order.json'),
      'utf-8'
    );
    const order: string[] = JSON.parse(orderRaw);

    // All 5 cards should appear in the order file.
    expect(order).toHaveLength(5);

    // Each entry should be unique.
    expect(new Set(order).size).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Concurrent moveCard to same target lane — no lost order entries
  // -------------------------------------------------------------------------
  test('5 concurrent moveCard calls to the same target lane produce correct _order.json', async () => {
    const sourceLane = '01-upcoming';
    const targetLane = '02-in-progress';

    // Create 5 cards in the source lane sequentially.
    const slugs: string[] = [];
    for (let i = 0; i < 5; i++) {
      const card = await cardService.createCard(projectSlug, { title: `Moveable ${i}`, lane: sourceLane });
      slugs.push(card.slug);
    }

    // Move all 5 concurrently to the same target lane.
    await Promise.all(slugs.map((slug) =>
      cardService.moveCard(projectSlug, slug, targetLane)
    ));

    const orderRaw = await readFile(
      join(testWorkspace, projectSlug, targetLane, '_order.json'),
      'utf-8'
    );
    const order: string[] = JSON.parse(orderRaw);

    // All 5 filenames should appear in the target lane order.
    expect(order).toHaveLength(5);
    expect(new Set(order).size).toBe(5);

    // Source lane should be empty.
    const sourceOrderRaw = await readFile(
      join(testWorkspace, projectSlug, sourceLane, '_order.json'),
      'utf-8'
    );
    const sourceOrder: string[] = JSON.parse(sourceOrderRaw);
    expect(sourceOrder).toHaveLength(0);

    const stats = resourceLock.getStats();
    expect(stats.queued).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Concurrent createCard + reorderCards — new card survives reorder
  // -------------------------------------------------------------------------
  test('concurrent createCard and reorderCards — new card appears in final order', async () => {
    const lane = '01-upcoming';

    // Create 3 cards first.
    const existing: string[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await cardService.createCard(projectSlug, { title: `Existing ${i}`, lane });
      existing.push(c.filename);
    }

    // Fire concurrent create + reorder.
    const [newCard] = await Promise.all([
      cardService.createCard(projectSlug, { title: 'Brand New', lane }),
      cardService.reorderCards(projectSlug, lane, [...existing].reverse()),
    ]);

    const orderRaw = await readFile(
      join(testWorkspace, projectSlug, lane, '_order.json'),
      'utf-8'
    );
    const order: string[] = JSON.parse(orderRaw);

    // The new card must appear in the final order.
    expect(order).toContain(newCard.filename);
  });

  // -------------------------------------------------------------------------
  // Concurrent addTask — no lost tasks
  // -------------------------------------------------------------------------
  test('10 concurrent addTask calls to the same card all produce distinct tasks', async () => {
    await cardService.createCard(projectSlug, { title: 'Task Card' });
    const cardSlug = 'task-card';

    const taskTexts = Array.from({ length: 10 }, (_, i) => `Task ${i}`);
    await Promise.all(taskTexts.map((text) => taskService.addTask(projectSlug, cardSlug, text)));

    const card = await cardService.getCard(projectSlug, cardSlug);
    expect(card.tasks).toHaveLength(10);

    const texts = new Set(card.tasks.map((t) => t.text));
    expect(texts.size).toBe(10);
  });

  // -------------------------------------------------------------------------
  // Version increments correctly after concurrent writes
  // -------------------------------------------------------------------------
  test('version field increments sequentially under concurrent writes', async () => {
    await cardService.createCard(projectSlug, { title: 'Versioned Card' });
    const cardSlug = 'versioned-card';

    const N = 8;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        cardService.updateCard(projectSlug, cardSlug, { title: `V${i}` })
      )
    );

    const finalCard = await cardService.getCard(projectSlug, cardSlug);
    // Started at version 1 (from createCard), then N increments.
    expect(finalCard.frontmatter.version).toBe(N + 1);
  });
});
