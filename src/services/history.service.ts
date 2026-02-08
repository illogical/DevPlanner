import { randomUUID } from 'crypto';

/**
 * History action types
 */
export type HistoryActionType =
  | 'task:completed'
  | 'task:uncompleted'
  | 'card:created'
  | 'card:moved'
  | 'card:updated'
  | 'card:archived';

/**
 * Metadata for history events
 */
export interface HistoryEventMetadata {
  cardSlug: string;
  cardTitle: string;
  lane?: string;
  sourceLane?: string;
  targetLane?: string;
  taskIndex?: number;
  taskText?: string;
  changedFields?: string[];
}

/**
 * History event record
 */
export interface HistoryEvent {
  id: string;
  projectSlug: string;
  timestamp: string; // ISO 8601
  action: HistoryActionType;
  description: string; // Human-readable description
  metadata: HistoryEventMetadata;
}

/**
 * Service for managing activity history logs
 * Stores events in-memory with a max limit per project
 * Singleton pattern - use getInstance() to access
 */
export class HistoryService {
  private static instance: HistoryService;

  private events: Map<string, HistoryEvent[]> = new Map();
  private readonly MAX_EVENTS_PER_PROJECT = 50;

  private constructor() {
    console.log('[History] Service initialized');
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

    console.log(
      `[History] Recorded ${fullEvent.action} for ${event.projectSlug}: ${fullEvent.description}`
    );

    return fullEvent;
  }

  /**
   * Get recent events for a project
   */
  public getEvents(projectSlug: string, limit: number = 50): HistoryEvent[] {
    const events = this.events.get(projectSlug) || [];
    return events.slice(0, Math.min(limit, this.MAX_EVENTS_PER_PROJECT));
  }

  /**
   * Clear all events for a project
   * Useful when a project is deleted or archived
   */
  public clearEvents(projectSlug: string): void {
    this.events.delete(projectSlug);
    console.log(`[History] Cleared events for ${projectSlug}`);
  }

  /**
   * Get total event count for a project
   */
  public getEventCount(projectSlug: string): number {
    return (this.events.get(projectSlug) || []).length;
  }
}
