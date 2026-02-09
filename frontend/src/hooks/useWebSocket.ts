import { useEffect, useState } from 'react';
import { getWebSocketClient } from '../services/websocket.service';
import { useStore } from '../store';
import type {
  CardCreatedData,
  CardUpdatedData,
  CardMovedData,
  CardDeletedData,
  LaneReorderedData,
  ProjectUpdatedData,
  ProjectDeletedData,
  HistoryEvent,
} from '../types';

export function useWebSocket() {
  const [client] = useState(() => getWebSocketClient());
  const [connectionState, setConnectionState] = useState(client.getState());
  
  const activeProjectSlug = useStore((state) => state.activeProjectSlug);
  const loadCards = useStore((state) => state.loadCards);
  const loadHistory = useStore((state) => state.loadHistory);
  
  // Get WebSocket handlers from store
  const wsHandleCardCreated = useStore((state) => state.wsHandleCardCreated);
  const wsHandleCardUpdated = useStore((state) => state.wsHandleCardUpdated);
  const wsHandleCardMoved = useStore((state) => state.wsHandleCardMoved);
  const wsHandleCardDeleted = useStore((state) => state.wsHandleCardDeleted);
  const wsHandleTaskToggled = useStore((state) => state.wsHandleTaskToggled);
  const wsHandleLaneReordered = useStore((state) => state.wsHandleLaneReordered);
  const wsHandleProjectUpdated = useStore((state) => state.wsHandleProjectUpdated);
  const wsHandleProjectDeleted = useStore((state) => state.wsHandleProjectDeleted);
  const addHistoryEvent = useStore((state) => state.addHistoryEvent);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    client.connect();

    const unsubscribe = client.onStateChange(setConnectionState);

    return () => {
      unsubscribe();
      client.disconnect();
    };
  }, [client]);

  // Subscribe to active project
  useEffect(() => {
    if (activeProjectSlug) {
      // Unsubscribe from any previous project (client handles this internally)
      client.subscribe(activeProjectSlug);
    }
  }, [activeProjectSlug, client]);

  // Register event handlers
  useEffect(() => {
    const unsubscribers = [
      client.on('card:created', (data) => {
        wsHandleCardCreated?.(data as CardCreatedData);
      }),
      client.on('card:updated', (data) => {
        wsHandleCardUpdated?.(data as CardUpdatedData);
      }),
      client.on('card:moved', (data) => {
        wsHandleCardMoved?.(data as CardMovedData);
      }),
      client.on('card:deleted', (data) => {
        wsHandleCardDeleted?.(data as CardDeletedData);
      }),
      client.on('task:toggled', (data) => {
        wsHandleTaskToggled?.(data as TaskToggledData);
      }),
      client.on('lane:reordered', (data) => {
        wsHandleLaneReordered?.(data as LaneReorderedData);
      }),
      client.on('project:updated', (data) => {
        wsHandleProjectUpdated?.(data as ProjectUpdatedData);
      }),
      client.on('project:deleted', (data) => {
        wsHandleProjectDeleted?.(data as ProjectDeletedData);
      }),
      client.on('history:event', (data) => {
        addHistoryEvent(data as HistoryEvent);
      }),
    ];

    return () => unsubscribers.forEach(unsub => unsub());
  }, [
    client,
    wsHandleCardCreated,
    wsHandleCardUpdated,
    wsHandleCardMoved,
    wsHandleCardDeleted,
    wsHandleTaskToggled,
    wsHandleLaneReordered,
    wsHandleProjectUpdated,
    wsHandleProjectDeleted,
    addHistoryEvent,
  ]);

  // Handle reconnection - refresh data
  useEffect(() => {
    const handleReconnected = () => {
      console.log('[useWebSocket] Reconnected, refreshing data...');
      loadCards();
      loadHistory();
    };

    // Listen for state changes from reconnecting to connected
    let previousState = client.getState();
    const unsubscribe = client.onStateChange((newState) => {
      if (previousState === 'reconnecting' && newState === 'connected') {
        handleReconnected();
      }
      previousState = newState;
    });

    return unsubscribe;
  }, [client, loadCards, loadHistory]);

  const reconnect = () => {
    client.disconnect();
    setTimeout(() => client.connect(), 100);
  };

  return {
    connectionState,
    reconnect,
  };
}
