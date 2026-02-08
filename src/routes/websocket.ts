import { Elysia } from 'elysia';
import { WebSocketService } from '../services/websocket.service';
import type { WebSocketMessage } from '../types';

/**
 * WebSocket route for real-time client communication
 * Handles connections at /api/ws
 */
export const websocketRoutes = new Elysia().ws('/api/ws', {
  open(ws) {
    const wsService = WebSocketService.getInstance();
    const clientId = crypto.randomUUID();

    // Store client ID in WebSocket data
    ws.data.clientId = clientId;

    // Register client with service
    wsService.registerClient(clientId, ws);

    console.log(`[WebSocket] Client connected: ${clientId}`);
  },

  message(ws, message) {
    const wsService = WebSocketService.getInstance();
    const clientId = ws.data.clientId;

    try {
      // Parse incoming message
      const msg: WebSocketMessage = typeof message === 'string' ? JSON.parse(message) : message;

      // Handle different message types
      if (msg.type === 'subscribe' && msg.projectSlug) {
        wsService.subscribe(clientId, msg.projectSlug);
        ws.send(
          JSON.stringify({
            type: 'subscribed',
            projectSlug: msg.projectSlug,
          } as WebSocketMessage)
        );
      } else if (msg.type === 'unsubscribe' && msg.projectSlug) {
        wsService.unsubscribe(clientId, msg.projectSlug);
        ws.send(
          JSON.stringify({
            type: 'unsubscribed',
            projectSlug: msg.projectSlug,
          } as WebSocketMessage)
        );
      } else if (msg.type === 'pong') {
        // Client responded to ping, clear timeout
        wsService.clearPingTimeout(clientId);
      } else if (msg.type === 'ping') {
        // Client sent ping, respond with pong
        ws.send(JSON.stringify({ type: 'pong' } as WebSocketMessage));
      } else {
        // Unknown message type
        ws.send(
          JSON.stringify({
            type: 'error',
            error: 'Unknown message type or missing required fields',
          } as WebSocketMessage)
        );
      }
    } catch (err) {
      console.error(`[WebSocket] Error processing message from ${clientId}:`, err);
      ws.send(
        JSON.stringify({
          type: 'error',
          error: 'Invalid message format',
        } as WebSocketMessage)
      );
    }
  },

  close(ws, code, reason) {
    const wsService = WebSocketService.getInstance();
    const clientId = ws.data.clientId;

    wsService.unregisterClient(clientId);

    console.log(`[WebSocket] Client disconnected: ${clientId} (code: ${code}, reason: ${reason})`);
  },
});
