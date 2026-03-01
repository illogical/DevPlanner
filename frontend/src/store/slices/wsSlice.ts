import type { StateCreator } from 'zustand';
import type {
  CardSummary,
  CardLink,
  ProjectFileEntry,
  CardCreatedData,
  CardUpdatedData,
  CardMovedData,
  CardDeletedData,
  TaskToggledData,
  LaneReorderedData,
  ProjectUpdatedData,
  ProjectDeletedData,
  LinkAddedData,
  LinkUpdatedData,
  LinkDeletedData,
} from '../../types';
import type { DevPlannerStore, WSSlice } from '../types';

export const createWSSlice: StateCreator<
  DevPlannerStore,
  [],
  [],
  WSSlice
> = (set, get) => ({
  wsConnected: false,
  wsReconnecting: false,
  _recentLocalActions: new Map(),
  _lastRefetchTime: new Map(),
  _creatingCards: new Set(),
  _lastLoadCardsTime: 0,

  setWsConnected: (connected) => set({ wsConnected: connected }),

  setWsReconnecting: (reconnecting) => set({ wsReconnecting: reconnecting }),

  _recordLocalAction: (key) => {
    const now = Date.now();
    set((state) => {
      const newMap = new Map(state._recentLocalActions);
      newMap.set(key, now);
      // Cleanup entries older than 5 seconds
      for (const [actionKey, timestamp] of newMap.entries()) {
        if (now - timestamp > 5000) newMap.delete(actionKey);
      }
      return { _recentLocalActions: newMap };
    });
  },

  _isRecentLocalAction: (key) => {
    const actions = get()._recentLocalActions;
    const timestamp = actions.get(key);
    const now = Date.now();
    const isRecent = timestamp ? now - timestamp < 5000 : false;
    console.log(`[_isRecentLocalAction] key="${key}", timestamp=${timestamp}, now=${now}, diff=${timestamp ? now - timestamp : 'N/A'}ms, isRecent=${isRecent}`);
    if (!timestamp) return false;
    return now - timestamp < 5000;
  },

  _debouncedLoadCards: () => {
    const state = get();
    const now = Date.now();
    const timeSinceLastLoad = now - state._lastLoadCardsTime;
    const DEBOUNCE_MS = 2000;
    if (timeSinceLastLoad < DEBOUNCE_MS) {
      console.log(`[_debouncedLoadCards] Skipping reload (last load was ${timeSinceLastLoad}ms ago)`);
      return;
    }
    console.log('[_debouncedLoadCards] Executing debounced reload');
    state.loadCards();
  },

  wsHandleCardCreated: (data: CardCreatedData) => {
    const { card } = data;
    const { slug, lane } = card;
    const state = get();

    const actionKey = `card:created:${slug}`;
    if (state._isRecentLocalAction(actionKey)) {
      console.log(`[wsHandleCardCreated] Skipping self-echo for ${slug}`);
      return;
    }

    const creationKey = `${state.activeProjectSlug}:${lane}:${card.frontmatter.title}`;
    if (state._creatingCards.has(creationKey)) {
      console.log(`[wsHandleCardCreated] Skipping - currently creating card "${card.frontmatter.title}" in ${lane}`);
      return;
    }

    const existingCards = state.cardsByLane[lane] || [];
    if (existingCards.some(c => c.slug === slug)) {
      console.log(`[wsHandleCardCreated] Card ${slug} already exists, skipping`);
      return;
    }

    set((state) => ({
      cardsByLane: {
        ...state.cardsByLane,
        [lane]: [card, ...(state.cardsByLane[lane] || [])],
      },
    }));

    state.addChangeIndicator({ type: 'card:created', cardSlug: slug, lane });
  },

  wsHandleCardUpdated: (data: CardUpdatedData) => {
    const { card } = data;
    const { slug, lane } = card;
    const state = get();

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

    let found = false;
    const newCardsByLane = { ...state.cardsByLane };

    if (newCardsByLane[lane]) {
      const cardIndex = newCardsByLane[lane].findIndex(c => c.slug === slug);
      if (cardIndex !== -1) {
        const oldCard = newCardsByLane[lane][cardIndex];
        newCardsByLane[lane] = [...newCardsByLane[lane]];
        newCardsByLane[lane][cardIndex] = card;
        found = true;

        const oldProgress = oldCard.taskProgress;
        const newProgress = card.taskProgress;

        if (oldProgress.checked !== newProgress.checked && !state._isRecentLocalAction(actionKey)) {
          state.addChangeIndicator({ type: 'task:toggled', cardSlug: slug, lane });
        } else if (!state._isRecentLocalAction(actionKey)) {
          state.addChangeIndicator({ type: 'card:updated', cardSlug: slug, lane });
        }
      }
    }

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

    if (!found && newCardsByLane[lane]) {
      newCardsByLane[lane] = [card, ...newCardsByLane[lane]];
    }

    console.log(`[wsHandleCardUpdated] About to SET cardsByLane for ${slug}`);
    set({ cardsByLane: newCardsByLane });
    console.log(`[wsHandleCardUpdated] After SET, store activeCard.tasks:`, get().activeCard?.tasks);

    const isRecentAction = state._isRecentLocalAction(actionKey);
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

    const actionKey = `card:moved:${slug}`;
    if (state._isRecentLocalAction(actionKey)) {
      console.log(`[wsHandleCardMoved] Ignoring self-echo for ${slug}`);
      return;
    }

    const newCardsByLane = { ...state.cardsByLane };
    let movedCard: CardSummary | null = null;

    if (newCardsByLane[sourceLane]) {
      const cardIndex = newCardsByLane[sourceLane].findIndex(c => c.slug === slug);
      if (cardIndex !== -1) {
        movedCard = newCardsByLane[sourceLane][cardIndex];
        newCardsByLane[sourceLane] = newCardsByLane[sourceLane].filter(c => c.slug !== slug);
      }
    }

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

    if (!movedCard) {
      console.warn(`[wsHandleCardMoved] Card ${slug} not found in local state, scheduling debounced reload`);
      state._debouncedLoadCards();
      return;
    }

    const updatedCard = { ...movedCard, lane: targetLane };
    newCardsByLane[targetLane] = [updatedCard, ...(newCardsByLane[targetLane] || [])];
    set({ cardsByLane: newCardsByLane });

    if (state.activeCard?.slug === slug) {
      set((state) => ({
        activeCard: state.activeCard ? { ...state.activeCard, lane: targetLane } : null,
      }));
    }

    if (!state._isRecentLocalAction(`card:moved:${slug}`)) {
      state.addChangeIndicator({ type: 'card:moved', cardSlug: slug, lane: targetLane });
    }
  },

  wsHandleCardDeleted: (data: CardDeletedData) => {
    const { slug, lane } = data;
    const state = get();

    const newCardsByLane = { ...state.cardsByLane };
    if (newCardsByLane[lane]) {
      newCardsByLane[lane] = newCardsByLane[lane].filter(c => c.slug !== slug);
    }
    set({ cardsByLane: newCardsByLane });

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

    const actionKey = `lane:reordered:${lane}`;
    if (state._isRecentLocalAction(actionKey)) {
      console.log(`[wsHandleLaneReordered] ⚠️ IGNORING - self-echo detected for ${lane}`);
      return;
    }

    console.log(`[wsHandleLaneReordered] ✓ Not a self-echo, processing reorder...`);

    const currentCards = state.cardsByLane[lane] || [];
    console.log(`[wsHandleLaneReordered] Current cards in lane (${currentCards.length}):`, currentCards.map(c => c.filename));

    const cardMap = new Map(currentCards.map(card => [card.filename, card]));
    console.log(`[wsHandleLaneReordered] Card map keys:`, Array.from(cardMap.keys()));

    const reorderedCards = order
      .map(filename => {
        const card = cardMap.get(filename);
        if (!card) console.warn(`[wsHandleLaneReordered] ⚠️ Card not found for filename: ${filename}`);
        return card;
      })
      .filter((card): card is CardSummary => card !== undefined);

    console.log(`[wsHandleLaneReordered] Reordered ${reorderedCards.length} cards`);
    console.log(`[wsHandleLaneReordered] New card order:`, reorderedCards.map(c => c.filename));

    set((state) => ({
      cardsByLane: { ...state.cardsByLane, [lane]: reorderedCards },
    }));

    console.log(`[wsHandleLaneReordered] ✓ State updated successfully`);
    console.log(`[wsHandleLaneReordered] ================================`);
  },

  wsHandleTaskToggled: (data: TaskToggledData) => {
    const { cardSlug, taskIndex, checked: _checked, taskProgress } = data;
    const state = get();

    const actionKey = `task:toggled:${cardSlug}:${taskIndex}`;
    if (state._isRecentLocalAction(actionKey)) {
      console.log(`[wsHandleTaskToggled] Ignoring self-echo for ${cardSlug}:${taskIndex}`);
      return;
    }

    console.log(`[wsHandleTaskToggled] Task ${taskIndex} on ${cardSlug} toggled to ${_checked}`);

    const newCardsByLane = { ...state.cardsByLane };
    let cardFound = false;
    let cardLane: string | undefined;

    for (const [lane, cards] of Object.entries(newCardsByLane)) {
      const cardIndex = cards.findIndex(c => c.slug === cardSlug);
      if (cardIndex !== -1) {
        newCardsByLane[lane] = [...cards];
        newCardsByLane[lane][cardIndex] = { ...cards[cardIndex], taskProgress };
        cardFound = true;
        cardLane = lane;
        break;
      }
    }

    if (cardFound) {
      set({ cardsByLane: newCardsByLane });
      if (cardLane && !state._isRecentLocalAction(actionKey)) {
        state.addChangeIndicator({ type: 'task:toggled', cardSlug, lane: cardLane, taskIndex });
      }
    } else {
      console.warn(`[wsHandleTaskToggled] Card ${cardSlug} not found in cardsByLane`);
    }

    if (state.activeCard?.slug === cardSlug && !state._isRecentLocalAction(actionKey)) {
      console.log(`[wsHandleTaskToggled] Refreshing active card ${cardSlug}`);
      state.openCardDetail(cardSlug);
    }
  },

  wsHandleProjectUpdated: (data: ProjectUpdatedData) => {
    const { config } = data;
    const state = get();

    const projectIndex = state.projects.findIndex(p => p.slug === state.activeProjectSlug);
    if (projectIndex !== -1) {
      const updatedProjects = [...state.projects];
      updatedProjects[projectIndex] = { ...updatedProjects[projectIndex], ...config };
      set({ projects: updatedProjects });
    }
  },

  wsHandleProjectDeleted: (data: ProjectDeletedData) => {
    const { slug } = data;
    const state = get();

    console.log(`[wsHandleProjectDeleted] Project ${slug} was deleted`);

    const projects = state.projects.filter(p => p.slug !== slug);

    if (state.activeProjectSlug === slug) {
      set({
        projects,
        activeProjectSlug: null,
        cardsByLane: {},
        activeCard: null,
        isDetailPanelOpen: false,
      });
      state.loadProjects();
    } else {
      set({ projects });
    }
  },

  wsHandleFileAdded: (data: { file: ProjectFileEntry }) => {
    const { file } = data;
    const state = get();
    if (state._isRecentLocalAction(`file:added:${file.filename}`)) return;
    set((state) => {
      const exists = state.projectFiles.some(f => f.filename === file.filename);
      return {
        projectFiles: exists
          ? state.projectFiles.map(f => f.filename === file.filename ? file : f)
          : [file, ...state.projectFiles],
      };
    });
  },

  wsHandleFileDeleted: (data: { filename: string }) => {
    const { filename } = data;
    const state = get();
    if (state._isRecentLocalAction(`file:deleted:${filename}`)) return;
    set((state) => ({
      projectFiles: state.projectFiles.filter(f => f.filename !== filename),
    }));
  },

  wsHandleFileUpdated: (data: { file: ProjectFileEntry }) => {
    const { file } = data;
    const state = get();
    if (state._isRecentLocalAction(`file:updated:${file.filename}`)) return;
    set((state) => ({
      projectFiles: state.projectFiles.map(f => f.filename === file.filename ? file : f),
    }));
  },

  wsHandleFileAssociated: (data: { filename: string; cardSlug: string }) => {
    const { filename, cardSlug } = data;
    const state = get();
    if (state._isRecentLocalAction(`file:associated:${filename}:${cardSlug}`)) return;
    set((state) => ({
      projectFiles: state.projectFiles.map(f =>
        f.filename === filename && !f.cardSlugs.includes(cardSlug)
          ? { ...f, cardSlugs: [...f.cardSlugs, cardSlug] }
          : f
      ),
    }));
  },

  wsHandleFileDisassociated: (data: { filename: string; cardSlug: string }) => {
    const { filename, cardSlug } = data;
    const state = get();
    if (state._isRecentLocalAction(`file:disassociated:${filename}:${cardSlug}`)) return;
    set((state) => ({
      projectFiles: state.projectFiles.map(f =>
        f.filename === filename
          ? { ...f, cardSlugs: f.cardSlugs.filter(s => s !== cardSlug) }
          : f
      ),
    }));
  },

  wsHandleLinkAdded: (data: LinkAddedData) => {
    const { cardSlug, link } = data;
    const state = get();
    if (state._isRecentLocalAction(`link:added:${link.id}`)) return;
    if (state.activeCard?.slug === cardSlug) {
      set((s) => {
        if (!s.activeCard) return {};
        const existing = s.activeCard.frontmatter.links ?? [];
        const alreadyExists = existing.some((l: CardLink) => l.id === link.id);
        const links = alreadyExists
          ? existing.map((l: CardLink) => (l.id === link.id ? link : l))
          : [...existing, link];
        return {
          activeCard: { ...s.activeCard, frontmatter: { ...s.activeCard.frontmatter, links } },
        };
      });
    }
  },

  wsHandleLinkUpdated: (data: LinkUpdatedData) => {
    const { cardSlug, link } = data;
    const state = get();
    if (state._isRecentLocalAction(`link:updated:${link.id}`)) return;
    if (state.activeCard?.slug === cardSlug) {
      set((s) => {
        if (!s.activeCard) return {};
        const links = (s.activeCard.frontmatter.links ?? []).map((l: CardLink) =>
          l.id === link.id ? link : l
        );
        return {
          activeCard: { ...s.activeCard, frontmatter: { ...s.activeCard.frontmatter, links } },
        };
      });
    }
  },

  wsHandleLinkDeleted: (data: LinkDeletedData) => {
    const { cardSlug, linkId } = data;
    const state = get();
    if (state._isRecentLocalAction(`link:deleted:${linkId}`)) return;
    if (state.activeCard?.slug === cardSlug) {
      set((s) => {
        if (!s.activeCard) return {};
        const links = (s.activeCard.frontmatter.links ?? []).filter(
          (l: CardLink) => l.id !== linkId
        );
        return {
          activeCard: { ...s.activeCard, frontmatter: { ...s.activeCard.frontmatter, links } },
        };
      });
    }
  },
});
