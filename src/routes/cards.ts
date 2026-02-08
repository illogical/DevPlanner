import { Elysia, t } from 'elysia';
import { CardService } from '../services/card.service';
import { WebSocketService } from '../services/websocket.service';
import { MarkdownService } from '../services/markdown.service';
import type {
  CardCreatedData,
  CardUpdatedData,
  CardMovedData,
  LaneReorderedData,
} from '../types';

export const cardRoutes = (workspacePath: string) => {
  const cardService = new CardService(workspacePath);
  const wsService = WebSocketService.getInstance();

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
    .get('/api/projects/:projectSlug/cards/:cardSlug', async ({ params }) => {
      const card = await cardService.getCard(params.projectSlug, params.cardSlug);
      return card;
    })
    .delete('/api/projects/:projectSlug/cards/:cardSlug', async ({ params }) => {
      // Get card info before archiving
      const card = await cardService.getCard(params.projectSlug, params.cardSlug);
      const sourceLane = card.lane;

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

      return {
        slug: params.cardSlug,
        archived: true,
      };
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
