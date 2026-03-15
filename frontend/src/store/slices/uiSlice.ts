import type { StateCreator } from 'zustand';
import type { LaneConfig } from '../../types';
import type { DevPlannerStore, UISlice, ChangeIndicator, ChangeIndicatorType } from '../types';

/** How long each indicator type stays visible (ms) */
function getIndicatorDuration(type: ChangeIndicatorType): number {
  switch (type) {
    case 'task:toggled': return 700;
    case 'card:created': return 2000;
    case 'card:moved': return 1500;
    case 'card:updated': return 3000;
    default: return 2000;
  }
}

const getInitialLastDocMode = (): 'viewer' | 'editor' => {
  if (typeof window === 'undefined') return 'viewer';
  const saved = localStorage.getItem('devplanner_lastDocMode');
  return saved === 'editor' ? 'editor' : 'viewer';
};

export const createUISlice: StateCreator<
  DevPlannerStore,
  [],
  [],
  UISlice
> = (set, get) => ({
  expandedCardTasks: new Set(),
  laneCollapsedState: {},
  focusedLane: null,
  isSidebarOpen: true,
  isActivitySidebarOpen: true,
  isActivityPanelOpen: false,
  changeIndicators: new Map(),
  lastDocMode: getInitialLastDocMode(),

  toggleCardTaskExpansion: (cardSlug) => {
    set((state) => {
      const newExpanded = new Set(state.expandedCardTasks);
      if (newExpanded.has(cardSlug)) {
        newExpanded.delete(cardSlug);
      } else {
        newExpanded.add(cardSlug);
      }
      return { expandedCardTasks: newExpanded };
    });
  },

  toggleLaneCollapsed: (laneSlug) => {
    // No-op if this lane is currently focused
    if (get().focusedLane === laneSlug) return;
    set((state) => ({
      laneCollapsedState: {
        ...state.laneCollapsedState,
        [laneSlug]: !state.laneCollapsedState[laneSlug],
      },
    }));
  },

  setFocusedLane: (slug) => {
    set({ focusedLane: slug });
  },

  initializeLaneState: (lanes: Record<string, LaneConfig>) => {
    const laneCollapsedState: Record<string, boolean> = {};
    for (const [slug, config] of Object.entries(lanes)) {
      laneCollapsedState[slug] = config.collapsed;
    }
    set({ laneCollapsedState });
  },

  toggleSidebar: () => {
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
  },

  setSidebarOpen: (open) => {
    set({ isSidebarOpen: open });
  },

  toggleActivitySidebar: () => {
    set((state) => ({ isActivitySidebarOpen: !state.isActivitySidebarOpen }));
  },

  toggleActivityPanel: () => {
    set((state) => ({ isActivityPanelOpen: !state.isActivityPanelOpen }));
  },

  setActivityPanelOpen: (open) => {
    set({ isActivityPanelOpen: open });
  },

  addChangeIndicator: (indicator) => {
    const id = `${indicator.type}-${indicator.cardSlug}-${indicator.taskIndex ?? 'card'}-${Date.now()}`;
    const timestamp = Date.now();
    const expiresAt = timestamp + getIndicatorDuration(indicator.type);

    const newIndicator: ChangeIndicator = { id, timestamp, expiresAt, ...indicator };

    set((state) => {
      const newIndicators = new Map(state.changeIndicators);
      newIndicators.set(id, newIndicator);
      return { changeIndicators: newIndicators };
    });

    setTimeout(() => {
      get().removeChangeIndicator(id);
    }, expiresAt - timestamp);

    return id;
  },

  removeChangeIndicator: (id) => {
    set((state) => {
      const newIndicators = new Map(state.changeIndicators);
      newIndicators.delete(id);
      return { changeIndicators: newIndicators };
    });
  },

  clearExpiredIndicators: () => {
    const now = Date.now();
    set((state) => {
      const newIndicators = new Map(state.changeIndicators);
      let changed = false;
      for (const [id, indicator] of newIndicators.entries()) {
        if (indicator.expiresAt <= now) {
          newIndicators.delete(id);
          changed = true;
        }
      }
      return changed ? { changeIndicators: newIndicators } : state;
    });
  },

  getCardIndicators: (cardSlug) => {
    const indicators = get().changeIndicators;
    return Array.from(indicators.values()).filter(
      (indicator) => indicator.cardSlug === cardSlug
    );
  },

  getTaskIndicator: (cardSlug, taskIndex) => {
    const indicators = get().changeIndicators;
    for (const indicator of indicators.values()) {
      if (
        indicator.cardSlug === cardSlug &&
        indicator.taskIndex === taskIndex &&
        indicator.type === 'task:toggled'
      ) {
        return indicator;
      }
    }
    return null;
  },

  setLastDocMode: (mode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('devplanner_lastDocMode', mode);
    }
    set({ lastDocMode: mode });
  },
});
