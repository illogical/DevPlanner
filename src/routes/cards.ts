import { Elysia, t } from 'elysia';
import { CardService } from '../services/card.service';
import { ProjectService } from '../services/project.service';
import { WebSocketService } from '../services/websocket.service';
import { HistoryService } from '../services/history.service';
import { MarkdownService } from '../services/markdown.service';
import { recordAndBroadcastHistory } from '../utils/history-helper';
import type {
  CardCreatedData,
  CardUpdatedData,
  CardMovedData,
  CardDeletedData,
  LaneReorderedData,
  PaletteSearchResult,
} from '../types';

/** Build a 120-char snippet around the first match of query in text */
function buildSnippet(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, start + 120);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
}

/** Simple score: full word match > substring match */
function scoreMatch(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (lower === q) return 100;
  if (lower.startsWith(q)) return 80;
  // Escape special regex chars; the \\$& replacement is intentional (inserts matched char)
  const wordBoundary = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (wordBoundary.test(text)) return 60;
  if (lower.includes(q)) return 40;
  return 0;
}

/** Search a single project and return palette results */
export async function searchProjectForPalette(
  projectSlug: string,
  query: string,
  cardService: CardService
): Promise<PaletteSearchResult[]> {
  const q = query.trim().toLowerCase();
  const results: PaletteSearchResult[] = [];

  const cards = await cardService.listCards(projectSlug);

  for (const card of cards) {
    const cardTitle = card.frontmatter.title;
    const cardId = card.cardId ?? undefined;
    const laneSlug = card.lane;

    // Card title match
    const titleScore = scoreMatch(cardTitle, query);
    if (titleScore > 0) {
      results.push({
        type: 'card',
        cardSlug: card.slug,
        cardTitle,
        cardId,
        laneSlug,
        projectSlug,
        primaryText: cardTitle,
        score: titleScore + 10, // boost
      });
    }

    // Card ID match (e.g. "MP-42")
    if (cardId && cardId.toLowerCase().includes(q)) {
      // Only add if not already added for title
      const already = results.find(r => r.type === 'card' && r.cardSlug === card.slug);
      if (!already) {
        results.push({
          type: 'card',
          cardSlug: card.slug,
          cardTitle,
          cardId,
          laneSlug,
          projectSlug,
          primaryText: cardTitle,
          score: 70,
        });
      }
    }

    // Tag match
    for (const tag of card.frontmatter.tags ?? []) {
      const s = scoreMatch(tag, query);
      if (s > 0) {
        results.push({
          type: 'tag',
          cardSlug: card.slug,
          cardTitle,
          cardId,
          laneSlug,
          projectSlug,
          primaryText: tag,
          score: s,
        });
      }
    }

    // Assignee match
    if (card.frontmatter.assignee) {
      const s = scoreMatch(card.frontmatter.assignee, query);
      if (s > 0) {
        results.push({
          type: 'assignee',
          cardSlug: card.slug,
          cardTitle,
          cardId,
          laneSlug,
          projectSlug,
          primaryText: card.frontmatter.assignee,
          score: s,
        });
      }
    }

    // For description, tasks, and links we need the full card
    let fullCard: Awaited<ReturnType<typeof cardService.getCard>> | null = null;
    const needFullCard =
      card.frontmatter.description ||
      card.taskProgress.total > 0 ||
      card.frontmatter.links?.length;

    if (needFullCard) {
      try {
        fullCard = await cardService.getCard(projectSlug, card.slug);
      } catch {
        fullCard = null;
      }
    }

    if (fullCard) {
      // Description match (search both frontmatter description and Markdown body)
      const descText = fullCard.frontmatter.description || fullCard.content;
      if (descText) {
        const s = scoreMatch(descText, query);
        if (s > 0) {
          results.push({
            type: 'description',
            cardSlug: card.slug,
            cardTitle,
            cardId,
            laneSlug,
            projectSlug,
            primaryText: cardTitle,
            snippet: buildSnippet(descText, query),
            score: s,
          });
        }
      }

      // Task matches
      for (const task of fullCard.tasks) {
        const s = scoreMatch(task.text, query);
        if (s > 0) {
          results.push({
            type: 'task',
            cardSlug: card.slug,
            cardTitle,
            cardId,
            laneSlug,
            projectSlug,
            taskIndex: task.index,
            primaryText: task.text,
            snippet: buildSnippet(task.text, query),
            score: s,
          });
        }
      }

      // Link matches
      const links = fullCard.frontmatter.links ?? [];
      for (const link of links) {
        // Link URL match
        const urlScore = scoreMatch(link.url, query);
        if (urlScore > 0) {
          results.push({
            type: 'link',
            cardSlug: card.slug,
            cardTitle,
            cardId,
            laneSlug,
            projectSlug,
            linkId: link.id,
            primaryText: link.url,
            score: urlScore,
          });
        }
        // Link label match
        const labelScore = scoreMatch(link.label, query);
        if (labelScore > 0) {
          results.push({
            type: 'link-label',
            cardSlug: card.slug,
            cardTitle,
            cardId,
            laneSlug,
            projectSlug,
            linkId: link.id,
            primaryText: link.label,
            score: labelScore,
          });
        }
      }
    }

  }

  return results;
}

