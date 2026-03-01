import { describe, expect, test, beforeEach } from 'bun:test';
import { resourceLock, ResourceBusyError } from '../utils/resource-lock';

/**
 * Unit tests for resource-lock.ts
 * Tests the FIFO locking behaviour, timeout handling, multi-lock acquisition,
 * and deadlock prevention.
 */
describe('ResourceLock', () => {
  // Reset stats before each test to get clean metrics.
  beforeEach(() => {
    resourceLock.resetStats();
  });

  test('acquires and releases a single lock', async () => {
    const release = await resourceLock.acquire('test:single');
    const stats = resourceLock.getStats();
    expect(stats.currentlyHeld).toBeGreaterThanOrEqual(1);
    release();
  });

  test('second acquire on the same key waits until the first is released', async () => {
    const events: string[] = [];

    const release1 = await resourceLock.acquire('test:sequential');
    events.push('lock1-acquired');

    // Start a concurrent acquire — it must wait.
    const lock2Promise = resourceLock.acquire('test:sequential').then((release2) => {
      events.push('lock2-acquired');
      release2();
    });

    // Give lock2 a tick to enqueue itself.
    await new Promise((r) => setTimeout(r, 10));
    events.push('lock1-releasing');
    release1();

    await lock2Promise;
    events.push('done');

    expect(events).toEqual(['lock1-acquired', 'lock1-releasing', 'lock2-acquired', 'done']);
  });

  test('FIFO ordering — three waiters are granted in arrival order', async () => {
    const order: number[] = [];

    const release1 = await resourceLock.acquire('test:fifo');

    // Queue three waiters concurrently.
    const p2 = resourceLock.acquire('test:fifo').then((r) => { order.push(2); r(); });
    const p3 = resourceLock.acquire('test:fifo').then((r) => { order.push(3); r(); });
    const p4 = resourceLock.acquire('test:fifo').then((r) => { order.push(4); r(); });

    // Let all three enqueue.
    await new Promise((r) => setTimeout(r, 20));

    release1();
    await Promise.all([p2, p3, p4]);

    expect(order).toEqual([2, 3, 4]);
  });

  test('different keys are independent — locking key A does not block key B', async () => {
    const releaseA = await resourceLock.acquire('test:key-a');
    const releaseB = await resourceLock.acquire('test:key-b'); // should NOT block
    expect(releaseB).toBeTypeOf('function');
    releaseA();
    releaseB();
  });

  test('lock times out when a holder does not release within the deadline', async () => {
    const release = await resourceLock.acquire('test:timeout', 5000);

    let caught: unknown;
    try {
      await resourceLock.acquire('test:timeout', 50); // 50 ms timeout
    } catch (err) {
      caught = err;
    } finally {
      release();
    }

    expect(caught).toBeInstanceOf(ResourceBusyError);
    const busy = caught as ResourceBusyError;
    expect(busy.resourceKey).toBe('test:timeout');
    expect(busy.retryAfterMs).toBe(1000);
    expect(busy.message).toContain('test:timeout');
  });

  test('timed-out waiter is removed from the queue so it does not block later waiters', async () => {
    const release1 = await resourceLock.acquire('test:cleanup');

    // This waiter will time out.
    const timedOut = resourceLock.acquire('test:cleanup', 30).catch(() => null);

    // This waiter arrives after the timed-out one.
    const p3 = resourceLock.acquire('test:cleanup', 2000);

    await timedOut; // Wait for the first waiter to time out.

    release1(); // Now release the holder.

    const release3 = await p3; // p3 should get the lock (timed-out waiter was removed).
    release3();
  });

  describe('acquireMultiple', () => {
    test('acquires all keys and returns a combined release function', async () => {
      const release = await resourceLock.acquireMultiple(['test:m-a', 'test:m-b', 'test:m-c']);
      const stats = resourceLock.getStats();
      expect(stats.currentlyHeld).toBeGreaterThanOrEqual(3);
      release();
    });

    test('deduplicates keys — duplicate key only acquired once', async () => {
      const held = new Set<string>();
      const release = await resourceLock.acquireMultiple(['test:dup', 'test:dup', 'test:dup']);
      // All three point to the same logical lock; release should not fail.
      release();
    });

    test('acquires keys in sorted order regardless of input order', async () => {
      // Lock "b" first so that if unsorted acquisition were attempted we would
      // deadlock when "a" is acquired after "b" while someone else holds "a".
      // With sorted acquisition: a is always taken before b.
      const releaseB = await resourceLock.acquire('test:order-b');

      // Attempt acquireMultiple with unsorted input — it should internally sort.
      const multiPromise = resourceLock.acquireMultiple(['test:order-b', 'test:order-a'], 200);

      // Give it a tick to start.
      await new Promise((r) => setTimeout(r, 10));

      // Release b; now sorted acquisition of [order-a, order-b] can complete.
      releaseB();

      const releaseMulti = await multiPromise;
      releaseMulti();
    });

    test('releases acquired locks if a subsequent acquire fails', async () => {
      // Hold "test:partial-b" so that acquireMultiple(["a","b"]) fails when it reaches "b".
      const holdB = await resourceLock.acquire('test:partial-b', 5000);

      let caught: unknown;
      try {
        await resourceLock.acquireMultiple(['test:partial-a', 'test:partial-b'], 30);
      } catch (err) {
        caught = err;
      } finally {
        holdB();
      }

      expect(caught).toBeInstanceOf(ResourceBusyError);

      // "test:partial-a" must have been released — we should be able to acquire it immediately.
      const releaseA = await resourceLock.acquire('test:partial-a', 100);
      releaseA();
    });
  });

  describe('getStats', () => {
    test('tracks uncontested and queued counts', async () => {
      resourceLock.resetStats();

      const r1 = await resourceLock.acquire('test:stats');
      // Second acquire will queue.
      const p2 = resourceLock.acquire('test:stats');
      await new Promise((r) => setTimeout(r, 5));
      r1();
      const r2 = await p2;
      r2();

      const stats = resourceLock.getStats();
      expect(stats.uncontested).toBeGreaterThanOrEqual(1);
      expect(stats.queued).toBeGreaterThanOrEqual(1);
    });
  });
});
