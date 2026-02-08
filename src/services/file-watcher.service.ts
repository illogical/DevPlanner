import { watch, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { FSWatcher } from 'fs';
import { WebSocketService } from './websocket.service';
import { ConfigService } from './config.service';
import { ProjectService } from './project.service';
import { CardService } from './card.service';
import type { WebSocketEvent } from '../types';

interface PathParts {
  projectSlug: string;
  lane?: string;
  cardSlug?: string;
}

interface MoveDetectionEntry {
  slug: string;
  sourceLane: string;
  timestamp: number;
  deleteTimeout?: NodeJS.Timeout; // Track timeout to clear it on move detection
}

/**
 * FileWatcherService monitors the workspace directory for file changes
 * and broadcasts WebSocket events to subscribed clients.
 * 
 * Implements:
 * - Recursive file watching with fs.watch
 * - Debouncing (100ms) to handle rapid editor saves
 * - File filtering (only .md, _project.json, _order.json)
 * - Move detection (delete + create within 500ms)
 * - Delta extraction and broadcasting
 */
export class FileWatcherService {
  private static instance: FileWatcherService;

  private watcher: FSWatcher | null = null;
  private wsService: WebSocketService;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private moveDetectionWindow: Map<string, MoveDetectionEntry> = new Map();

  private readonly DEBOUNCE_MS = 100;
  private readonly MOVE_DETECTION_WINDOW_MS = 500;

  private constructor() {
    this.wsService = WebSocketService.getInstance();
  }

  /**
   * Get the singleton instance of FileWatcherService
   */
  public static getInstance(): FileWatcherService {
    if (!FileWatcherService.instance) {
      FileWatcherService.instance = new FileWatcherService();
    }
    return FileWatcherService.instance;
  }

  /**
   * Start watching the workspace directory
   */
  public start(): void {
    if (this.watcher) {
      console.warn('[FileWatcher] Already started');
      return;
    }

    const config = ConfigService.getInstance();
    const workspacePath = config.workspacePath;

    try {
      this.watcher = watch(
        workspacePath,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;
          this.handleFileChange(eventType, filename);
        }
      );

      console.log(`[FileWatcher] Started watching: ${workspacePath}`);
    } catch (error) {
      console.error('[FileWatcher] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop watching the workspace directory
   */
  public stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[FileWatcher] Stopped');
    }

    // Clear all pending timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    
    // Clear all pending delete timeouts
    for (const entry of this.moveDetectionWindow.values()) {
      if (entry.deleteTimeout) {
        clearTimeout(entry.deleteTimeout);
      }
    }
    this.moveDetectionWindow.clear();
  }

  /**
   * Check if a file should be processed based on its extension
   */
  private shouldProcessFile(filename: string): boolean {
    // Ignore temporary files created by editors
    if (
      filename.includes('.tmp') ||
      filename.includes('.swp') ||
      filename.includes('~') ||
      filename.includes('.bak')
    ) {
      return false;
    }

    // Only process our three file types
    if (filename.endsWith('.md')) return true;
    if (filename.endsWith('_project.json')) return true;
    if (filename.endsWith('_order.json')) return true;

    return false;
  }

  /**
   * Handle a file change event with debouncing
   */
  private handleFileChange(eventType: string, filename: string): void {
    if (!this.shouldProcessFile(filename)) {
      return;
    }

    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filename);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filename);
      this.processFileChange(eventType, filename);
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(filename, timer);
  }

  /**
   * Process a file change after debouncing
   */
  private processFileChange(eventType: string, filename: string): void {
    try {
      const pathParts = this.parseFilePath(filename);
      if (!pathParts) {
        console.warn(`[FileWatcher] Could not parse path: ${filename}`);
        return;
      }

      const config = ConfigService.getInstance();
      const fullPath = join(config.workspacePath, filename);

      // Determine event type and parse file
      if (filename.endsWith('_project.json')) {
        this.handleProjectChange(pathParts.projectSlug, fullPath);
      } else if (filename.endsWith('_order.json')) {
        if (!pathParts.lane) {
          console.warn(`[FileWatcher] Missing lane for order file: ${filename}`);
          return;
        }
        this.handleOrderChange(pathParts.projectSlug, pathParts.lane, fullPath);
      } else if (filename.endsWith('.md')) {
        if (!pathParts.lane || !pathParts.cardSlug) {
          console.warn(`[FileWatcher] Missing lane/cardSlug for card: ${filename}`);
          return;
        }
        this.handleCardChange(
          eventType,
          pathParts.projectSlug,
          pathParts.lane,
          pathParts.cardSlug,
          fullPath
        );
      }
    } catch (error) {
      console.error(`[FileWatcher] Error processing ${filename}:`, error);
    }
  }

  /**
   * Parse a file path to extract project, lane, and card slugs
   * 
   * Examples:
   * - "my-project/_project.json" → { projectSlug: "my-project" }
   * - "my-project/01-upcoming/_order.json" → { projectSlug: "my-project", lane: "01-upcoming" }
   * - "my-project/02-in-progress/auth.md" → { projectSlug: "my-project", lane: "02-in-progress", cardSlug: "auth" }
   */
  private parseFilePath(filename: string): PathParts | null {
    const parts = filename.split('/').filter((p) => p.length > 0);

    if (parts.length < 2) return null;

    const projectSlug = parts[0];

    if (parts.length === 2) {
      // workspace/project/_project.json
      return { projectSlug };
    }

    if (parts.length === 3) {
      // workspace/project/lane/_order.json or workspace/project/lane/card.md
      const lane = parts[1];
      const file = parts[2];

      if (file === '_order.json') {
        return { projectSlug, lane };
      }

      if (file.endsWith('.md')) {
        const cardSlug = file.replace('.md', '');
        return { projectSlug, lane, cardSlug };
      }
    }

    return null;
  }

  /**
   * Handle a change to a project configuration file
   */
  private handleProjectChange(projectSlug: string, fullPath: string): void {
    if (!existsSync(fullPath)) {
      // Project deleted - don't broadcast (projects are only archived, not deleted)
      return;
    }

    try {
      const projectService = ProjectService.getInstance();
      const project = projectService.getProject(projectSlug);

      if (!project) {
        console.warn(`[FileWatcher] Project not found: ${projectSlug}`);
        return;
      }

      const event: WebSocketEvent = {
        type: 'project:updated',
        projectSlug,
        timestamp: new Date().toISOString(),
        data: project,
      };

      this.wsService.broadcast(projectSlug, {
        type: 'event',
        event,
      });

      console.log(`[FileWatcher] Project updated: ${projectSlug}`);
    } catch (error) {
      console.error(`[FileWatcher] Error reading project ${projectSlug}:`, error);
    }
  }

  /**
   * Handle a change to a lane order file
   */
  private handleOrderChange(
    projectSlug: string,
    lane: string,
    fullPath: string
  ): void {
    if (!existsSync(fullPath)) {
      // Order file deleted - this shouldn't happen in normal operation
      return;
    }

    try {
      const fileContent = readFileSync(fullPath, 'utf-8');
      const orderData = JSON.parse(fileContent);
      const order = orderData.order || [];

      const event: WebSocketEvent = {
        type: 'lane:reordered',
        projectSlug,
        timestamp: new Date().toISOString(),
        data: { lane, order },
      };

      this.wsService.broadcast(projectSlug, {
        type: 'event',
        event,
      });

      console.log(`[FileWatcher] Lane reordered: ${projectSlug}/${lane}`);
    } catch (error) {
      console.error(`[FileWatcher] Error reading order file ${fullPath}:`, error);
    }
  }

  /**
   * Handle a change to a card file (create, update, delete, or move)
   */
  private handleCardChange(
    eventType: string,
    projectSlug: string,
    lane: string,
    cardSlug: string,
    fullPath: string
  ): void {
    const exists = existsSync(fullPath);
    const key = `${projectSlug}:${cardSlug}`;

    if (!exists) {
      // Card deleted - but might be a move, so store for detection
      const deleteTimeout = setTimeout(() => {
        const entry = this.moveDetectionWindow.get(key);
        if (entry) {
          // Not a move - broadcast delete event
          this.moveDetectionWindow.delete(key);

          const event: WebSocketEvent = {
            type: 'card:deleted',
            projectSlug,
            timestamp: new Date().toISOString(),
            data: { slug: cardSlug, lane: entry.sourceLane },
          };

          this.wsService.broadcast(projectSlug, {
            type: 'event',
            event,
          });

          console.log(
            `[FileWatcher] Card deleted: ${projectSlug}/${entry.sourceLane}/${cardSlug}`
          );
        }
      }, this.MOVE_DETECTION_WINDOW_MS);

      this.moveDetectionWindow.set(key, {
        slug: cardSlug,
        sourceLane: lane,
        timestamp: Date.now(),
        deleteTimeout, // Store timeout reference for cleanup
      });

      return;
    }

    // Card exists - check if this is a move
    const recentDelete = this.moveDetectionWindow.get(key);

    if (
      recentDelete &&
      Date.now() - recentDelete.timestamp < this.MOVE_DETECTION_WINDOW_MS
    ) {
      // This is a move! Clear the pending delete timeout
      if (recentDelete.deleteTimeout) {
        clearTimeout(recentDelete.deleteTimeout);
      }
      this.moveDetectionWindow.delete(key);

      const event: WebSocketEvent = {
        type: 'card:moved',
        projectSlug,
        timestamp: new Date().toISOString(),
        data: {
          slug: cardSlug,
          sourceLane: recentDelete.sourceLane,
          targetLane: lane,
        },
      };

      this.wsService.broadcast(projectSlug, {
        type: 'event',
        event,
      });

      console.log(
        `[FileWatcher] Card moved: ${cardSlug} from ${recentDelete.sourceLane} to ${lane}`
      );
      return;
    }

    // Card created or updated - read the full card
    try {
      const cardService = CardService.getInstance();
      const card = cardService.getCard(projectSlug, cardSlug);

      if (!card) {
        console.warn(`[FileWatcher] Card not found after change: ${cardSlug}`);
        return;
      }

      // Send card summary (not full content) to minimize payload
      const event: WebSocketEvent = {
        type: 'card:updated',
        projectSlug,
        timestamp: new Date().toISOString(),
        data: {
          slug: cardSlug,
          lane,
          card: {
            slug: card.slug,
            filename: card.filename,
            lane: card.lane,
            frontmatter: card.frontmatter,
            taskProgress: {
              total: card.tasks.length,
              checked: card.tasks.filter((t) => t.checked).length,
            },
          },
        },
      };

      this.wsService.broadcast(projectSlug, {
        type: 'event',
        event,
      });

      console.log(`[FileWatcher] Card updated: ${projectSlug}/${lane}/${cardSlug}`);
    } catch (error) {
      console.error(`[FileWatcher] Error reading card ${cardSlug}:`, error);
    }
  }
}
