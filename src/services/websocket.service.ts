import type { ServerWebSocket } from 'bun';
import type { WebSocketMessage } from '../types';

type WSData = { clientId: string; pingTimeout?: NodeJS.Timeout };

/**
 * WebSocket service that manages client connections and project subscriptions
 * Singleton pattern - use getInstance() to access
 */
export class WebSocketService {
  private static instance: WebSocketService;

  private clients: Map<string, ServerWebSocket<WSData>> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly PING_TIMEOUT = 5000; // 5 seconds
  private readonly HEARTBEAT_ENABLED: boolean;

  private constructor() {
    // Read heartbeat config from environment variable (default: false for local use)
    this.HEARTBEAT_ENABLED = process.env.WEBSOCKET_HEARTBEAT_ENABLED === 'true';
    console.log('[WebSocket] Service initialized', {
      heartbeatEnabled: this.HEARTBEAT_ENABLED,
    });
  }

  /**
   * Get the singleton instance of WebSocketService
   */
  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Register a new client connection
   */
  public registerClient(clientId: string, ws: ServerWebSocket<WSData>): void {
    this.clients.set(clientId, ws);
    console.log(`[WebSocket] Client registered: ${clientId} (total: ${this.clients.size})`);

    // Start heartbeat if this is the first client
    if (this.clients.size === 1 && !this.heartbeatInterval) {
      this.startHeartbeat();
    }
  }

  /**
   * Unregister a client and clean up all subscriptions
   */
  public unregisterClient(clientId: string): void {
    // Clear any pending ping timeout
    const ws = this.clients.get(clientId);
    if (ws?.data.pingTimeout) {
      clearTimeout(ws.data.pingTimeout);
    }

    // Remove client from all project subscriptions
    this.subscriptions.forEach((subscribers, projectSlug) => {
      if (subscribers.has(clientId)) {
        subscribers.delete(clientId);
        console.log(`[WebSocket] Unsubscribed ${clientId} from ${projectSlug}`);

        // Clean up empty subscription sets
        if (subscribers.size === 0) {
          this.subscriptions.delete(projectSlug);
        }
      }
    });

    // Remove client
    this.clients.delete(clientId);
    console.log(`[WebSocket] Client unregistered: ${clientId} (total: ${this.clients.size})`);

    // Stop heartbeat if no clients remain
    if (this.clients.size === 0 && this.heartbeatInterval) {
      this.stopHeartbeat();
    }
  }

  /**
   * Subscribe a client to a project's updates
   */
  public subscribe(clientId: string, projectSlug: string): void {
    if (!this.subscriptions.has(projectSlug)) {
      this.subscriptions.set(projectSlug, new Set());
    }

    this.subscriptions.get(projectSlug)!.add(clientId);
    console.log(
      `[WebSocket] Client ${clientId} subscribed to ${projectSlug} (${this.subscriptions.get(projectSlug)!.size} subscribers)`
    );
  }

  /**
   * Unsubscribe a client from a project
   */
  public unsubscribe(clientId: string, projectSlug: string): void {
    const subscribers = this.subscriptions.get(projectSlug);
    if (subscribers) {
      subscribers.delete(clientId);
      console.log(
        `[WebSocket] Client ${clientId} unsubscribed from ${projectSlug} (${subscribers.size} subscribers)`
      );

      // Clean up empty subscription sets
      if (subscribers.size === 0) {
        this.subscriptions.delete(projectSlug);
      }
    }
  }

  /**
   * Get all clients subscribed to a project
   */
  public getSubscribers(projectSlug: string): string[] {
    return Array.from(this.subscriptions.get(projectSlug) || []);
  }

  /**
   * Broadcast a message to all clients subscribed to a project
   */
  public broadcast(projectSlug: string, message: WebSocketMessage): void {
    const subscribers = this.subscriptions.get(projectSlug);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    let messageStr: string;
    try {
      messageStr = JSON.stringify(message);
    } catch (err) {
      console.error(`[WebSocket] Failed to serialize message for broadcast:`, err);
      return;
    }

    let successCount = 0;

    subscribers.forEach((clientId) => {
      const ws = this.clients.get(clientId);
      if (ws && ws.readyState === 1) {
        // 1 = OPEN
        try {
          ws.send(messageStr);
          successCount++;
        } catch (err) {
          console.error(`[WebSocket] Failed to send to ${clientId}:`, err);
        }
      }
    });

    console.log(`[WebSocket] Broadcast to ${projectSlug}: ${successCount}/${subscribers.size} clients`);
  }

  /**
   * Send a message to a specific client
   */
  public sendToClient(clientId: string, message: WebSocketMessage): void {
    const ws = this.clients.get(clientId);
    if (!ws) {
      console.warn(`[WebSocket] Client ${clientId} not found`);
      return;
    }

    if (ws.readyState !== 1) {
      // 1 = OPEN
      console.warn(`[WebSocket] Client ${clientId} is not in OPEN state`);
      return;
    }

    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.error(`[WebSocket] Failed to send to ${clientId}:`, err);
    }
  }

  /**
   * Get the total number of connected clients
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get the number of clients subscribed to a project
   */
  public getProjectSubscriptionCount(projectSlug: string): number {
    return this.subscriptions.get(projectSlug)?.size || 0;
  }

  /**
   * Start heartbeat to detect stale connections
   */
  private startHeartbeat(): void {
    if (!this.HEARTBEAT_ENABLED) {
      console.log('[WebSocket] Heartbeat disabled via WEBSOCKET_HEARTBEAT_ENABLED env var');
      return;
    }

    if (this.heartbeatInterval) {
      return; // Already running
    }

    console.log('[WebSocket] Starting heartbeat');
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((ws, clientId) => {
        if (ws.readyState === 1) {
          // 1 = OPEN
          try {
            ws.send(JSON.stringify({ type: 'ping' }));

            // Set timeout to close connection if no pong received
            const timeout = setTimeout(() => {
              console.log(`[WebSocket] Client ${clientId} failed heartbeat, disconnecting`);
              ws.close(1000, 'Heartbeat timeout');
              this.unregisterClient(clientId);
            }, this.PING_TIMEOUT);

            // Store timeout so it can be cleared on pong
            ws.data.pingTimeout = timeout;
          } catch (err) {
            console.error(`[WebSocket] Failed to send ping to ${clientId}:`, err);
          }
        }
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      console.log('[WebSocket] Stopping heartbeat');
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Clear ping timeout for a client (called when pong received)
   */
  public clearPingTimeout(clientId: string): void {
    const ws = this.clients.get(clientId);
    if (ws?.data.pingTimeout) {
      clearTimeout(ws.data.pingTimeout);
      ws.data.pingTimeout = undefined;
    }
  }

  /**
   * Disconnect all clients subscribed to a project
   */
  public disconnectProject(projectSlug: string): void {
    const subscribers = this.subscriptions.get(projectSlug);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    console.log(`[WebSocket] Disconnecting ${subscribers.size} clients from deleted project: ${projectSlug}`);

    // Create array to avoid modification during iteration
    const clientIds = Array.from(subscribers);
    
    clientIds.forEach((clientId) => {
      this.unsubscribe(clientId, projectSlug);
    });
  }
}
