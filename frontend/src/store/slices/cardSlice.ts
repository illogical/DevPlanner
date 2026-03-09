import type { StateCreator } from 'zustand';
import { cardsApi, tasksApi, linksApi, artifactsApi } from '../../api/client';
import type { CardLink, CreateLinkInput, UpdateLinkInput } from '../../types';
import type { DevPlannerStore, CardSlice } from '../types';

export const createCardSlice: StateCreator<
  DevPlannerStore,
  [],
  [],
  CardSlice
> = (set, get) => ({
  activeCard: null,
  isDetailPanelOpen: false,
  isLoadingCardDetail: false,

  openCardDetail: async (cardSlug, skipHistory = false) => {
    const { activeProjectSlug, activeCard } = get();
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

  closeCardDetail: (_skipHistory = false) => {
    set({ isDetailPanelOpen: false, activeCard: null });
  },

  toggleTask: async (cardSlug, taskIndex, checked) => {
    const { activeProjectSlug, activeCard } = get();
    if (!activeProjectSlug) return;

    get()._recordLocalAction(`task:toggled:${cardSlug}:${taskIndex}`);

    const result = await tasksApi.toggle(activeProjectSlug, cardSlug, taskIndex, checked);

    if (activeCard && activeCard.slug === cardSlug) {
      set((state) => ({
        activeCard: state.activeCard
          ? {
              ...state.activeCard,
              frontmatter: {
                ...state.activeCard.frontmatter,
                updated: new Date().toISOString(),
              },
              tasks: state.activeCard.tasks.map((t, i) =>
                i === taskIndex ? { ...t, checked } : t
              ),
            }
          : null,
      }));
    }

    set((state) => {
      const newCardsByLane = { ...state.cardsByLane };
      for (const [lane, cards] of Object.entries(newCardsByLane)) {
        const cardIndex = cards.findIndex((c) => c.slug === cardSlug);
        if (cardIndex !== -1) {
          newCardsByLane[lane] = cards.map((c, i) =>
            i === cardIndex
              ? {
                  ...c,
                  frontmatter: { ...c.frontmatter, updated: new Date().toISOString() },
                  taskProgress: result.taskProgress,
                }
              : c
          );
          break;
        }
      }
      return { cardsByLane: newCardsByLane };
    });

    get().addChangeIndicator({ type: 'task:toggled', cardSlug, taskIndex });
  },

  addTask: async (cardSlug, text) => {
    const { activeProjectSlug, activeCard } = get();
    if (!activeProjectSlug) return;

    get()._recordLocalAction(`card:updated:${cardSlug}`);
    const result = await tasksApi.add(activeProjectSlug, cardSlug, text);

    if (activeCard && activeCard.slug === cardSlug) {
      set((state) => {
        if (!state.activeCard) return { activeCard: null };
        const updatedTasks = [...state.activeCard.tasks, result];
        let updatedContent = state.activeCard.content;
        const newTaskLine = `- [ ] ${text}`;
        if (!updatedContent) {
          updatedContent = `## Tasks\n${newTaskLine}`;
        } else {
          const trimmed = updatedContent.trimEnd();
          if (/^## Tasks$/m.test(updatedContent)) {
            updatedContent = `${trimmed}\n${newTaskLine}`;
          } else {
            updatedContent = `${trimmed}\n\n## Tasks\n${newTaskLine}`;
          }
        }
        return {
          activeCard: {
            ...state.activeCard,
            frontmatter: {
              ...state.activeCard.frontmatter,
              updated: new Date().toISOString(),
            },
            tasks: updatedTasks,
            content: updatedContent,
          },
        };
      });
    }

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

  updateTaskText: async (cardSlug, taskIndex, text) => {
    const { activeProjectSlug, activeCard } = get();
    if (!activeProjectSlug) return;

    get()._recordLocalAction(`card:updated:${cardSlug}`);
    const result = await tasksApi.updateText(activeProjectSlug, cardSlug, taskIndex, text);

    if (activeCard && activeCard.slug === cardSlug) {
      set((state) => ({
        activeCard: state.activeCard
          ? {
              ...state.activeCard,
              tasks: state.activeCard.tasks.map((t) =>
                t.index === taskIndex ? { ...t, text: result.text } : t
              ),
            }
          : null,
      }));

      // Re-sync content
      set((state) => {
        if (!state.activeCard) return {};
        const updatedContent = state.activeCard.content
          .split('\n')
          .reduce<{ lines: string[]; taskIdx: number }>(
            (acc, line) => {
              const m = line.match(/^(\s*-\s+\[)([ xX])(\]\s+)(.+)$/);
              if (m) {
                acc.lines.push(acc.taskIdx === taskIndex
                  ? `${m[1]}${m[2]}${m[3]}${text}`
                  : line);
                acc.taskIdx++;
              } else {
                acc.lines.push(line);
              }
              return acc;
            },
            { lines: [], taskIdx: 0 }
          ).lines.join('\n');
        return { activeCard: { ...state.activeCard, content: updatedContent } };
      });
    }

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

  deleteTask: async (cardSlug, taskIndex) => {
    const { activeProjectSlug, activeCard } = get();
    if (!activeProjectSlug) return;

    get()._recordLocalAction(`card:updated:${cardSlug}`);
    const result = await tasksApi.delete(activeProjectSlug, cardSlug, taskIndex);

    if (activeCard && activeCard.slug === cardSlug) {
      set((state) => {
        if (!state.activeCard) return {};
        let taskCounter = 0;
        const updatedContent = state.activeCard.content
          .split('\n')
          .filter((line) => {
            const isTask = /^\s*-\s+\[[ xX]\]\s+.+$/.test(line);
            if (isTask) {
              const shouldRemove = taskCounter === taskIndex;
              taskCounter++;
              return !shouldRemove;
            }
            return true;
          })
          .join('\n');
        return {
          activeCard: { ...state.activeCard, tasks: result.tasks, content: updatedContent },
        };
      });
    }

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

  updateCard: async (cardSlug, updates) => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    get()._recordLocalAction(`card:updated:${cardSlug}`);
    const updatedCard = await cardsApi.update(activeProjectSlug, cardSlug, updates);

    if (get().activeCard?.slug === cardSlug) {
      set({ activeCard: updatedCard });
    }

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

    get().addChangeIndicator({ type: 'card:updated', cardSlug });

    if (updates.tags !== undefined) {
      get().loadProjectTags();
    }
  },

  addLink: async (cardSlug, input: CreateLinkInput) => {
    const { activeProjectSlug, activeCard } = get();
    if (!activeProjectSlug) return;

    const { link } = await linksApi.add(activeProjectSlug, cardSlug, input);
    get()._recordLocalAction(`link:added:${link.id}`);

    if (activeCard?.slug === cardSlug) {
      set((state) => {
        if (!state.activeCard) return {};
        const links = [...(state.activeCard.frontmatter.links ?? []), link];
        return {
          activeCard: {
            ...state.activeCard,
            frontmatter: { ...state.activeCard.frontmatter, links },
          },
        };
      });
    }
  },

  updateLink: async (cardSlug, linkId, input: UpdateLinkInput) => {
    const { activeProjectSlug, activeCard } = get();
    if (!activeProjectSlug) return;

    const { link } = await linksApi.update(activeProjectSlug, cardSlug, linkId, input);
    get()._recordLocalAction(`link:updated:${linkId}`);

    if (activeCard?.slug === cardSlug) {
      set((state) => {
        if (!state.activeCard) return {};
        const links = (state.activeCard.frontmatter.links ?? []).map((l: CardLink) =>
          l.id === linkId ? link : l
        );
        return {
          activeCard: {
            ...state.activeCard,
            frontmatter: { ...state.activeCard.frontmatter, links },
          },
        };
      });
    }
  },

  deleteLink: async (cardSlug, linkId) => {
    const { activeProjectSlug, activeCard } = get();
    if (!activeProjectSlug) return;

    await linksApi.delete(activeProjectSlug, cardSlug, linkId);
    get()._recordLocalAction(`link:deleted:${linkId}`);

    if (activeCard?.slug === cardSlug) {
      set((state) => {
        if (!state.activeCard) return {};
        const links = (state.activeCard.frontmatter.links ?? []).filter(
          (l: CardLink) => l.id !== linkId
        );
        return {
          activeCard: {
            ...state.activeCard,
            frontmatter: { ...state.activeCard.frontmatter, links },
          },
        };
      });
    }
  },

  createVaultArtifact: async (cardSlug, file, label, kind) => {
    const { activeProjectSlug, activeCard } = get();
    if (!activeProjectSlug) return;

    const content = await file.text();
    const { link } = await artifactsApi.create(activeProjectSlug, cardSlug, { content, label, kind });
    get()._recordLocalAction(`link:added:${link.id}`);

    if (activeCard?.slug === cardSlug) {
      set((state) => {
        if (!state.activeCard) return {};
        const links = [...(state.activeCard.frontmatter.links ?? []), link];
        return {
          activeCard: {
            ...state.activeCard,
            frontmatter: { ...state.activeCard.frontmatter, links },
          },
        };
      });
    }
  },
});
