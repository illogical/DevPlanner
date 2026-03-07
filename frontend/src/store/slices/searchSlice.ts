import type { StateCreator } from 'zustand';
import { cardsApi, searchApi } from '../../api/client';
import type { PaletteSearchResult, PaletteFilterTab, DetailScrollTarget } from '../../types';
import type { DevPlannerStore, SearchSlice } from '../types';

// Module-level debounce timers (outside the store so they persist across renders)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let paletteDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export const createSearchSlice: StateCreator<
  DevPlannerStore,
  [],
  [],
  SearchSlice
> = (set, get) => ({
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  isPaletteOpen: false,
  paletteQuery: '',
  paletteResults: [],
  isPaletteSearching: false,
  isPaletteGlobal: false,
  paletteTab: 'all' as PaletteFilterTab,
  selectedPaletteIndex: 0,
  detailScrollTarget: null,

  setSearchQuery: (query) => {
    set({ searchQuery: query });

    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

    if (!query.trim()) {
      get().clearSearch();
      return;
    }

    set({ isSearching: true });
    searchDebounceTimer = setTimeout(async () => {
      const { activeProjectSlug } = get();
      if (!activeProjectSlug) return;

      try {
        const { results } = await cardsApi.search(activeProjectSlug, query);
        set({ searchResults: results, isSearching: false });

        // Auto-expand tasks for cards with task matches
        const { expandedCardTasks } = get();
        for (const result of results) {
          if (result.matchedTaskIndices.length > 0 && !expandedCardTasks.has(result.slug)) {
            get().toggleCardTaskExpansion(result.slug);
          }
        }
      } catch (error) {
        console.error('Search failed:', error);
        set({ isSearching: false });
      }
    }, 300);
  },

  clearSearch: () => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    set({ searchQuery: '', searchResults: [], isSearching: false });
  },

  isCardHighlighted: (cardSlug) => {
    const { searchResults, searchQuery } = get();
    if (!searchQuery) return false;
    return searchResults.some(r => r.slug === cardSlug);
  },

  getMatchedTaskIndices: (cardSlug) => {
    const result = get().searchResults.find(r => r.slug === cardSlug);
    return result?.matchedTaskIndices || [];
  },

  openPalette: () =>
    set({
      isPaletteOpen: true,
      paletteQuery: '',
      paletteResults: [],
      selectedPaletteIndex: 0,
      paletteTab: 'all',
    }),

  closePalette: () => {
    if (paletteDebounceTimer) clearTimeout(paletteDebounceTimer);
    const lastQuery = get().paletteQuery;
    set({ isPaletteOpen: false, paletteQuery: '', paletteResults: [], isPaletteSearching: false });
    // Sync board search to last palette query so highlights remain visible
    if (lastQuery.trim()) {
      get().setSearchQuery(lastQuery);
    }
  },

  setPaletteQuery: (query) => {
    set({ paletteQuery: query, selectedPaletteIndex: 0 });
    if (paletteDebounceTimer) clearTimeout(paletteDebounceTimer);
    if (!query.trim() || query.trim().length < 2) {
      set({ paletteResults: [], isPaletteSearching: false });
      return;
    }
    set({ isPaletteSearching: true });
    paletteDebounceTimer = setTimeout(async () => {
      const { activeProjectSlug, isPaletteGlobal } = get();
      try {
        let results: PaletteSearchResult[];
        if (isPaletteGlobal) {
          const resp = await searchApi.global(query.trim());
          results = resp.results;
        } else {
          if (!activeProjectSlug) { set({ isPaletteSearching: false }); return; }
          const resp = await searchApi.palette(activeProjectSlug, query.trim());
          results = resp.results;
        }
        set({ paletteResults: results, isPaletteSearching: false });
      } catch (err) {
        console.error('Palette search failed:', err);
        set({ isPaletteSearching: false });
      }
    }, 150);
  },

  setPaletteTab: (tab: PaletteFilterTab) =>
    set({ paletteTab: tab, selectedPaletteIndex: 0 }),

  togglePaletteGlobal: () => {
    const newGlobal = !get().isPaletteGlobal;
    set({ isPaletteGlobal: newGlobal, selectedPaletteIndex: 0 });
    const query = get().paletteQuery;
    if (query.trim().length >= 2) get().setPaletteQuery(query);
  },

  setSelectedPaletteIndex: (index) => set({ selectedPaletteIndex: index }),

  setDetailScrollTarget: (target: DetailScrollTarget | null) =>
    set({ detailScrollTarget: target }),

  activatePaletteResult: async (result: PaletteSearchResult) => {
    const { openCardDetail, setActiveProject, projects, setDetailScrollTarget, loadCards } = get();

    const activeSlug = get().activeProjectSlug;
    if (result.projectSlug !== activeSlug) {
      const project = projects.find(p => p.slug === result.projectSlug);
      if (project) {
        setActiveProject(result.projectSlug);
        await loadCards();
      }
    }

    await openCardDetail(result.cardSlug);

    const target: DetailScrollTarget = (() => {
      switch (result.type) {
        case 'task': return { section: 'tasks', taskIndex: result.taskIndex };
        case 'description': return { section: 'description' };
        case 'tag':
        case 'assignee': return { section: 'metadata' };
        case 'link':
        case 'link-label':
        case 'link-description': return { section: 'links', linkId: result.linkId };
        default: return { section: 'description' };
      }
    })();
    setDetailScrollTarget(target);

    get().closePalette();
  },
});
