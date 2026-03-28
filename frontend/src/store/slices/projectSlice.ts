import type { StateCreator } from 'zustand';
import { projectsApi, cardsApi, preferencesApi } from '../../api/client';
import type { CardSummary } from '../../types';
import type { DevPlannerStore, ProjectSlice } from '../types';

export const createProjectSlice: StateCreator<
  DevPlannerStore,
  [],
  [],
  ProjectSlice
> = (set, get) => ({
  isLoadingProjects: false,
  isLoadingCards: false,
  projects: [],
  activeProjectSlug: null,
  cardsByLane: {},
  projectTags: [],

  loadProjects: async () => {
    set({ isLoadingProjects: true });
    try {
      const { projects } = await projectsApi.list();
      set({ projects, isLoadingProjects: false });

      const { activeProjectSlug } = get();
      if (!activeProjectSlug && projects.length > 0) {
        try {
          const preferences = await preferencesApi.get();
          const lastProject = preferences.lastSelectedProject;
          if (lastProject && projects.some(p => p.slug === lastProject)) {
            get().setActiveProject(lastProject);
          } else {
            get().setActiveProject(projects[0].slug);
          }
        } catch (error) {
          console.error('Failed to load preferences:', error);
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
    set((state) => ({ projects: [project, ...state.projects] }));
    get().setActiveProject(project.slug);
  },

  updateProject: async (slug, updates) => {
    const updated = await projectsApi.update(slug, updates);
    set((state) => ({
      projects: state.projects.map((p) => p.slug === slug ? { ...p, ...updated } : p),
    }));
  },

  archiveProject: async (slug) => {
    await projectsApi.archive(slug);
    set((state) => ({
      projects: state.projects.filter((p) => p.slug !== slug),
      activeProjectSlug:
        state.activeProjectSlug === slug ? null : state.activeProjectSlug,
    }));
  },

  setActiveProject: (slug, _skipHistory = false) => {
    const project = get().projects.find((p) => p.slug === slug);
    if (project) {
      set({ activeProjectSlug: slug });
      get().clearSearch();
      preferencesApi.update({ lastSelectedProject: slug }).catch(error => {
        console.error('Failed to save last selected project:', error);
      });
      get().initializeLaneState(project.lanes);
      get().loadCards();
    }
  },

  loadCards: async () => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    set({ isLoadingCards: true, _lastLoadCardsTime: Date.now() });
    try {
      const { cards } = await cardsApi.list(activeProjectSlug);
      const cardsByLane: Record<string, CardSummary[]> = {};
      for (const card of cards) {
        if (!cardsByLane[card.lane]) cardsByLane[card.lane] = [];
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

    const creationKey = `${activeProjectSlug}:${lane}:${title}`;
    set((state) => ({
      _creatingCards: new Set(state._creatingCards).add(creationKey),
    }));

    try {
      const card = await cardsApi.create(activeProjectSlug, { title, lane });
      get()._recordLocalAction(`card:created:${card.slug}`);
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
      get().addChangeIndicator({ type: 'card:created', cardSlug: card.slug, lane });
    } finally {
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

    let currentLane = '';
    for (const [lane, cards] of Object.entries(cardsByLane)) {
      if (cards.some((c) => c.slug === cardSlug)) { currentLane = lane; break; }
    }

    get()._recordLocalAction(`card:moved:${cardSlug}`);
    await cardsApi.archive(activeProjectSlug, cardSlug);

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

  deleteCard: async (cardSlug) => {
    const { activeProjectSlug, cardsByLane } = get();
    if (!activeProjectSlug) return;

    let currentLane = '';
    for (const [lane, cards] of Object.entries(cardsByLane)) {
      if (cards.some((c) => c.slug === cardSlug)) { currentLane = lane; break; }
    }

    get()._recordLocalAction(`card:deleted:${cardSlug}`);
    await cardsApi.delete(activeProjectSlug, cardSlug);

    set((state) => {
      const sourceCards = state.cardsByLane[currentLane] || [];
      return {
        cardsByLane: {
          ...state.cardsByLane,
          [currentLane]: sourceCards.filter((c) => c.slug !== cardSlug),
        },
      };
    });
  },

  moveCard: async (cardSlug, targetLane, position) => {
    const { activeProjectSlug, cardsByLane } = get();
    if (!activeProjectSlug) return;

    let currentLane = '';
    let card: CardSummary | undefined;
    for (const [lane, cards] of Object.entries(cardsByLane)) {
      const foundCard = cards.find((c) => c.slug === cardSlug);
      if (foundCard) { currentLane = lane; card = foundCard; break; }
    }
    if (!card) return;

    get()._recordLocalAction(`card:moved:${cardSlug}`);

    // Optimistic update
    set((state) => {
      const sourceCards = state.cardsByLane[currentLane] || [];
      const targetCards = [...(state.cardsByLane[targetLane] || [])];
      const movedCard = { ...card!, lane: targetLane };
      if (position !== undefined) {
        targetCards.splice(position, 0, movedCard);
      } else if (currentLane !== targetLane) {
        targetCards.unshift(movedCard);
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

    if (currentLane !== targetLane) {
      get().addChangeIndicator({ type: 'card:moved', cardSlug, lane: targetLane });
    }

    try {
      await cardsApi.move(activeProjectSlug, cardSlug, targetLane, position);
    } catch (error) {
      console.error('Failed to move card:', error);
      set((state) => {
        const targetCards = state.cardsByLane[targetLane] || [];
        const sourceCards = [...(state.cardsByLane[currentLane] || [])];
        sourceCards.push({ ...card!, lane: currentLane });
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

    get()._recordLocalAction(`lane:reordered:${laneSlug}`);
    console.log(`[reorderCards] ✓ Recorded local action: lane:reordered:${laneSlug}`);

    set((state) => {
      const laneCards = state.cardsByLane[laneSlug] || [];
      const cardMap = new Map(laneCards.map((c) => [c.filename, c]));
      const reordered = order
        .map((filename) => cardMap.get(filename))
        .filter((c): c is CardSummary => c !== undefined);
      console.log(`[reorderCards] ✓ Optimistic update applied, new order:`, reordered.map(c => c.filename));
      return { cardsByLane: { ...state.cardsByLane, [laneSlug]: reordered } };
    });

    console.log(`[reorderCards] Calling API...`);
    await cardsApi.reorder(activeProjectSlug, laneSlug, order);
    console.log(`[reorderCards] ✓ API call completed`);
    console.log(`[reorderCards] ================================`);
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
});
