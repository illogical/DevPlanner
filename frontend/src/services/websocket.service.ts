import type { WebSocketMessage, WebSocketEvent } from '../types';

type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';
type EventHandler = (data: unknown) => void;

function getWebSocketUrl(): string {
  // Always use window.location.host - works for both local and remote access
  // Vite dev server proxies WebSocket connections to the backend
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/ws`;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private subscribedProject: string | null = null;
  private state: ConnectionState = 'disconnected';
  private stateListeners: Set<(state: ConnectionState) => void> = new Set();
  private reconnectTimer: number | null = null;
  private manualDisconnect = false;

  private url: string;

  constructor(url?: string) {
    this.url = url || getWebSocketUrl();
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.manualDisconnect = false;
    
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.reconnectAttempts = 0;
        this.setState('connected');

        // Re-subscribe to project if we were previously subscribed
        if (this.subscribedProject) {
          this.subscribe(this.subscribedProject);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          this.handleMessage(message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.ws = null;

        // Only attempt reconnection if not manually disconnected
        if (!this.manualDisconnect) {
          this.attemptReconnect();
        } else {
          this.setState('disconnected');
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
      this.attemptReconnect();
    }
  }

  disconnect(): void {
    this.manualDisconnect = true;
    
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('disconnected');
  }

  subscribe(projectSlug: string): void {
    this.subscribedProject = projectSlug;
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'subscribe', projectSlug });
    }
  }

  unsubscribe(projectSlug: string): void {
    if (this.subscribedProject === projectSlug) {
      this.subscribedProject = null;
    }
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'unsubscribe', projectSlug });
    }
  }

  on(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => this.off(eventType, handler);
  }

  off(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  getState(): ConnectionState {
    return this.state;
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.stateListeners.forEach(listener => listener(state));
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'event':
        if (message.event) {
          this.dispatchEvent(message.event);
        }
        break;

      case 'ping':
        // Respond to heartbeat
        this.send({ type: 'pong' });
        break;

      case 'subscribed':
        console.log('[WebSocket] Subscribed to project:', message.projectSlug);
        break;

      case 'unsubscribed':
        console.log('[WebSocket] Unsubscribed from project:', message.projectSlug);
        break;

      case 'error':
        console.error('[WebSocket] Server error:', message.error);
        break;

      default:
        console.warn('[WebSocket] Unknown message type:', message);
    }
  }

  private dispatchEvent(event: WebSocketEvent): void {
    if (event.type === 'lane:reordered') {
      console.log('[WebSocket] ========== RECEIVED lane:reordered EVENT ==========');
      console.log('[WebSocket] Event data:', event.data);
      console.log('[WebSocket] Timestamp:', event.timestamp);
    } else {
      console.log('[WebSocket] Dispatching event:', event.type, event.data);
    }
    
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      console.log(`[WebSocket] Found ${handlers.size} handlers for ${event.type}`);
      handlers.forEach(handler => {
        try {
          handler(event.data);
        } catch (error) {
          console.error(`[WebSocket] Handler error for ${event.type}:`, error);
        }
      });
    } else {
      console.warn(`[WebSocket] No handlers registered for event type: ${event.type}`);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocket] Max reconnection attempts reached');
      this.setState('disconnected');
      return;
    }

    this.setState('reconnecting');
    this.reconnectAttempts++;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.pow(2, this.reconnectAttempts - 1) * 1000;
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

// Module-level singleton
let clientInstance: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!clientInstance) {
    clientInstance = new WebSocketClient();
  }
  return clientInstance;
}
