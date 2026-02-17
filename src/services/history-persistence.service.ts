import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import type { HistoryEvent } from '../types';

interface HistoryFile {
  version: string;
  events: HistoryEvent[];
  lastRotation: string; // ISO timestamp
}

/**
 * Handles persistent storage of history events to JSON files with rotation and debouncing.
 *
 * Features:
 * - Stores events in workspace/{projectSlug}/_history.json
 * - Max 500 events per project (rotates to _history.archive.json)
 * - Debounced writes (every 5 seconds OR every 10 new events)
 * - Thread-safe write queue to prevent concurrent file access
 */
export class HistoryPersistenceService {
  private static instance: HistoryPersistenceService;
  private workspacePath: string;
  private writeQueue: Map<string, HistoryEvent[]> = new Map();
  private writeTimers: Map<string, Timer> = new Map();
  private pendingCounts: Map<string, number> = new Map();

  private readonly MAX_EVENTS = 500;
  private readonly DEBOUNCE_MS = 5000; // 5 seconds
  private readonly WRITE_THRESHOLD = 10; // Write after 10 new events

  private constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  static getInstance(workspacePath?: string): HistoryPersistenceService {
    if (!HistoryPersistenceService.instance) {
      if (!workspacePath) {
        throw new Error('HistoryPersistenceService requires workspacePath on first initialization');
      }
      HistoryPersistenceService.instance = new HistoryPersistenceService(workspacePath);
    }
    return HistoryPersistenceService.instance;
  }

  /**
   * Load history events from disk for a project.
   * Returns empty array if file doesn't exist.
   */
  async loadHistory(projectSlug: string): Promise<HistoryEvent[]> {
    const historyPath = join(this.workspacePath, projectSlug, '_history.json');

    if (!existsSync(historyPath)) {
      return [];
    }

    try {
      const content = readFileSync(historyPath, 'utf-8');
      const data: HistoryFile = JSON.parse(content);

      // Validate version (for future migrations)
      if (data.version !== '1.0') {
        console.warn(`[HistoryPersistence] Unknown version ${data.version} for ${projectSlug}, using as-is`);
      }

      return data.events || [];
    } catch (error) {
      console.error(`[HistoryPersistence] Failed to load history for ${projectSlug}:`, error);
      return [];
    }
  }

  /**
   * Save history events to disk immediately (bypasses debouncing).
   * Used for explicit saves or when service is shutting down.
   */
  async saveHistory(projectSlug: string, events: HistoryEvent[]): Promise<void> {
    const historyPath = join(this.workspacePath, projectSlug, '_history.json');

    // Rotate if exceeds max
    if (events.length > this.MAX_EVENTS) {
      await this.rotateHistory(projectSlug, events);
      events = events.slice(0, this.MAX_EVENTS);
    }

    const data: HistoryFile = {
      version: '1.0',
      events,
      lastRotation: new Date().toISOString(),
    };

    try {
      writeFileSync(historyPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error(`[HistoryPersistence] Failed to save history for ${projectSlug}:`, error);
      throw error;
    }
  }

  /**
   * Schedule a debounced write for the given project.
   * Writes are batched and executed after 5 seconds of inactivity OR 10 new events.
   */
  scheduleWrite(projectSlug: string, events: HistoryEvent[]): void {
    // Store events in queue
    this.writeQueue.set(projectSlug, events);

    // Increment pending count
    const currentCount = this.pendingCounts.get(projectSlug) || 0;
    this.pendingCounts.set(projectSlug, currentCount + 1);

    // Clear existing timer
    const existingTimer = this.writeTimers.get(projectSlug);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // If we've hit the threshold, write immediately
    if (currentCount + 1 >= this.WRITE_THRESHOLD) {
      this.flushWrite(projectSlug);
      return;
    }

    // Otherwise, set a new debounce timer
    const timer = setTimeout(() => {
      this.flushWrite(projectSlug);
    }, this.DEBOUNCE_MS);

    this.writeTimers.set(projectSlug, timer);
  }

  /**
   * Immediately flush pending writes for a project.
   */
  private flushWrite(projectSlug: string): void {
    const events = this.writeQueue.get(projectSlug);
    if (!events) {
      return;
    }

    // Clear timer and queue
    const timer = this.writeTimers.get(projectSlug);
    if (timer) {
      clearTimeout(timer);
      this.writeTimers.delete(projectSlug);
    }
    this.writeQueue.delete(projectSlug);
    this.pendingCounts.delete(projectSlug);

    // Perform the write
    this.saveHistory(projectSlug, events).catch(error => {
      console.error(`[HistoryPersistence] Failed to flush write for ${projectSlug}:`, error);
    });
  }

  /**
   * Rotate old events to archive file when max is exceeded.
   * Keeps newest 500 events in main file, moves older events to archive.
   */
  private async rotateHistory(projectSlug: string, events: HistoryEvent[]): Promise<void> {
    if (events.length <= this.MAX_EVENTS) {
      return; // No rotation needed
    }

    const archivePath = join(this.workspacePath, projectSlug, '_history.archive.json');

    // Events to archive (oldest ones, beyond the 500 limit)
    const eventsToArchive = events.slice(this.MAX_EVENTS);

    // Load existing archive (if any)
    let existingArchive: HistoryEvent[] = [];
    if (existsSync(archivePath)) {
      try {
        const content = readFileSync(archivePath, 'utf-8');
        const data: HistoryFile = JSON.parse(content);
        existingArchive = data.events || [];
      } catch (error) {
        console.error(`[HistoryPersistence] Failed to read archive for ${projectSlug}:`, error);
      }
    }

    // Prepend new archived events (newest first)
    const combinedArchive = [...eventsToArchive, ...existingArchive];

    // Save archive (limit to 1000 total archived events to prevent unbounded growth)
    const archiveData: HistoryFile = {
      version: '1.0',
      events: combinedArchive.slice(0, 1000),
      lastRotation: new Date().toISOString(),
    };

    try {
      writeFileSync(archivePath, JSON.stringify(archiveData, null, 2), 'utf-8');
      console.log(`[HistoryPersistence] Rotated ${eventsToArchive.length} events to archive for ${projectSlug}`);
    } catch (error) {
      console.error(`[HistoryPersistence] Failed to save archive for ${projectSlug}:`, error);
    }
  }

  /**
   * Delete all history files for a project (used when project is deleted).
   */
  async deleteHistory(projectSlug: string): Promise<void> {
    const historyPath = join(this.workspacePath, projectSlug, '_history.json');
    const archivePath = join(this.workspacePath, projectSlug, '_history.archive.json');

    // Clear any pending writes
    const timer = this.writeTimers.get(projectSlug);
    if (timer) {
      clearTimeout(timer);
      this.writeTimers.delete(projectSlug);
    }
    this.writeQueue.delete(projectSlug);
    this.pendingCounts.delete(projectSlug);

    // Delete files if they exist
    try {
      if (existsSync(historyPath)) {
        unlinkSync(historyPath);
      }
      if (existsSync(archivePath)) {
        unlinkSync(archivePath);
      }
    } catch (error) {
      console.error(`[HistoryPersistence] Failed to delete history for ${projectSlug}:`, error);
      throw error;
    }
  }

  /**
   * Flush all pending writes (call on server shutdown).
   */
  async flushAll(): Promise<void> {
    const projectSlugs = Array.from(this.writeQueue.keys());
    for (const projectSlug of projectSlugs) {
      this.flushWrite(projectSlug);
    }
  }
}
