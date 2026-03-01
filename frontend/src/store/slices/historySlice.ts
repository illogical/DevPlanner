import type { StateCreator } from 'zustand';
import type { HistoryEvent } from '../../types';
import type { DevPlannerStore, HistorySlice } from '../types';

export const createHistorySlice: StateCreator<
  DevPlannerStore,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  historyEvents: [],

  loadHistory: async () => {
    const projectSlug = get().activeProjectSlug;
    if (!projectSlug) return;

    try {
      const response = await fetch(`/api/projects/${projectSlug}/history?limit=50`);
      if (!response.ok) throw new Error('Failed to load history');
      const data = await response.json();
      set({ historyEvents: data.events });
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  },

  addHistoryEvent: (event: HistoryEvent) => {
    set((state) => ({
      historyEvents: [event, ...state.historyEvents].slice(0, 50),
    }));
  },
});
