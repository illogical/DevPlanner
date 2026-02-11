import { create } from 'zustand';
import { projectsApi, cardsApi, tasksApi, preferencesApi } from '../api/client';
import type {
  ProjectSummary,
  CardSummary,
  Card,
  LaneConfig,
  HistoryEvent,
  UpdateCardInput,
  CardCreatedData,
  CardUpdatedData,
  CardMovedData,
  CardDeletedData,
  TaskToggledData,
  LaneReorderedData,
  ProjectUpdatedData,
  ProjectDeletedData,
  SearchResult,
} from '../types';

// Search debounce timer
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Change indicator types for visual animations
export type ChangeIndicatorType = 
  | 'task:toggled' 
  | 'card:created' 
  | 'card:moved' 
  | 'card:updated';

export interface ChangeIndicator {
  id: string;
  type: ChangeIndicatorType;
  timestamp: number;
  cardSlug: string;
  lane?: string;
  taskIndex?: number;
  expiresAt: number;
}

interface DevPlannerStore {
  // Loading states
  isLoadingProjects: boolean;
  isLoadingCards: boolean;
  isLoadingCardDetail: boolean;

  // Projects
  projects: ProjectSummary[];
  activeProjectSlug: string | null;
  loadProjects: () => Promise<void>;
  createProject: (name: string, description?: string) => Promise<void>;
  archiveProject: (slug: string) => Promise<void>;
  setActiveProject: (slug: string) => void;

  // Cards (organized by lane for efficient access)
  cardsByLane: Record<string, CardSummary[]>;
  loadCards: () => Promise<void>;
  createCard: (title: string, lane?: string) => Promise<void>;
  archiveCard: (cardSlug: string) => Promise<void>;
  moveCard: (
    cardSlug: string,
    targetLane: string,
    position?: number
  ) => Promise<void>;
  reorderCards: (laneSlug: string, order: string[]) => Promise<void>;

  // Card Detail Panel
  activeCard: Card | null;
  isDetailPanelOpen: boolean;
  openCardDetail: (cardSlug: string) => Promise<void>;
  closeCardDetail: () => void;

  // Task operations
  toggleTask: (
    cardSlug: string,
    taskIndex: number,
    checked: boolean
  ) => Promise<void>;
  addTask: (cardSlug: string, text: string) => Promise<void>;

  // Card editing
  updateCard: (cardSlug: string, updates: UpdateCardInput) => Promise<void>;

  // Project tags (for autocomplete)
  projectTags: string[];
  loadProjectTags: () => Promise<void>;

  // Card preview task expansion (local UI state)
  expandedCardTasks: Set<string>;
  toggleCardTaskExpansion: (cardSlug: string) => void;

  // Lane visibility
  laneCollapsedState: Record<string, boolean>;
  toggleLaneCollapsed: (laneSlug: string) => void;
  initializeLaneState: (lanes: Record<string, LaneConfig>) => void;

  // Sidebar
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Change indicators for animations
  changeIndicators: Map<string, ChangeIndicator>;
  addChangeIndicator: (
    indicator: Omit<ChangeIndicator, 'id' | 'timestamp' | 'expiresAt'>
  ) => string;
  removeChangeIndicator: (id: string) => void;
  clearExpiredIndicators: () => void;
  getCardIndicators: (cardSlug: string) => ChangeIndicator[];
  getTaskIndicator: (cardSlug: string, taskIndex: number) => ChangeIndicator | null;

  // Activity History
  historyEvents: HistoryEvent[];
  isActivityPanelOpen: boolean;
  loadHistory: () => Promise<void>;
  addHistoryEvent: (event: HistoryEvent) => void;
  toggleActivityPanel: () => void;
  setActivityPanelOpen: (open: boolean) => void;

  // WebSocket state
  wsConnected: boolean;
  wsReconnecting: boolean;
  setWsConnected: (connected: boolean) => void;
  setWsReconnecting: (reconnecting: boolean) => void;

  // Self-echo deduplication
  _recentLocalActions: Map<string, number>;
  _recordLocalAction: (key: string) => void;
  _isRecentLocalAction: (key: string) => boolean;

  // Track in-progress card creations (to prevent race with WebSocket)
  _creatingCards: Set<string>; // Set of card titles being created

  // Debounced loadCards for fallback scenarios
  _lastLoadCardsTime: number;
  _debouncedLoadCards: () => void;

  // WebSocket handlers
  wsHandleCardCreated?: (data: CardCreatedData) => void;
  wsHandleCardUpdated?: (data: CardUpdatedData) => void;
  wsHandleCardMoved?: (data: CardMovedData) => void;
  wsHandleCardDeleted?: (data: CardDeletedData) => void;
  wsHandleTaskToggled?: (data: TaskToggledData) => void;
  wsHandleLaneReordered?: (data: LaneReorderedData) => void;
  wsHandleProjectUpdated?: (data: ProjectUpdatedData) => void;
  wsHandleProjectDeleted?: (data: ProjectDeletedData) => void;

