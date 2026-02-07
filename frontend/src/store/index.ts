import { create } from 'zustand';
import { projectsApi, cardsApi, tasksApi } from '../api/client';
import type {
  ProjectSummary,
  CardSummary,
  Card,
  LaneConfig,
} from '../types';

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

  // Project actions
  loadProjects: async () => {
    set({ isLoadingProjects: true });
    try {
      const { projects } = await projectsApi.list();
      set({ projects, isLoadingProjects: false });

      // Auto-select first project if none selected
      const { activeProjectSlug } = get();
      if (!activeProjectSlug && projects.length > 0) {
        get().setActiveProject(projects[0].slug);
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
      get().initializeLaneState(project.lanes);
      get().loadCards();
    }
  },

  // Card actions
  loadCards: async () => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    set({ isLoadingCards: true });
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

  createCard: async (title, lane = '01-upcoming') => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    const card = await cardsApi.create(activeProjectSlug, { title, lane });

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
    for (const [lane, cards] of Object.entries(cardsByLane)) {
      if (cards.some((c) => c.slug === cardSlug)) {
        currentLane = lane;
        break;
      }
    }

    await cardsApi.move(activeProjectSlug, cardSlug, targetLane, position);

    // Optimistic update
    set((state) => {
      const sourceCards = state.cardsByLane[currentLane] || [];
      const card = sourceCards.find((c) => c.slug === cardSlug);
      if (!card) return state;

      const targetCards = [...(state.cardsByLane[targetLane] || [])];
      const movedCard = { ...card, lane: targetLane };

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
  },

  reorderCards: async (laneSlug, order) => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    await cardsApi.reorder(activeProjectSlug, laneSlug, order);

    // Reorder cards in state
    set((state) => {
      const laneCards = state.cardsByLane[laneSlug] || [];
      const cardMap = new Map(laneCards.map((c) => [c.filename, c]));
      const reordered = order
        .map((filename) => cardMap.get(filename))
        .filter((c): c is CardSummary => c !== undefined);

      return {
        cardsByLane: {
          ...state.cardsByLane,
          [laneSlug]: reordered,
        },
      };
    });
  },

  // Card Detail Panel actions
  openCardDetail: async (cardSlug) => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    set({ isLoadingCardDetail: true, isDetailPanelOpen: true });
    try {
      const card = await cardsApi.get(activeProjectSlug, cardSlug);
      set({ activeCard: card, isLoadingCardDetail: false });
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
  },

  addTask: async (cardSlug, text) => {
    const { activeProjectSlug, activeCard } = get();
    if (!activeProjectSlug) return;

    const result = await tasksApi.add(activeProjectSlug, cardSlug, text);

    // Update active card if it matches
    if (activeCard && activeCard.slug === cardSlug) {
      set((state) => ({
        activeCard: state.activeCard
          ? {
              ...state.activeCard,
              tasks: [...state.activeCard.tasks, result],
            }
          : null,
      }));
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
}));