export const cardRoutes = (workspacePath: string) => {
  const cardService = new CardService(workspacePath);
  const projectService = new ProjectService(workspacePath);
  const wsService = WebSocketService.getInstance();
  const historyService = HistoryService.getInstance();

  return new Elysia()
    .get('/api/projects/:projectSlug/cards', async ({ params, query }) => {
      const since = query.since || undefined;
      const parsedStaleDays =
        query.staleDays !== undefined ? parseInt(query.staleDays as string) : NaN;
      const staleDays = !isNaN(parsedStaleDays) && parsedStaleDays >= 0 ? parsedStaleDays : undefined;
      const cards = await cardService.listCards(params.projectSlug, query.lane, since, staleDays);
      return { cards };
    })
    .post(
      '/api/projects/:projectSlug/cards',
      async ({ params, body, set }) => {
        const card = await cardService.createCard(params.projectSlug, body);
        set.status = 201;

        // Broadcast card:created event
        const eventData: CardCreatedData = {
          card: {
            slug: card.slug,
            filename: card.filename,
            lane: card.lane,
            cardId: card.cardId,
            frontmatter: card.frontmatter,
            taskProgress: MarkdownService.taskProgress(card.tasks),
          },
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'card:created',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Record history
        const project = await projectService.getProject(params.projectSlug);
        const laneName = project.lanes[card.lane]?.displayName || card.lane;
        recordAndBroadcastHistory(
          params.projectSlug,
          'card:created',
          `Card "${card.frontmatter.title}" created in ${laneName}`,
          {
            cardSlug: card.slug,
            cardTitle: card.frontmatter.title,
            lane: card.lane,
          }
        );

        return card;
      },
      {
        body: t.Object({
          title: t.String({ minLength: 1, maxLength: 200 }),
          description: t.Optional(t.String({ maxLength: 500 })),
          lane: t.Optional(t.String()),
          priority: t.Optional(t.Union([t.Literal('low'), t.Literal('medium'), t.Literal('high')])),
          assignee: t.Optional(t.Union([t.Literal('user'), t.Literal('agent')])),
          tags: t.Optional(t.Array(t.String())),
          status: t.Optional(
            t.Union([
              t.Literal('in-progress'),
              t.Literal('blocked'),
              t.Literal('review'),
              t.Literal('testing'),
            ])
          ),
          blockedReason: t.Optional(t.String()),
        }),
      }
    )
    .get('/api/projects/:projectSlug/tags', async ({ params }) => {
      const cards = await cardService.listCards(params.projectSlug);
      const tagSet = new Set<string>();
      for (const card of cards) {
        if (card.frontmatter.tags) {
          for (const tag of card.frontmatter.tags) {
            tagSet.add(tag);
          }
        }
      }
      return { tags: Array.from(tagSet).sort() };
    })
    .get('/api/projects/:projectSlug/cards/search', async ({ params, query }) => {
      const searchQuery = query.q?.trim();
      if (!searchQuery) {
        return { results: [], query: '' };
      }

      const queryLower = searchQuery.toLowerCase();
      const cards = await cardService.listCards(params.projectSlug);
      const results: Array<{
        slug: string;
        lane: string;
        matchedFields: string[];
        matchedTaskIndices: number[];
      }> = [];

      for (const cardSummary of cards) {
        const matchedFields: string[] = [];
        const matchedTaskIndices: number[] = [];

        // Search title
        if (cardSummary.frontmatter.title.toLowerCase().includes(queryLower)) {
          matchedFields.push('title');
        }

        // Search tasks (requires full card load)
        if (cardSummary.taskProgress.total > 0) {
          const fullCard = await cardService.getCard(params.projectSlug, cardSummary.slug);
          for (const task of fullCard.tasks) {
            if (task.text.toLowerCase().includes(queryLower)) {
              if (!matchedFields.includes('tasks')) {
                matchedFields.push('tasks');
              }
              matchedTaskIndices.push(task.index);
            }
          }
        }

        if (matchedFields.length > 0) {
          results.push({
            slug: cardSummary.slug,
            lane: cardSummary.lane,
            matchedFields,
            matchedTaskIndices,
          });
        }
      }

      return { results, query: searchQuery };
    })
    .get('/api/projects/:projectSlug/search', async ({ params, query }) => {
      const searchQuery = query.q?.trim();
      if (!searchQuery || searchQuery.length < 2) {
        return { results: [], query: searchQuery ?? '' };
      }
      const results = await searchProjectForPalette(
        params.projectSlug,
        searchQuery,
        cardService
      );
      return { results, query: searchQuery };
    })
    .get('/api/projects/:projectSlug/cards/:cardSlug', async ({ params }) => {
      const card = await cardService.getCard(params.projectSlug, params.cardSlug);
      return card;
    })
    .delete('/api/projects/:projectSlug/cards/:cardSlug', async ({ params, query }) => {
      // Get card info before deletion
      const card = await cardService.getCard(params.projectSlug, params.cardSlug);
      const sourceLane = card.lane;

      const hardDelete = query.hard === 'true';

      if (hardDelete) {
        // Permanently delete the card
        await cardService.deleteCard(params.projectSlug, params.cardSlug);

        // Broadcast card:deleted event
        const eventData: CardDeletedData = {
          slug: params.cardSlug,
          lane: sourceLane,
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'card:deleted',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Record history event (now broadcasts via helper)
        recordAndBroadcastHistory(
          params.projectSlug,
          'card:deleted',
          `Card "${card.frontmatter.title}" was permanently deleted`,
          {
            cardSlug: params.cardSlug,
            cardTitle: card.frontmatter.title,
            lane: sourceLane,
          }
        );

        return {
          slug: params.cardSlug,
          deleted: true,
        };
      } else {
        // Archive the card (move to archive lane)
        await cardService.archiveCard(params.projectSlug, params.cardSlug);

        // Broadcast card:moved event (archiving is a move to archive lane)
        const eventData: CardMovedData = {
          slug: params.cardSlug,
          sourceLane,
          targetLane: '04-archive',
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'card:moved',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Record history event (now broadcasts via helper)
        recordAndBroadcastHistory(
          params.projectSlug,
          'card:archived',
          `Card "${card.frontmatter.title}" moved to Archive`,
          {
            cardSlug: params.cardSlug,
            cardTitle: card.frontmatter.title,
            sourceLane,
            targetLane: '04-archive',
          }
        );

        return {
          slug: params.cardSlug,
          archived: true,
        };
      }
    })
    .patch(
      '/api/projects/:projectSlug/cards/:cardSlug/move',
      async ({ params, body, request }) => {
        // Optional optimistic locking via If-Match header
        const ifMatch = request.headers.get('if-match');
        if (ifMatch) {
          const expectedVersion = parseInt(ifMatch, 10);
          if (!isNaN(expectedVersion)) {
            const currentCard = await cardService.getCard(params.projectSlug, params.cardSlug);
            const currentVersion = currentCard.frontmatter.version ?? 1;
            if (currentVersion !== expectedVersion) {
              return new Response(
                JSON.stringify({
                  error: 'VERSION_CONFLICT',
                  message: `Card has been modified since you last read it (your version: ${expectedVersion}, current: ${currentVersion}).`,
                  currentVersion,
                  yourVersion: expectedVersion,
                  currentState: currentCard,
                }),
                { status: 409, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
        }

        // Get source lane before moving
        const cardBefore = await cardService.getCard(params.projectSlug, params.cardSlug);
        const sourceLane = cardBefore.lane;

        const card = await cardService.moveCard(
          params.projectSlug,
          params.cardSlug,
          body.lane,
          body.position
        );

        // Broadcast card:moved event
        const eventData: CardMovedData = {
          slug: params.cardSlug,
          sourceLane,
          targetLane: body.lane,
        };
        if (body.position !== undefined) {
          eventData.position = body.position;
        }
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'card:moved',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Record history
        const project = await projectService.getProject(params.projectSlug);
        const targetLaneName = project.lanes[body.lane]?.displayName || body.lane;
        recordAndBroadcastHistory(
          params.projectSlug,
          'card:moved',
          `Card "${card.frontmatter.title}" moved to ${targetLaneName}`,
          {
            cardSlug: params.cardSlug,
            cardTitle: card.frontmatter.title,
            sourceLane,
            targetLane: body.lane,
          }
        );

        return card;
      },
      {
        body: t.Object({
          lane: t.String(),
          position: t.Optional(t.Number()),
        }),
      }
    )
    .patch(
      '/api/projects/:projectSlug/lanes/:laneSlug/order',
      async ({ params, body }) => {
        await cardService.reorderCards(params.projectSlug, params.laneSlug, body.order);

        // Broadcast lane:reordered event
        const eventData: LaneReorderedData = {
          lane: params.laneSlug,
          order: body.order,
        };
        
        console.log(`[CardRoutes] Broadcasting lane:reordered event:`, eventData);
        
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'lane:reordered',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        return {
          lane: params.laneSlug,
          order: body.order,
        };
      },
      {
        body: t.Object({
          order: t.Array(t.String()),
        }),
      }
    )
    .patch(
      '/api/projects/:projectSlug/cards/:cardSlug',
      async ({ params, body, request }) => {
        // Optional optimistic locking via If-Match header
        const ifMatch = request.headers.get('if-match');
        if (ifMatch) {
          const expectedVersion = parseInt(ifMatch, 10);
          if (!isNaN(expectedVersion)) {
            const currentCard = await cardService.getCard(params.projectSlug, params.cardSlug);
            const currentVersion = currentCard.frontmatter.version ?? 1;
            if (currentVersion !== expectedVersion) {
              return new Response(
                JSON.stringify({
                  error: 'VERSION_CONFLICT',
                  message: `Card has been modified since you last read it (your version: ${expectedVersion}, current: ${currentVersion}).`,
                  currentVersion,
                  yourVersion: expectedVersion,
                  currentState: currentCard,
                }),
                { status: 409, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
        }

        const card = await cardService.updateCard(params.projectSlug, params.cardSlug, body);

        // Broadcast card:updated event
        const eventData: CardUpdatedData = {
          card: {
            slug: card.slug,
            filename: card.filename,
            lane: card.lane,
            cardId: card.cardId,
            frontmatter: card.frontmatter,
            taskProgress: MarkdownService.taskProgress(card.tasks),
          },
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'card:updated',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Record history
        const changedFields = Object.keys(body).filter(k => body[k as keyof typeof body] !== undefined);
        recordAndBroadcastHistory(
          params.projectSlug,
          'card:updated',
          `Card "${card.frontmatter.title}" updated (${changedFields.join(', ')})`,
          {
            cardSlug: card.slug,
            cardTitle: card.frontmatter.title,
            lane: card.lane,
            changedFields,
          }
        );

        return card;
      },
      {
        body: t.Object({
          title: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
          description: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
          status: t.Optional(
            t.Union([
              t.Literal('in-progress'),
              t.Literal('blocked'),
              t.Literal('review'),
              t.Literal('testing'),
              t.Null(),
            ])
          ),
          priority: t.Optional(
            t.Union([t.Literal('low'), t.Literal('medium'), t.Literal('high'), t.Null()])
          ),
          assignee: t.Optional(t.Union([t.Literal('user'), t.Literal('agent'), t.Null()])),
          tags: t.Optional(t.Union([t.Array(t.String()), t.Null()])),
          blockedReason: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      }
    );
};
