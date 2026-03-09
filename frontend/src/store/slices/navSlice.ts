import type { StateCreator } from 'zustand';
import type { DevPlannerStore, NavSlice, NavEntry } from '../types';

export const createNavSlice: StateCreator<DevPlannerStore, [], [], NavSlice> = (set, get) => ({
  navBackStack: [],
  navForwardStack: [],

  pushNavEntry: (entry: NavEntry) => {
    set((state) => ({ navBackStack: [...state.navBackStack, entry] }));
  },

  clearNavForward: () => {
    set({ navForwardStack: [] });
  },

  /**
   * Pops the last entry from navBackStack and returns it.
   * Captures the current state and pushes it onto navForwardStack before returning.
   * Returns undefined if there is nothing to go back to.
   */
  consumeNavBack: (): NavEntry | undefined => {
    const { navBackStack, navForwardStack, docFilePath, activeCard } = get();
    if (navBackStack.length === 0) return undefined;

    const target = navBackStack[navBackStack.length - 1];
    const newBackStack = navBackStack.slice(0, -1);

    // Capture current state to push into forward stack
    const currentEntry: NavEntry = docFilePath
      ? { type: 'file', filePath: docFilePath }
      : { type: 'kanban', cardSlug: activeCard?.slug, projectSlug: get().activeProjectSlug ?? undefined };

    set({ navBackStack: newBackStack, navForwardStack: [currentEntry, ...navForwardStack] });
    return target;
  },

  /**
   * Pops the first entry from navForwardStack and returns it.
   * Captures the current state and pushes it onto navBackStack before returning.
   * Returns undefined if there is nothing to go forward to.
   */
  consumeNavForward: (): NavEntry | undefined => {
    const { navBackStack, navForwardStack, docFilePath, activeCard } = get();
    if (navForwardStack.length === 0) return undefined;

    const target = navForwardStack[0];
    const newForwardStack = navForwardStack.slice(1);

    // Capture current state to push into back stack
    const currentEntry: NavEntry = docFilePath
      ? { type: 'file', filePath: docFilePath }
      : { type: 'kanban', cardSlug: activeCard?.slug, projectSlug: get().activeProjectSlug ?? undefined };

    set({ navBackStack: [...navBackStack, currentEntry], navForwardStack: newForwardStack });
    return target;
  },
});
