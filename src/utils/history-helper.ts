import { HistoryService } from '../services/history.service';
import { WebSocketService } from '../services/websocket.service';
import type { HistoryEvent, HistoryActionType, HistoryEventMetadata } from '../types';

/**
 * Records a history event and broadcasts it via WebSocket in one atomic operation.
 * Ensures all recorded history is immediately visible to connected clients.
 *
 * @param projectSlug - The project slug
 * @param action - The history action type
 * @param description - Human-readable description of the event
 * @param metadata - Event metadata (card info, task info, file info, etc.)
 * @returns The created history event
 */
export function recordAndBroadcastHistory(
  projectSlug: string,
  action: HistoryActionType,
  description: string,
  metadata: HistoryEventMetadata
): HistoryEvent {
  const historyService = HistoryService.getInstance();
  const wsService = WebSocketService.getInstance();

  // Record event (also triggers persistence via scheduleWrite)
  const historyEvent = historyService.recordEvent({
    projectSlug,
    action,
    description,
    metadata,
  });

  // Broadcast to WebSocket subscribers
  wsService.broadcast(projectSlug, {
    type: 'event',
    event: {
      type: 'history:event',
      projectSlug,
      timestamp: historyEvent.timestamp,
      data: historyEvent,
    },
  });

  return historyEvent;
}
