import { randomUUID } from 'crypto';
import type {
  HistoryActionType,
  HistoryEventMetadata,
  HistoryEvent,
} from '../types';
import { HistoryPersistenceService } from './history-persistence.service';
import { ConfigService } from './config.service';

/**
 * Service for managing activity history logs
 * Stores events in-memory with persistent JSON file backup
 * Singleton pattern - use getInstance() to access
 */
export class HistoryService {
  private static instance: HistoryService;

  private events: Map<string, HistoryEvent[]> = new Map();
  private readonly MAX_EVENTS_PER_PROJECT = 50; // Increased from 50 to match persistence limit
  private persistenceService: HistoryPersistenceService;

  private constructor() {
    const config = ConfigService.getInstance();
    this.persistenceService = HistoryPersistenceService.getInstance(config.workspacePath);
    console.log('[History] Service initialized with persistent storage');
  }

  /**
   * Get the singleton instance of HistoryService
   */
  public static getInstance(): HistoryService {
    if (!HistoryService.instance) {
      HistoryService.instance = new HistoryService();
    }
    return HistoryService.instance;
  }

  /**
   * Record a new history event
   * Returns the full event with generated ID and timestamp
   * Automatically persists to disk (debounced)
   */
  public recordEvent(
    event: Omit<HistoryEvent, 'id' | 'timestamp'>
  ): HistoryEvent {
    const fullEvent: HistoryEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    const projectEvents = this.events.get(event.projectSlug) || [];
    projectEvents.unshift(fullEvent); // Add to front (newest first)

    // Trim to max size
    if (projectEvents.length > this.MAX_EVENTS_PER_PROJECT) {
      projectEvents.length = this.MAX_EVENTS_PER_PROJECT;
    }

    this.events.set(event.projectSlug, projectEvents);

    // Schedule persistent write (debounced)
    this.persistenceService.scheduleWrite(event.projectSlug, projectEvents);

    console.log(
      `[History] Recorded ${fullEvent.action} for ${event.projectSlug}: ${fullEvent.description}`
    );

    return fullEvent;
  }

  /**
   * Get recent events for a project
   * Loads from disk if not in memory (e.g., after server restart)
   * Optionally filter to events at or after a given ISO timestamp
   */
  public async getEvents(projectSlug: string, limit: number = 10, since?: string): Promise<HistoryEvent[]> {
    // Check in-memory cache first
    let events = this.events.get(projectSlug);

    // Load from disk if not in memory
    if (!events) {
      events = await this.persistenceService.loadHistory(projectSlug);
      if (events.length > 0) {
        this.events.set(projectSlug, events);
        console.log(`[History] Loaded ${events.length} events from disk for ${projectSlug}`);
      }
    }

    let result = events || [];

    // Apply since filter (events are stored newest-first)
    if (since) {
      const sinceTime = new Date(since).getTime();
      result = result.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }

    return result.slice(0, Math.min(limit, this.MAX_EVENTS_PER_PROJECT));
  }

  /**
   * Clear all events for a project
   * Useful when a project is deleted or archived
   * Also deletes persistent files on disk
   */
  public async clearEvents(projectSlug: string): Promise<void> {
    this.events.delete(projectSlug);
    await this.persistenceService.deleteHistory(projectSlug);
    console.log(`[History] Cleared events for ${projectSlug}`);
  }

  /**
   * Get total event count for a project
   */
  public getEventCount(projectSlug: string): number {
    return (this.events.get(projectSlug) || []).length;
  }

  /**
   * Get a merged activity feed across all given project slugs.
   * Events are sorted newest-first. Optionally filtered by since and limited.
   */
  public async getActivityFeed(
    projectSlugs: string[],
    limit: number = 50,
    since?: string
  ): Promise<HistoryEvent[]> {
    const allEvents: HistoryEvent[] = [];

    for (const slug of projectSlugs) {
      // Load enough events per project (up to MAX) so we can sort across projects
      const events = await this.getEvents(slug, this.MAX_EVENTS_PER_PROJECT, since);
      allEvents.push(...events);
    }

    // Sort newest-first across all projects
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return allEvents.slice(0, limit);
  }
}
