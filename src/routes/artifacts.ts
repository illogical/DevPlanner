import { Elysia, t } from 'elysia';
import { VaultService } from '../services/vault.service';
import { CardService } from '../services/card.service';
import { WebSocketService } from '../services/websocket.service';
import { ConfigService } from '../services/config.service';
import { recordAndBroadcastHistory } from '../utils/history-helper';
import type { LinkAddedData } from '../types';

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
    case 'ARTIFACT_NOT_CONFIGURED':
    case 'INVALID_LABEL':
      return 400;
    case 'DUPLICATE_LINK':
      return 409;
    default:
      return 500;
  }
}

export const artifactRoutes = (workspacePath: string) => {
  const cardService = new CardService(workspacePath);
  const wsService = WebSocketService.getInstance();

  return new Elysia()
    .post(
      '/api/projects/:projectSlug/cards/:cardSlug/artifacts',
      async ({ params, body, set }) => {
        const config = ConfigService.getInstance();
        const { artifactBaseUrl, artifactBasePath } = config;
        if (!artifactBaseUrl || !artifactBasePath) {
          set.status = 400;
          return {
            error: 'ARTIFACT_NOT_CONFIGURED',
            message: 'Set ARTIFACT_BASE_URL and ARTIFACT_BASE_PATH in .env to enable vault artifact creation.',
          };
        }

        // Verify card exists
        let card;
        try {
          card = await cardService.getCard(params.projectSlug, params.cardSlug);
        } catch {
          set.status = 404;
          return { error: 'not_found', message: `Card not found: ${params.cardSlug}` };
        }

        const vaultService = new VaultService(workspacePath, artifactBasePath, artifactBaseUrl);

        try {
          const { link, filePath } = await vaultService.createArtifact(
            params.projectSlug,
            params.cardSlug,
            body.label,
            body.kind ?? 'doc',
            body.content
          );

          // Broadcast link:added WebSocket event
          const eventData: LinkAddedData = {
            cardSlug: params.cardSlug,
            link,
          };
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
          recordAndBroadcastHistory(
            params.projectSlug,
            'link:added',
            `Vault artifact "${body.label}" attached to card "${card.frontmatter.title}"`,
            {
              cardSlug: params.cardSlug,
              cardTitle: card.frontmatter.title,
              linkId: link.id,
              label: link.label,
            }
          );

          set.status = 201;
          return { link, filePath };
        } catch (err: any) {
          if (err?.error) {
            set.status = toHttpStatus(err.error);
            return err;
          }
          throw err;
        }
      },
      {
        detail: { tags: ['Artifacts'], summary: 'Create a vault artifact', description: 'Creates a new vault artifact file and attaches it as a link to the card.' },
        body: t.Object({
          label: t.String({ minLength: 1 }),
          content: t.String({ minLength: 1 }),
          kind: t.Optional(KIND_LITERALS),
        }),
      }
    );
};
