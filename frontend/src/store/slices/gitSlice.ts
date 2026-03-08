import type { StateCreator } from 'zustand';
import type { DevPlannerStore, GitSlice, GitState } from '../types';
import { gitApi } from '../../api/client';

const STORAGE_KEY = 'devplanner.gitRefreshInterval';
const DEFAULT_INTERVAL = 30;

function loadRefreshInterval(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const val = parseInt(stored, 10);
      if (!isNaN(val) && val >= 5 && val <= 300) return val;
    }
  } catch {}
  return DEFAULT_INTERVAL;
}

export const createGitSlice: StateCreator<DevPlannerStore, [], [], GitSlice> = (set, get) => ({
  gitStatuses: {},
  gitCurrentState: null,
  gitIsLoading: false,
  gitCommitPanelOpen: false,
  gitCommitMessage: '',
  gitActionLoading: false,
  gitRefreshInterval: loadRefreshInterval(),

  refreshGitStatus: async (filePath: string) => {
    set({ gitIsLoading: true });
    try {
      const result = await gitApi.getStatus(filePath);
      set((s) => ({
        gitStatuses: { ...s.gitStatuses, [filePath]: result.state },
        gitCurrentState: result.state,
        gitIsLoading: false,
      }));
    } catch {
      set({ gitIsLoading: false });
    }
  },

  refreshGitStatuses: async (paths: string[]) => {
    try {
      const result = await gitApi.getStatuses(paths);
      set((s) => ({ gitStatuses: { ...s.gitStatuses, ...result.statuses } }));
    } catch {}
  },

  stageFile: async (filePath: string) => {
    set({ gitActionLoading: true });
    try {
      const result = await gitApi.stage(filePath);
      set((s) => ({
        gitStatuses: { ...s.gitStatuses, [filePath]: result.state },
        gitCurrentState: result.state,
        gitActionLoading: false,
      }));
    } catch {
      set({ gitActionLoading: false });
    }
  },

  unstageFile: async (filePath: string) => {
    set({ gitActionLoading: true });
    try {
      const result = await gitApi.unstage(filePath);
      set((s) => ({
        gitStatuses: { ...s.gitStatuses, [filePath]: result.state },
        gitCurrentState: result.state,
        gitActionLoading: false,
      }));
    } catch {
      set({ gitActionLoading: false });
    }
  },

  discardUnstaged: async (filePath: string) => {
    set({ gitActionLoading: true });
    try {
      const result = await gitApi.discard(filePath);
      set((s) => ({
        gitStatuses: { ...s.gitStatuses, [filePath]: result.state },
        gitCurrentState: result.state,
        gitActionLoading: false,
      }));
      await get().loadDocFile(filePath);
    } catch {
      set({ gitActionLoading: false });
    }
  },

  commitFile: async (filePath: string, message: string) => {
    set({ gitActionLoading: true });
    try {
      const result = await gitApi.commit(filePath, message);
      set((s) => ({
        gitStatuses: { ...s.gitStatuses, [filePath]: result.state },
        gitCurrentState: result.state,
        gitActionLoading: false,
        gitCommitPanelOpen: false,
        gitCommitMessage: '',
      }));
    } catch {
      set({ gitActionLoading: false });
    }
  },

  setGitCommitMessage: (msg: string) => set({ gitCommitMessage: msg }),

  toggleCommitPanel: () => set((s) => ({ gitCommitPanelOpen: !s.gitCommitPanelOpen })),

  setGitRefreshInterval: (seconds: number) => {
    const clamped = Math.max(5, Math.min(300, seconds));
    try { localStorage.setItem(STORAGE_KEY, String(clamped)); } catch {}
    set({ gitRefreshInterval: clamped });
  },
});
