import { Elysia, t } from 'elysia';
import { LinkService } from '../services/link.service';
import { CardService } from '../services/card.service';
import { WebSocketService } from '../services/websocket.service';
import { recordAndBroadcastHistory } from '../utils/history-helper';
import type { LinkAddedData, LinkUpdatedData, LinkDeletedData } from '../types';

const KIND_LITERALS = t.Union([
  t.Literal('doc'),
  t.Literal('spec'),
  t.Literal('ticket'),
  t.Literal('repo'),
  t.Literal('reference'),
  t.Literal('other'),
]);

function toHttpStatus(error: string): number {
  switch (error) {
    case 'INVALID_URL':
    case 'INVALID_LABEL':
      return 400;
    case 'DUPLICATE_LINK':
      return 409;
    case 'LINK_NOT_FOUND':
      return 404;
    default:
      return 500;
  }
}

export const linkRoutes = (workspacePath: string) => {
  const linkService = new LinkService(workspacePath);
  const cardService = new CardService(workspacePath);
  const wsService = WebSocketService.getInstance();

  return new Elysia()
    .post(
      '/api/projects/:projectSlug/cards/:cardSlug/links',
      async ({ params, body, set }) => {
        try {
          const link = await linkService.addLink(params.projectSlug, params.cardSlug, {
            label: body.label,
            url: body.url,
            kind: body.kind,
          });

          set.status = 201;

          // Broadcast fine-grained WS event
          const eventData: LinkAddedData = { cardSlug: params.cardSlug, link };
          wsService.broadcast(params.projectSlug, {
            type: 'event',
            event: {
              type: 'link:added',
              projectSlug: params.projectSlug,
              timestamp: new Date().toISOString(),
              data: eventData,
            },
          });

          // Record history
          const card = await cardService.getCard(params.projectSlug, params.cardSlug);
          recordAndBroadcastHistory(
            params.projectSlug,
            'link:added',
            `Link added to "${card.frontmatter.title}": ${link.label}`,
            {
              cardSlug: params.cardSlug,
              cardTitle: card.frontmatter.title,
              lane: card.lane,
              linkId: link.id,
              linkLabel: link.label,
            }
          );

          return { link };
        } catch (err: unknown) {
          const e = err as { error?: string; message?: string; existingLink?: unknown };
          if (e?.error) {
            set.status = toHttpStatus(e.error);
            const body: Record<string, unknown> = { error: e.error, message: e.message ?? e.error };
            if (e.existingLink !== undefined) body.existingLink = e.existingLink;
            return body;
          }
          throw err;
        }
      },
      {
        body: t.Object({
          label: t.String({ minLength: 1, maxLength: 200 }),
          url: t.String({ minLength: 1 }),
          kind: t.Optional(KIND_LITERALS),
        }),
      }
    )
    .patch(
      '/api/projects/:projectSlug/cards/:cardSlug/links/:linkId',
      async ({ params, body, set }) => {
        try {
          const link = await linkService.updateLink(
            params.projectSlug,
            params.cardSlug,
            params.linkId,
            {
              label: body.label,
              url: body.url,
              kind: body.kind,
            }
          );

          // Broadcast fine-grained WS event
          const eventData: LinkUpdatedData = { cardSlug: params.cardSlug, link };
          wsService.broadcast(params.projectSlug, {
            type: 'event',
            event: {
              type: 'link:updated',
              projectSlug: params.projectSlug,
              timestamp: new Date().toISOString(),
              data: eventData,
            },
          });

          // Record history
          const card = await cardService.getCard(params.projectSlug, params.cardSlug);
          recordAndBroadcastHistory(
            params.projectSlug,
            'link:updated',
            `Link updated in "${card.frontmatter.title}": ${link.label}`,
            {
              cardSlug: params.cardSlug,
              cardTitle: card.frontmatter.title,
              lane: card.lane,
              linkId: link.id,
              linkLabel: link.label,
            }
          );

          return { link };
        } catch (err: unknown) {
          const e = err as { error?: string; message?: string };
          if (e?.error) {
            set.status = toHttpStatus(e.error);
            return { error: e.error, message: e.message ?? e.error };
          }
          throw err;
        }
      },
      {
        body: t.Object({
          label: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
          url: t.Optional(t.String({ minLength: 1 })),
          kind: t.Optional(KIND_LITERALS),
        }),
      }
    )
    .delete(
      '/api/projects/:projectSlug/cards/:cardSlug/links/:linkId',
      async ({ params, set }) => {
        try {
          await linkService.deleteLink(params.projectSlug, params.cardSlug, params.linkId);

          // Broadcast fine-grained WS event
          const eventData: LinkDeletedData = {
            cardSlug: params.cardSlug,
            linkId: params.linkId,
          };
          wsService.broadcast(params.projectSlug, {
            type: 'event',
            event: {
              type: 'link:deleted',
              projectSlug: params.projectSlug,
              timestamp: new Date().toISOString(),
              data: eventData,
            },
          });

          // Record history
          const card = await cardService.getCard(params.projectSlug, params.cardSlug);
          recordAndBroadcastHistory(
            params.projectSlug,
            'link:deleted',
            `Link deleted from "${card.frontmatter.title}"`,
            {
              cardSlug: params.cardSlug,
              cardTitle: card.frontmatter.title,
              lane: card.lane,
              linkId: params.linkId,
            }
          );

          return { success: true };
        } catch (err: unknown) {
          const e = err as { error?: string; message?: string };
          if (e?.error) {
            set.status = toHttpStatus(e.error);
            return { error: e.error, message: e.message ?? e.error };
          }
          throw err;
        }
      }
    );
};
