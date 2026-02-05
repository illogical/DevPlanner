import { Elysia, t } from 'elysia';
import { CardService } from '../services/card.service';

export const cardRoutes = (workspacePath: string) => {
  const cardService = new CardService(workspacePath);

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
      await cardService.archiveCard(params.projectSlug, params.cardSlug);
      return {
        slug: params.cardSlug,
        archived: true,
      };
    })
    .patch(
      '/api/projects/:projectSlug/cards/:cardSlug/move',
      async ({ params, body }) => {
        const card = await cardService.moveCard(
          params.projectSlug,
          params.cardSlug,
          body.lane,
          body.position
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
    );
};
