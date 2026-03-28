import type { StateCreator } from 'zustand';
import type {
  DispatchRecord,
  CardDispatchedData,
  CardDispatchOutputData,
  CardDispatchCompletedData,
  CardDispatchFailedData,
} from '../../types';
import type { DevPlannerStore, DispatchSlice } from '../types';
import { dispatchApi } from '../../api/client';

const MAX_OUTPUT_LINES = 1000;

export const createDispatchSlice: StateCreator<
  DevPlannerStore,
  [],
  [],
  DispatchSlice
> = (set, get) => ({
  // ── State ─────────────────────────────────────────────────────────────────
  activeDispatches: {},
  dispatchOutputs: {},
  isDispatchModalOpen: false,
  dispatchModalCardSlug: null,
  isOutputPanelOpen: false,
  outputPanelCardSlug: null,

  // ── Actions ───────────────────────────────────────────────────────────────

  openDispatchModal: (cardSlug: string) => {
    set({ isDispatchModalOpen: true, dispatchModalCardSlug: cardSlug });
  },

  closeDispatchModal: () => {
    set({ isDispatchModalOpen: false, dispatchModalCardSlug: null });
  },

  openOutputPanel: (cardSlug: string) => {
    set({ isOutputPanelOpen: true, outputPanelCardSlug: cardSlug });
  },

  closeOutputPanel: () => {
    set({ isOutputPanelOpen: false, outputPanelCardSlug: null });
  },

  dispatchCard: async (projectSlug: string, cardSlug: string, request) => {
    const { dispatch } = await dispatchApi.dispatch(projectSlug, cardSlug, request);
    set((state) => ({
      activeDispatches: { ...state.activeDispatches, [cardSlug]: dispatch },
    }));
    return dispatch;
  },

  cancelDispatch: async (projectSlug: string, cardSlug: string) => {
    await dispatchApi.cancel(projectSlug, cardSlug);
    set((state) => {
      const next = { ...state.activeDispatches };
      delete next[cardSlug];
      return { activeDispatches: next };
    });
  },

  loadDispatch: async (projectSlug: string, cardSlug: string) => {
    const { dispatch } = await dispatchApi.getDispatch(projectSlug, cardSlug);
    if (dispatch) {
      set((state) => ({
        activeDispatches: { ...state.activeDispatches, [cardSlug]: dispatch },
      }));
    }
    return dispatch;
  },

  loadOutputBuffer: async (projectSlug: string, cardSlug: string) => {
    const { events } = await dispatchApi.getOutput(projectSlug, cardSlug);
    set((state) => ({
      dispatchOutputs: { ...state.dispatchOutputs, [cardSlug]: events },
    }));
  },

  getCardDispatch: (cardSlug: string) => {
    return get().activeDispatches[cardSlug] ?? null;
  },

  // ── WebSocket event handlers ──────────────────────────────────────────────

  wsHandleCardDispatched: (data: CardDispatchedData) => {
    const { cardSlug, dispatchId, adapter, branch } = data;
    set((state) => ({
      activeDispatches: {
        ...state.activeDispatches,
        [cardSlug]: {
          id: dispatchId,
          projectSlug: state.activeProjectSlug ?? '',
          cardSlug,
          adapter: adapter as 'claude-cli' | 'gemini-cli',
          branch,
          worktreePath: '',
          status: 'running',
          startedAt: new Date().toISOString(),
          autoCreatePR: false,
        },
      },
    }));
  },

  wsHandleDispatchOutput: (data: CardDispatchOutputData) => {
    const { cardSlug } = data;
    set((state) => {
      const existing = state.dispatchOutputs[cardSlug] ?? [];
      const next = [...existing, data];
      // Cap at MAX_OUTPUT_LINES
      return {
        dispatchOutputs: {
          ...state.dispatchOutputs,
          [cardSlug]: next.length > MAX_OUTPUT_LINES ? next.slice(-MAX_OUTPUT_LINES) : next,
        },
      };
    });
  },

  wsHandleDispatchCompleted: (data: CardDispatchCompletedData) => {
    const { cardSlug } = data;
    set((state) => {
      const existing = state.activeDispatches[cardSlug];
      if (!existing) return {};
      const next = { ...state.activeDispatches };
      next[cardSlug] = { ...existing, status: 'completed', exitCode: data.exitCode, prUrl: data.prUrl };
      return { activeDispatches: next };
    });

    // Reload cards to reflect task completion + lane change
    const state = get();
    if (state.activeProjectSlug) {
      state.loadCards?.();
    }
  },

  wsHandleDispatchFailed: (data: CardDispatchFailedData) => {
    const { cardSlug } = data;
    set((state) => {
      const existing = state.activeDispatches[cardSlug];
      if (!existing) return {};
      const next = { ...state.activeDispatches };
      next[cardSlug] = { ...existing, status: 'failed', exitCode: data.exitCode, error: data.error };
      return { activeDispatches: next };
    });

    // Reload cards to reflect blocked status
    const state = get();
    if (state.activeProjectSlug) {
      state.loadCards?.();
    }
  },
});
