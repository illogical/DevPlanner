/**
 * store/index.ts
 *
 * Assembles the Zustand store from independent slices.
 * Each slice owns its own state and actions — cross-slice calls work
 * because Zustand's get() always returns the full combined store.
 *
 * Slice files:
 *   slices/projectSlice.ts  – projects, card list, CRUD, reorder
 *   slices/cardSlice.ts     – card detail panel, tasks, links, vault artifacts
 *   slices/uiSlice.ts       – sidebar, lanes, change indicators
 *   slices/historySlice.ts  – activity history
 *   slices/searchSlice.ts   – keyword search + command palette
 *   slices/wsSlice.ts       – WebSocket state + real-time event handlers
 */
import { create } from 'zustand';
import { createProjectSlice } from './slices/projectSlice';
import { createCardSlice } from './slices/cardSlice';
import { createUISlice } from './slices/uiSlice';
import { createHistorySlice } from './slices/historySlice';
import { createSearchSlice } from './slices/searchSlice';
import { createWSSlice } from './slices/wsSlice';
import type { DevPlannerStore } from './types';

// Re-export types that downstream components import directly from the store
export type { ChangeIndicator, ChangeIndicatorType } from './types';

export const useStore = create<DevPlannerStore>()((...a) => ({
  ...createProjectSlice(...a),
  ...createCardSlice(...a),
  ...createUISlice(...a),
  ...createHistorySlice(...a),
  ...createSearchSlice(...a),
  ...createWSSlice(...a),
}));

// ─── Periodic cleanup of expired change indicators ───────────────────────────
let cleanupIntervalId: number | undefined;
if (typeof window !== 'undefined') {
  cleanupIntervalId = window.setInterval(() => {
    useStore.getState().clearExpiredIndicators();
  }, 5000);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      if (cleanupIntervalId !== undefined) {
        clearInterval(cleanupIntervalId);
      }
    });
  }
}
