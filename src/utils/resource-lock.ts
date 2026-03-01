/**
 * Per-resource FIFO locking utility.
 *
 * Provides exclusive access to named resources (e.g. card files, lane order
 * files, project configs) without requiring external dependencies. Uses an
 * in-memory queue so that concurrent callers are granted the lock in arrival
 * order (FIFO), preventing starvation.
 *
 * All services share the singleton `resourceLock` instance so that task, card,
 * link, and project operations are all serialised against the same key space.
 * This is the replacement for the per-service private lock Maps that previously
 * existed in TaskService and LinkService.
 *
 * ### Key naming conventions
 * | Resource          | Key pattern                               | Example                              |
 * |-------------------|-------------------------------------------|--------------------------------------|
 * | Card file         | `${projectSlug}:card:${cardSlug}`         | `my-project:card:add-login-page`     |
 * | Lane order file   | `${projectSlug}:order:${laneDir}`         | `my-project:order:01-upcoming`       |
 * | Project config    | `${projectSlug}:config`                   | `my-project:config`                  |
 */

export class ResourceBusyError extends Error {
  public readonly resourceKey: string;
  public readonly retryAfterMs = 1000;

  constructor(key: string) {
    super(`Resource "${key}" is busy. Another operation is in progress.`);
    this.name = 'ResourceBusyError';
    this.resourceKey = key;
  }
}

class ResourceLock {
  private queues: Map<string, Array<() => void>> = new Map();
  private held: Set<string> = new Set();
  /** Total number of times an operation had to wait in queue (trace metric). */
  private queuedCount = 0;
  /** Total number of times a lock was acquired without waiting (uncontested). */
  private uncontestedCount = 0;

  /**
   * Acquire an exclusive lock on a resource key.
   *
   * If the lock is currently free it is granted immediately. If it is held,
   * the caller is placed at the back of a FIFO queue and will be granted the
   * lock once all earlier waiters have finished.
   *
   * @param key - Resource identifier string.
   * @param timeoutMs - Max wait time before a `ResourceBusyError` is thrown.
   * @returns A release function that **must** be called in a `finally` block.
   */
  async acquire(key: string, timeoutMs = 5000): Promise<() => void> {
    if (!this.held.has(key)) {
      // Lock is free — grant immediately (uncontested path).
      this.held.add(key);
      this.uncontestedCount++;
      return () => this.release(key);
    }

    // Lock is held — queue the caller and wait.
    this.queuedCount++;
    const queueDepth = (this.queues.get(key)?.length ?? 0) + 1;
    console.log(
      `[ResourceLock] QUEUED operation for key="${key}" (queue depth: ${queueDepth}, ` +
        `total queued so far: ${this.queuedCount})`
    );

    return new Promise<() => void>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove this waiter from the queue on timeout.
        const queue = this.queues.get(key);
        if (queue) {
          const idx = queue.indexOf(grant);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) this.queues.delete(key);
        }
        console.warn(`[ResourceLock] TIMEOUT waiting for key="${key}" after ${timeoutMs}ms`);
        reject(new ResourceBusyError(key));
      }, timeoutMs);

      const grant = () => {
        clearTimeout(timer);
        this.held.add(key);
        console.log(`[ResourceLock] GRANTED (from queue) key="${key}"`);
        resolve(() => this.release(key));
      };

      if (!this.queues.has(key)) this.queues.set(key, []);
      this.queues.get(key)!.push(grant);
    });
  }

  /**
   * Acquire multiple locks in sorted key order to prevent deadlocks.
   *
   * Deduplicates keys, sorts them alphabetically, then acquires each in turn.
   * If any acquisition fails (e.g. timeout), all previously acquired locks are
   * released before the error is re-thrown.
   *
   * @param keys - Resource keys to lock (may contain duplicates; they are deduped).
   * @param timeoutMs - Per-lock timeout passed to `acquire`.
   * @returns A single release function that frees all held locks.
   */
  async acquireMultiple(keys: string[], timeoutMs = 5000): Promise<() => void> {
    const sorted = [...new Set(keys)].sort();
    const releases: Array<() => void> = [];

    try {
      for (const key of sorted) {
        releases.push(await this.acquire(key, timeoutMs));
      }
    } catch (err) {
      // Release all locks acquired before the failure.
      releases.forEach((r) => r());
      throw err;
    }

    return () => releases.forEach((r) => r());
  }

  /**
   * Get diagnostic statistics about the lock registry.
   * Useful for tests and the concurrency verification script.
   */
  getStats(): { queued: number; uncontested: number; currentlyHeld: number; currentQueues: Record<string, number> } {
    const currentQueues: Record<string, number> = {};
    for (const [key, q] of this.queues) {
      currentQueues[key] = q.length;
    }
    return {
      queued: this.queuedCount,
      uncontested: this.uncontestedCount,
      currentlyHeld: this.held.size,
      currentQueues,
    };
  }

  /** Reset stats (useful for tests). */
  resetStats(): void {
    this.queuedCount = 0;
    this.uncontestedCount = 0;
  }

  private release(key: string): void {
    this.held.delete(key);
    const queue = this.queues.get(key);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) this.queues.delete(key);
      next(); // Grant lock to the next waiter.
    }
  }
}

/** Singleton — all services share the same lock registry. */
export const resourceLock = new ResourceLock();