  // Search
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
  isCardHighlighted: (cardSlug: string) => boolean;
  getMatchedTaskIndices: (cardSlug: string) => number[];
}

export const useStore = create<DevPlannerStore>((set, get) => ({
  // Initial state
  isLoadingProjects: false,
  isLoadingCards: false,
  isLoadingCardDetail: false,
  projects: [],
  activeProjectSlug: null,
  cardsByLane: {},
  activeCard: null,
  isDetailPanelOpen: false,
  expandedCardTasks: new Set(),
  laneCollapsedState: {},
  isSidebarOpen: true,
  changeIndicators: new Map(),
  historyEvents: [],
  isActivityPanelOpen: false,
  projectTags: [],
  wsConnected: false,
  wsReconnecting: false,
  _recentLocalActions: new Map(),
  _creatingCards: new Set(),
  _lastLoadCardsTime: 0,
  searchQuery: '',
  searchResults: [],
  isSearching: false,

  // Project actions
  loadProjects: async () => {
    set({ isLoadingProjects: true });
    try {
      const { projects } = await projectsApi.list();
      set({ projects, isLoadingProjects: false });

      // Load last selected project from preferences
      const { activeProjectSlug } = get();
      if (!activeProjectSlug && projects.length > 0) {
        try {
          const preferences = await preferencesApi.get();
          const lastProject = preferences.lastSelectedProject;
          
          // Check if last selected project still exists
          if (lastProject && projects.some(p => p.slug === lastProject)) {
            get().setActiveProject(lastProject);
          } else {
            // Fall back to first project
            get().setActiveProject(projects[0].slug);
          }
        } catch (error) {
          console.error('Failed to load preferences:', error);
          // Fall back to first project
          get().setActiveProject(projects[0].slug);
        }
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
      set({ isLoadingProjects: false });
    }
  },

  createProject: async (name, description) => {
    const project = await projectsApi.create(name, description);
    set((state) => ({
      projects: [project, ...state.projects],
    }));
    get().setActiveProject(project.slug);
  },

  archiveProject: async (slug) => {
    await projectsApi.archive(slug);
    set((state) => ({
      projects: state.projects.filter((p) => p.slug !== slug),
      activeProjectSlug:
        state.activeProjectSlug === slug ? null : state.activeProjectSlug,
    }));
  },

  setActiveProject: (slug) => {
    const project = get().projects.find((p) => p.slug === slug);
    if (project) {
      set({ activeProjectSlug: slug });
      get().clearSearch(); // Clear search when switching projects

      // Save to preferences
      preferencesApi.update({ lastSelectedProject: slug }).catch(error => {
        console.error('Failed to save last selected project:', error);
      });

      get().initializeLaneState(project.lanes);
      get().loadCards();
    }
  },

  // Card actions
  loadCards: async () => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    set({ isLoadingCards: true, _lastLoadCardsTime: Date.now() });
    try {
      const { cards } = await cardsApi.list(activeProjectSlug);

      // Organize cards by lane
      const cardsByLane: Record<string, CardSummary[]> = {};
      for (const card of cards) {
        if (!cardsByLane[card.lane]) {
          cardsByLane[card.lane] = [];
        }
        cardsByLane[card.lane].push(card);
      }

      set({ cardsByLane, isLoadingCards: false });
    } catch (error) {
      console.error('Failed to load cards:', error);
      set({ isLoadingCards: false });
    }
  },

  _debouncedLoadCards: () => {
    const state = get();
    const now = Date.now();
    const timeSinceLastLoad = now - state._lastLoadCardsTime;
    const DEBOUNCE_MS = 2000; // Don't reload if loaded within last 2 seconds
    
    if (timeSinceLastLoad < DEBOUNCE_MS) {
      console.log(`[_debouncedLoadCards] Skipping reload (last load was ${timeSinceLastLoad}ms ago)`);
      return;
    }
    
    console.log('[_debouncedLoadCards] Executing debounced reload');
    state.loadCards();
  },

  createCard: async (title, lane = '01-upcoming') => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    // Track that we're creating this card (before API call)
    const creationKey = `${activeProjectSlug}:${lane}:${title}`;
    set((state) => ({
      _creatingCards: new Set(state._creatingCards).add(creationKey),
    }));

    try {
      const card = await cardsApi.create(activeProjectSlug, { title, lane });

      // Record local action for self-echo dedup
      get()._recordLocalAction(`card:created:${card.slug}`);

      // Add to cardsByLane
      set((state) => {
        const laneCards = state.cardsByLane[lane] || [];
        return {
          cardsByLane: {
            ...state.cardsByLane,
            [lane]: [
              ...laneCards,
              {
                slug: card.slug,
                filename: card.filename,
                lane: card.lane,
                frontmatter: card.frontmatter,
                taskProgress: { total: 0, checked: 0 },
              },
            ],
          },
        };
      });

      // Add visual indicator for the new card
      get().addChangeIndicator({
        type: 'card:created',
        cardSlug: card.slug,
        lane,
      });
    } finally {
      // Remove from in-progress tracking
      set((state) => {
        const newSet = new Set(state._creatingCards);
        newSet.delete(creationKey);
        return { _creatingCards: newSet };
      });
    }
  },

  archiveCard: async (cardSlug) => {
    const { activeProjectSlug, cardsByLane } = get();
    if (!activeProjectSlug) return;

    // Find current lane
    let currentLane = '';
    for (const [lane, cards] of Object.entries(cardsByLane)) {
      if (cards.some((c) => c.slug === cardSlug)) {
        currentLane = lane;
        break;
      }
    }

    // Record local action BEFORE API call to prevent race condition with WebSocket
    get()._recordLocalAction(`card:moved:${cardSlug}`);

    await cardsApi.archive(activeProjectSlug, cardSlug);

    // Move from current lane to archive
    set((state) => {
      const sourceCards = state.cardsByLane[currentLane] || [];
      const card = sourceCards.find((c) => c.slug === cardSlug);
      if (!card) return state;

      const archiveCards = state.cardsByLane['04-archive'] || [];

      return {
        cardsByLane: {
          ...state.cardsByLane,
          [currentLane]: sourceCards.filter((c) => c.slug !== cardSlug),
          '04-archive': [...archiveCards, { ...card, lane: '04-archive' }],
        },
      };
    });
  },

  moveCard: async (cardSlug, targetLane, position) => {
    const { activeProjectSlug, cardsByLane } = get();
    if (!activeProjectSlug) return;

    // Find current lane
    let currentLane = '';
    let card: CardSummary | undefined;
    for (const [lane, cards] of Object.entries(cardsByLane)) {
      const foundCard = cards.find((c) => c.slug === cardSlug);
      if (foundCard) {
        currentLane = lane;
        card = foundCard;
        break;
      }
    }

    if (!card) return;

    // Record local action BEFORE API call to prevent race condition with WebSocket
    get()._recordLocalAction(`card:moved:${cardSlug}`);

    // OPTIMISTIC UPDATE - update UI immediately for smooth animation
    set((state) => {
      const sourceCards = state.cardsByLane[currentLane] || [];
      const targetCards = [...(state.cardsByLane[targetLane] || [])];
      const movedCard = { ...card!, lane: targetLane };

      if (position !== undefined) {
        targetCards.splice(position, 0, movedCard);
      } else {
        targetCards.push(movedCard);
      }

      return {
        cardsByLane: {
          ...state.cardsByLane,
          [currentLane]: sourceCards.filter((c) => c.slug !== cardSlug),
          [targetLane]: targetCards,
        },
      };
    });

    // Add visual indicator for moved card (only if lanes are different)
    if (currentLane !== targetLane) {
      get().addChangeIndicator({
        type: 'card:moved',
        cardSlug,
        lane: targetLane,
      });
    }

    try {
      // API call after optimistic update
      await cardsApi.move(activeProjectSlug, cardSlug, targetLane, position);
    } catch (error) {
      // Revert on error - move card back to original lane
      console.error('Failed to move card:', error);
      set((state) => {
        const targetCards = state.cardsByLane[targetLane] || [];
        const sourceCards = [...(state.cardsByLane[currentLane] || [])];
        const revertCard = { ...card!, lane: currentLane };

        // Add back to source lane
        if (position !== undefined) {
          // Try to restore original position
          const originalIndex = sourceCards.findIndex(c => c.slug === cardSlug);
          if (originalIndex === -1) {
            sourceCards.push(revertCard);
          }
        } else {
          sourceCards.push(revertCard);
        }

        return {
          cardsByLane: {
            ...state.cardsByLane,
            [currentLane]: sourceCards,
            [targetLane]: targetCards.filter((c) => c.slug !== cardSlug),
          },
        };
      });
    }
  },

  reorderCards: async (laneSlug, order) => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    console.log(`[reorderCards] ========== INITIATING REORDER ==========`);
    console.log(`[reorderCards] Lane: ${laneSlug}`);
    console.log(`[reorderCards] New order (from drag-drop):`, order);
    
    // Record local action BEFORE API call to prevent race condition
    get()._recordLocalAction(`lane:reordered:${laneSlug}`);
    console.log(`[reorderCards] ✓ Recorded local action: lane:reordered:${laneSlug}`);

    // Optimistic update - reorder cards in state immediately
    set((state) => {
      const laneCards = state.cardsByLane[laneSlug] || [];
      const cardMap = new Map(laneCards.map((c) => [c.filename, c]));
      const reordered = order
        .map((filename) => cardMap.get(filename))
        .filter((c): c is CardSummary => c !== undefined);

      console.log(`[reorderCards] ✓ Optimistic update applied, new order:`, reordered.map(c => c.filename));

      return {
        cardsByLane: {
          ...state.cardsByLane,
          [laneSlug]: reordered,
        },
      };
    });

    // Make API call (errors will be caught by caller)
    console.log(`[reorderCards] Calling API...`);
    await cardsApi.reorder(activeProjectSlug, laneSlug, order);
    console.log(`[reorderCards] ✓ API call completed`);
    console.log(`[reorderCards] ================================`);
  },

  // Card Detail Panel actions
  openCardDetail: async (cardSlug) => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    console.log(`[openCardDetail] CALLED for ${cardSlug}, current activeCard:`, get().activeCard?.slug);
    set({ isLoadingCardDetail: true, isDetailPanelOpen: true });
    try {
      const card = await cardsApi.get(activeProjectSlug, cardSlug);
      console.log(`[openCardDetail] Fetched ${cardSlug}, tasks:`, card.tasks);
      set({ activeCard: card, isLoadingCardDetail: false });
      console.log(`[openCardDetail] SET activeCard for ${cardSlug}`);
    } catch (error) {
      console.error('Failed to load card:', error);
      set({ isLoadingCardDetail: false, isDetailPanelOpen: false });
    }
  },

  closeCardDetail: () => {
    set({ isDetailPanelOpen: false, activeCard: null });
  },

  // Task actions
  toggleTask: async (cardSlug, taskIndex, checked) => {
    const { activeProjectSlug, activeCard } = get();
    if (!activeProjectSlug) return;

    // Record local action BEFORE API call to prevent race condition with WebSocket
    get()._recordLocalAction(`task:toggled:${cardSlug}:${taskIndex}`);

    const result = await tasksApi.toggle(
      activeProjectSlug,
      cardSlug,
      taskIndex,
      checked
    );

    // Update active card if it matches
    if (activeCard && activeCard.slug === cardSlug) {
      set((state) => ({
        activeCard: state.activeCard
          ? {
              ...state.activeCard,
              tasks: state.activeCard.tasks.map((t, i) =>
                i === taskIndex ? { ...t, checked } : t
              ),
            }
          : null,
      }));
    }

    // Update card summary in cardsByLane
    set((state) => {
      const newCardsByLane = { ...state.cardsByLane };
      for (const [lane, cards] of Object.entries(newCardsByLane)) {
        const cardIndex = cards.findIndex((c) => c.slug === cardSlug);
        if (cardIndex !== -1) {
          newCardsByLane[lane] = cards.map((c, i) =>
            i === cardIndex ? { ...c, taskProgress: result.taskProgress } : c
          );
          break;
        }
      }
      return { cardsByLane: newCardsByLane };
    });

    // Add visual indicator for task toggle
    get().addChangeIndicator({
      type: 'task:toggled',
      cardSlug,
      taskIndex,
    });
  },

  addTask: async (cardSlug, text) => {
    const { activeProjectSlug, activeCard } = get();
    if (!activeProjectSlug) return;

    console.log(`[addTask] Starting for ${cardSlug}, current tasks:`, activeCard?.tasks);
    const result = await tasksApi.add(activeProjectSlug, cardSlug, text);
    console.log(`[addTask] API returned:`, result);
    
    // Record this as a local action to prevent self-echo from file watcher events
    get()._recordLocalAction(`card:updated:${cardSlug}`);
    console.log(`[addTask] Recorded local action at`, Date.now());

    // Update active card if it matches
    if (activeCard && activeCard.slug === cardSlug) {
      set((state) => {
        console.log(`[addTask] SET #1 - Before update, state.activeCard.tasks:`, state.activeCard?.tasks);
        const updated = {
          activeCard: state.activeCard
            ? {
                ...state.activeCard,
                tasks: [...state.activeCard.tasks, result],
              }
            : null,
        };
        console.log(`[addTask] SET #1 - After update, new tasks:`, updated.activeCard?.tasks);
        return updated;
      });
      console.log(`[addTask] After SET #1, store activeCard.tasks:`, get().activeCard?.tasks);
    }

    // Update card summary
    set((state) => {
      const newCardsByLane = { ...state.cardsByLane };
      for (const [lane, cards] of Object.entries(newCardsByLane)) {
        const cardIndex = cards.findIndex((c) => c.slug === cardSlug);
        if (cardIndex !== -1) {
          newCardsByLane[lane] = cards.map((c, i) =>
            i === cardIndex ? { ...c, taskProgress: result.taskProgress } : c
          );
          break;
        }
      }
      return { cardsByLane: newCardsByLane };
    });
    console.log(`[addTask] After SET #2, store activeCard.tasks:`, get().activeCard?.tasks);
    console.log(`[addTask] COMPLETE for ${cardSlug}`);
  },

  updateCard: async (cardSlug, updates) => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    // Record local action for self-echo dedup
    get()._recordLocalAction(`card:updated:${cardSlug}`);

    const updatedCard = await cardsApi.update(activeProjectSlug, cardSlug, updates);

    // Update activeCard if it matches
    if (get().activeCard?.slug === cardSlug) {
      set({ activeCard: updatedCard });
    }

    // Update card summary in cardsByLane
    set((state) => {
      const newCardsByLane = { ...state.cardsByLane };
      for (const [lane, cards] of Object.entries(newCardsByLane)) {
        const cardIndex = cards.findIndex((c) => c.slug === cardSlug);
        if (cardIndex !== -1) {
          newCardsByLane[lane] = cards.map((c, i) =>
            i === cardIndex
              ? {
                  ...c,
                  frontmatter: updatedCard.frontmatter,
                  taskProgress: {
                    total: updatedCard.tasks.length,
                    checked: updatedCard.tasks.filter(t => t.checked).length,
                  },
                }
              : c
          );
          break;
        }
      }
      return { cardsByLane: newCardsByLane };
    });

    // Add visual indicator
    get().addChangeIndicator({
      type: 'card:updated',
      cardSlug,
    });

    // Reload project tags in case new tags were added
    if (updates.tags !== undefined) {
      get().loadProjectTags();
    }
  },

  loadProjectTags: async () => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    try {
      const { tags } = await cardsApi.listTags(activeProjectSlug);
      set({ projectTags: tags });
    } catch (error) {
      console.error('Failed to load project tags:', error);
    }
  },

  // Card task expansion
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

  // Lane visibility
  toggleLaneCollapsed: (laneSlug) => {
    set((state) => ({
      laneCollapsedState: {
        ...state.laneCollapsedState,
        [laneSlug]: !state.laneCollapsedState[laneSlug],
      },
    }));
  },

  initializeLaneState: (lanes) => {
    const laneCollapsedState: Record<string, boolean> = {};
    for (const [slug, config] of Object.entries(lanes)) {
      laneCollapsedState[slug] = config.collapsed;
    }
    set({ laneCollapsedState });
  },

  // Sidebar
  toggleSidebar: () => {
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
  },

  setSidebarOpen: (open) => {
    set({ isSidebarOpen: open });
  },

  // Change indicator actions
  addChangeIndicator: (indicator) => {
    const id = `${indicator.type}-${indicator.cardSlug}-${indicator.taskIndex ?? 'card'}-${Date.now()}`;
    const timestamp = Date.now();
    const expiresAt = timestamp + getIndicatorDuration(indicator.type);

    const newIndicator: ChangeIndicator = {
      id,
      timestamp,
      expiresAt,
      ...indicator,
    };

    set((state) => {
      const newIndicators = new Map(state.changeIndicators);
      newIndicators.set(id, newIndicator);
      return { changeIndicators: newIndicators };
    });

    // Auto-remove after expiration
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

  // Activity History actions
  loadHistory: async () => {
    const projectSlug = get().activeProjectSlug;
    if (!projectSlug) return;

    try {
      const response = await fetch(
        `/api/projects/${projectSlug}/history?limit=50`
      );
      if (!response.ok) {
        throw new Error('Failed to load history');
      }
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

  toggleActivityPanel: () => {
    set((state) => ({
      isActivityPanelOpen: !state.isActivityPanelOpen,
    }));
  },

  setActivityPanelOpen: (open: boolean) => {
    set({ isActivityPanelOpen: open });
  },

  // WebSocket state setters
  setWsConnected: (connected: boolean) => {
    set({ wsConnected: connected });
  },

  setWsReconnecting: (reconnecting: boolean) => {
    set({ wsReconnecting: reconnecting });
  },

  // Self-echo deduplication helpers
  _recordLocalAction: (key: string) => {
    const now = Date.now();
    set((state) => {
      const newMap = new Map(state._recentLocalActions);
      newMap.set(key, now);
      
      // Cleanup old entries (older than 5 seconds)
      for (const [actionKey, timestamp] of newMap.entries()) {
        if (now - timestamp > 5000) {
          newMap.delete(actionKey);
        }
      }
      
      return { _recentLocalActions: newMap };
    });
  },

  _isRecentLocalAction: (key: string): boolean => {
    const actions = get()._recentLocalActions;
    const timestamp = actions.get(key);
    const now = Date.now();
    const isRecent = timestamp ? now - timestamp < 5000 : false;
    console.log(`[_isRecentLocalAction] key="${key}", timestamp=${timestamp}, now=${now}, diff=${timestamp ? now - timestamp : 'N/A'}ms, isRecent=${isRecent}`);
    if (!timestamp) return false;
    
    // Consider action recent if within 5 seconds (accounts for file watcher debounce + processing)
    return now - timestamp < 5000;
  },

  // WebSocket event handlers
  wsHandleCardCreated: (data: CardCreatedData) => {
    const { card } = data;
    const { slug, lane } = card;
    const state = get();

    // Skip if this is a self-echo from our own action
    const actionKey = `card:created:${slug}`;
    if (state._isRecentLocalAction(actionKey)) {
      console.log(`[wsHandleCardCreated] Skipping self-echo for ${slug}`);
      return;
    }

    // Skip if we're currently creating a card with this title in this lane
    const creationKey = `${state.activeProjectSlug}:${lane}:${card.frontmatter.title}`;
    if (state._creatingCards.has(creationKey)) {
      console.log(`[wsHandleCardCreated] Skipping - currently creating card "${card.frontmatter.title}" in ${lane}`);
      return;
    }

    // Check if card already exists (dedup)
    const existingCards = state.cardsByLane[lane] || [];
    if (existingCards.some(c => c.slug === slug)) {
      console.log(`[wsHandleCardCreated] Card ${slug} already exists, skipping`);
      return;
    }

    // Prepend new card to lane
    set((state) => ({
      cardsByLane: {
        ...state.cardsByLane,
        [lane]: [card, ...(state.cardsByLane[lane] || [])],
      },
    }));

    // Add change indicator (we know it's not a local action at this point)
    state.addChangeIndicator({
      type: 'card:created',
      cardSlug: slug,
      lane,
    });
  },

  wsHandleCardUpdated: (data: CardUpdatedData) => {
    const { card } = data;
    const { slug, lane } = card;
    const state = get();
    
    // Prevent self-echo: ignore if this was a recent local action
    const actionKey = `card:updated:${slug}`;
    if (state._isRecentLocalAction(actionKey)) {
      console.log(`[wsHandleCardUpdated] Ignoring self-echo for ${slug}`);
      return;
    }
    
    console.log(`[wsHandleCardUpdated] START - ${slug}, activeCard:`, {
      slug: state.activeCard?.slug,
      taskCount: state.activeCard?.tasks?.length,
      tasks: state.activeCard?.tasks,
    });
    
    // Find and replace card in the specified lane
    let found = false;
    const newCardsByLane = { ...state.cardsByLane };
    
    if (newCardsByLane[lane]) {
      const cardIndex = newCardsByLane[lane].findIndex(c => c.slug === slug);
      if (cardIndex !== -1) {
        const oldCard = newCardsByLane[lane][cardIndex];
        newCardsByLane[lane] = [...newCardsByLane[lane]];
        newCardsByLane[lane][cardIndex] = card;
        found = true;
        
        // Detect task progress changes
        const oldProgress = oldCard.taskProgress;
        const newProgress = card.taskProgress;
        const actionKey = `card:updated:${slug}`;
        
        if (oldProgress.checked !== newProgress.checked && !state._isRecentLocalAction(actionKey)) {
          // Task was toggled
          state.addChangeIndicator({
            type: 'task:toggled',
            cardSlug: slug,
            lane,
          });
        } else if (!state._isRecentLocalAction(actionKey)) {
          // Regular card update
          state.addChangeIndicator({
            type: 'card:updated',
            cardSlug: slug,
            lane,
          });
        }
      }
    }
    
    // Fallback: search all lanes if not found in expected lane
    if (!found) {
      for (const [laneKey, cards] of Object.entries(newCardsByLane)) {
        const cardIndex = cards.findIndex(c => c.slug === slug);
        if (cardIndex !== -1) {
          newCardsByLane[laneKey] = [...cards];
          newCardsByLane[laneKey][cardIndex] = card;
          found = true;
          break;
        }
      }
    }
    
    // If still not found, insert it
    if (!found && newCardsByLane[lane]) {
      newCardsByLane[lane] = [card, ...newCardsByLane[lane]];
    }
    
    console.log(`[wsHandleCardUpdated] About to SET cardsByLane for ${slug}`);
    set({ cardsByLane: newCardsByLane });
    console.log(`[wsHandleCardUpdated] After SET, store activeCard.tasks:`, get().activeCard?.tasks);
    
    // Reload active card if it matches, but only if this wasn't a recent local action
    // This prevents API fetches from overwriting optimistic updates
    const actionKeyForRefetch = `card:updated:${slug}`;
    const isRecentAction = state._isRecentLocalAction(actionKeyForRefetch);
    console.log(`[wsHandleCardUpdated] Check refetch:`, {
      activeCardMatches: state.activeCard?.slug === slug,
      isRecentAction,
      willRefetch: state.activeCard?.slug === slug && !isRecentAction,
    });
    if (state.activeCard?.slug === slug && !isRecentAction) {
      console.log(`[wsHandleCardUpdated] REFETCHING ${slug} from API`);
      state.openCardDetail(slug);
    } else {
      console.log(`[wsHandleCardUpdated] SKIPPING refetch for ${slug}`);
    }
  },

  wsHandleCardMoved: (data: CardMovedData) => {
    const { slug, sourceLane, targetLane } = data;
    const state = get();
    
    // Prevent self-echo: ignore if this was a recent local action
    const actionKey = `card:moved:${slug}`;
    if (state._isRecentLocalAction(actionKey)) {
      console.log(`[wsHandleCardMoved] Ignoring self-echo for ${slug}`);
      return;
    }
    
    // Find and remove card from source lane
    const newCardsByLane = { ...state.cardsByLane };
    let movedCard: CardSummary | null = null;
    
    if (newCardsByLane[sourceLane]) {
      const cardIndex = newCardsByLane[sourceLane].findIndex(c => c.slug === slug);
      if (cardIndex !== -1) {
        movedCard = newCardsByLane[sourceLane][cardIndex];
        newCardsByLane[sourceLane] = newCardsByLane[sourceLane].filter(c => c.slug !== slug);
      }
    }
    
    // If card not found in source, search all lanes
    if (!movedCard) {
      for (const [laneKey, cards] of Object.entries(newCardsByLane)) {
        const cardIndex = cards.findIndex(c => c.slug === slug);
        if (cardIndex !== -1) {
          movedCard = cards[cardIndex];
          newCardsByLane[laneKey] = cards.filter(c => c.slug !== slug);
          break;
        }
      }
    }
    
    // If still not found, fetch from API (debounced to prevent cascading reloads)
    if (!movedCard) {
      console.warn(`[wsHandleCardMoved] Card ${slug} not found in local state, scheduling debounced reload`);
      // Use debounced reload to prevent excessive API calls during rapid operations
      state._debouncedLoadCards();
      return;
    }
    
    // Update card's lane and insert into target lane
    const updatedCard = { ...movedCard, lane: targetLane };
    newCardsByLane[targetLane] = [updatedCard, ...(newCardsByLane[targetLane] || [])];
    
    set({ cardsByLane: newCardsByLane });
    
    // Update active card lane if it matches
    if (state.activeCard?.slug === slug) {
      set((state) => ({
        activeCard: state.activeCard ? { ...state.activeCard, lane: targetLane } : null,
      }));
    }
    
    // Add change indicator if not a recent local action
    const actionKeyForIndicator = `card:moved:${slug}`;
    if (!state._isRecentLocalAction(actionKeyForIndicator)) {
      state.addChangeIndicator({
        type: 'card:moved',
        cardSlug: slug,
        lane: targetLane,
      });
    }
  },

  wsHandleCardDeleted: (data: CardDeletedData) => {
    const { slug, lane } = data;
    const state = get();
    
    // Remove card from lane
    const newCardsByLane = { ...state.cardsByLane };
    if (newCardsByLane[lane]) {
      newCardsByLane[lane] = newCardsByLane[lane].filter(c => c.slug !== slug);
    }
    
    set({ cardsByLane: newCardsByLane });
    
    // Close detail panel if it's showing this card
    if (state.activeCard?.slug === slug) {
      state.closeCardDetail();
    }
  },

  wsHandleLaneReordered: (data: LaneReorderedData) => {
    const { lane, order } = data;
    const state = get();
    
    console.log(`[wsHandleLaneReordered] ========== RECEIVED EVENT ==========`);
    console.log(`[wsHandleLaneReordered] Lane: ${lane}`);
    console.log(`[wsHandleLaneReordered] New order from server:`, order);
    
    // Prevent self-echo: ignore if this was a recent local action
    const actionKey = `lane:reordered:${lane}`;
    if (state._isRecentLocalAction(actionKey)) {
      console.log(`[wsHandleLaneReordered] ⚠️ IGNORING - self-echo detected for ${lane}`);
      return;
    }
    
    console.log(`[wsHandleLaneReordered] ✓ Not a self-echo, processing reorder...`);
    
    const currentCards = state.cardsByLane[lane] || [];
    console.log(`[wsHandleLaneReordered] Current cards in lane (${currentCards.length}):`, currentCards.map(c => c.filename));
    
    // Create a map for quick lookup - keyed by filename (to match optimistic update logic)
    const cardMap = new Map(currentCards.map(card => [card.filename, card]));
    console.log(`[wsHandleLaneReordered] Card map keys:`, Array.from(cardMap.keys()));
    
    // Reorder cards according to the filenames in the order array
    const reorderedCards = order
      .map(filename => {
        const card = cardMap.get(filename);
        if (!card) {
          console.warn(`[wsHandleLaneReordered] ⚠️ Card not found for filename: ${filename}`);
        }
        return card;
      })
      .filter((card): card is CardSummary => card !== undefined);
    
    console.log(`[wsHandleLaneReordered] Reordered ${reorderedCards.length} cards`);
    console.log(`[wsHandleLaneReordered] New card order:`, reorderedCards.map(c => c.filename));
    
    set((state) => ({
      cardsByLane: {
        ...state.cardsByLane,
        [lane]: reorderedCards,
      },
    }));
    
    console.log(`[wsHandleLaneReordered] ✓ State updated successfully`);
    console.log(`[wsHandleLaneReordered] ================================`);
  },

  wsHandleTaskToggled: (data: TaskToggledData) => {
    const { cardSlug, taskIndex, checked, taskProgress } = data;
    const state = get();
    
    // Prevent self-echo: ignore if this was a recent local action
    const actionKey = `task:toggled:${cardSlug}:${taskIndex}`;
    if (state._isRecentLocalAction(actionKey)) {
      console.log(`[wsHandleTaskToggled] Ignoring self-echo for ${cardSlug}:${taskIndex}`);
      return;
    }
    
    console.log(`[wsHandleTaskToggled] Task ${taskIndex} on ${cardSlug} toggled to ${checked}`);
    
    // Find and update the card's task progress in cardsByLane
    const newCardsByLane = { ...state.cardsByLane };
    let cardFound = false;
    let cardLane: string | undefined;
    
    for (const [lane, cards] of Object.entries(newCardsByLane)) {
      const cardIndex = cards.findIndex(c => c.slug === cardSlug);
      if (cardIndex !== -1) {
        newCardsByLane[lane] = [...cards];
        newCardsByLane[lane][cardIndex] = {
          ...cards[cardIndex],
          taskProgress,
        };
        cardFound = true;
        cardLane = lane;
        break;
      }
    }
    
    if (cardFound) {
      set({ cardsByLane: newCardsByLane });
      
      // Add change indicator if not a recent local action
      const actionKey = `task:toggled:${cardSlug}:${taskIndex}`;
      if (cardLane && !state._isRecentLocalAction(actionKey)) {
        state.addChangeIndicator({
          type: 'task:toggled',
          cardSlug,
          lane: cardLane,
          taskIndex,
        });
      }
    } else {
      console.warn(`[wsHandleTaskToggled] Card ${cardSlug} not found in cardsByLane`);
    }
    
    // If this card is currently open in detail view, refresh it
    const actionKeyForRefetch = `task:toggled:${cardSlug}:${taskIndex}`;
    if (state.activeCard?.slug === cardSlug && !state._isRecentLocalAction(actionKeyForRefetch)) {
      console.log(`[wsHandleTaskToggled] Refreshing active card ${cardSlug}`);
      state.openCardDetail(cardSlug);
    }
  },

  wsHandleProjectUpdated: (data: ProjectUpdatedData) => {
    const { config } = data;
    const state = get();
    
    // Find and merge updated config into projects
    const projectIndex = state.projects.findIndex(p => p.slug === state.activeProjectSlug);
    if (projectIndex !== -1) {
      const updatedProjects = [...state.projects];
      updatedProjects[projectIndex] = {
        ...updatedProjects[projectIndex],
        ...config,
      };
      set({ projects: updatedProjects });
    }
  },

  wsHandleProjectDeleted: (data: ProjectDeletedData) => {
    const { slug } = data;
    const state = get();

    console.log(`[wsHandleProjectDeleted] Project ${slug} was deleted`);

    // Remove project from list
    const projects = state.projects.filter(p => p.slug !== slug);

    // If it was the active project, clear state and close detail panel
    if (state.activeProjectSlug === slug) {
      set({
        projects,
        activeProjectSlug: null,
        cardsByLane: {},
        activeCard: null,
        isDetailPanelOpen: false,
      });

      // Reload projects list to select a new active project if available
      state.loadProjects();
    } else {
      set({ projects });
    }
  },

  // Search actions
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });

    // Clear previous debounce timer
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    if (!query.trim()) {
      get().clearSearch();
      return;
    }

    // Debounce search: wait 300ms after typing stops
    set({ isSearching: true });
    searchDebounceTimer = setTimeout(async () => {
      const { activeProjectSlug } = get();
      if (!activeProjectSlug) return;

      try {
        const { results } = await cardsApi.search(activeProjectSlug, query);
        set({ searchResults: results, isSearching: false });

        // Auto-expand tasks for cards that have task matches
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

  isCardHighlighted: (cardSlug: string) => {
    const { searchResults, searchQuery } = get();
    if (!searchQuery) return false;
    return searchResults.some(r => r.slug === cardSlug);
  },

  getMatchedTaskIndices: (cardSlug: string) => {
    const result = get().searchResults.find(r => r.slug === cardSlug);
    return result?.matchedTaskIndices || [];
  },
}));

// Helper function to determine indicator duration based on type
function getIndicatorDuration(type: ChangeIndicatorType): number {
  switch (type) {
    case 'task:toggled':
      return 700; // 700ms for task flash + pulse
    case 'card:created':
      return 2000; // 2s for card glow
    case 'card:moved':
      return 1500; // 1.5s for moved card glow
    case 'card:updated':
      return 3000; // 3s for update badge
    default:
      return 2000;
  }
}

// Run cleanup periodically (every 5 seconds) - only in browser environment
let cleanupIntervalId: number | undefined;
if (typeof window !== 'undefined') {
  cleanupIntervalId = window.setInterval(() => {
    useStore.getState().clearExpiredIndicators();
  }, 5000);
  
  // Cleanup function for hot module replacement
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      if (cleanupIntervalId !== undefined) {
        clearInterval(cleanupIntervalId);
      }
    });
  }
}
