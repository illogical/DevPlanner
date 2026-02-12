import { Elysia, t } from 'elysia';
import { CardService } from '../services/card.service';
import { FileService } from '../services/file.service';
import { WebSocketService } from '../services/websocket.service';
import { HistoryService } from '../services/history.service';
import { MarkdownService } from '../services/markdown.service';
import type {
  CardCreatedData,
  CardUpdatedData,
  CardMovedData,
  CardDeletedData,
  LaneReorderedData,
} from '../types';

export const cardRoutes = (workspacePath: string) => {
  const cardService = new CardService(workspacePath);
  const fileService = new FileService(workspacePath);
  const wsService = WebSocketService.getInstance();
  const historyService = HistoryService.getInstance();

  return new Elysia()
    .get('/api/projects/:projectSlug/cards', async ({ params, query }) => {
      const cards = await cardService.listCards(params.projectSlug, query.lane);
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

        return card;
      },
      {
        body: t.Object({
          title: t.String({ minLength: 1, maxLength: 200 }),
          lane: t.Optional(t.String()),
          priority: t.Optional(t.Union([t.Literal('low'), t.Literal('medium'), t.Literal('high')])),
          assignee: t.Optional(t.Union([t.Literal('user'), t.Literal('agent')])),
          tags: t.Optional(t.Array(t.String())),
          content: t.Optional(t.String()),
          status: t.Optional(
            t.Union([
              t.Literal('in-progress'),
              t.Literal('blocked'),
              t.Literal('review'),
              t.Literal('testing'),
            ])
          ),
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
        // Clean up file associations
        await fileService.removeCardFromAllFiles(params.projectSlug, params.cardSlug);

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

        // Record history event
        historyService.recordEvent({
          projectSlug: params.projectSlug,
          action: 'card:deleted',
          description: `Card "${card.frontmatter.title}" was permanently deleted`,
          metadata: {
            cardSlug: params.cardSlug,
            cardTitle: card.frontmatter.title,
            lane: sourceLane,
          },
        });

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

        // Record history event
        historyService.recordEvent({
          projectSlug: params.projectSlug,
          action: 'card:archived',
          description: `Card "${card.frontmatter.title}" moved to Archive`,
          metadata: {
            cardSlug: params.cardSlug,
            cardTitle: card.frontmatter.title,
            sourceLane,
            targetLane: '04-archive',
          },
        });

        return {
          slug: params.cardSlug,
          archived: true,
        };
      }
    })
    .patch(
      '/api/projects/:projectSlug/cards/:cardSlug/move',
      async ({ params, body }) => {
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
      async ({ params, body }) => {
        const card = await cardService.updateCard(params.projectSlug, params.cardSlug, body);

        // Broadcast card:updated event
        const eventData: CardUpdatedData = {
          card: {
            slug: card.slug,
            filename: card.filename,
            lane: card.lane,
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

        return card;
      },
      {
        body: t.Object({
          title: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
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
          content: t.Optional(t.String()),
        }),
      }
    );
};
