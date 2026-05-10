import { Elysia, t } from 'elysia';
import { VaultService } from '../services/vault.service';
import { CardService } from '../services/card.service';
import { LinkService } from '../services/link.service';
import { ProjectService } from '../services/project.service';
import { WebSocketService } from '../services/websocket.service';
import { ConfigService } from '../services/config.service';
import { CardArtifactService } from '../services/card-artifact.service';
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
    case 'INVALID_INPUT':
    case 'AMBIGUOUS_ARTIFACT_REF':
    case 'UNSUPPORTED_ARTIFACT_SOURCE':
      return 400;
    case 'ARTIFACT_NOT_FOUND':
      return 404;
    case 'DUPLICATE_LINK':
    case 'ARTIFACT_CONFLICT':
      return 409;
    default:
      return 500;
  }
}

export const artifactRoutes = (workspacePath: string) => {
  const cardService = new CardService(workspacePath);
  const wsService = WebSocketService.getInstance();

  function makeArtifactService(config: ConfigService): CardArtifactService | null {
    const { artifactBaseUrl, artifactBasePath, fileBrowserBasePath } = config;
    if (!artifactBaseUrl || !artifactBasePath) return null;
    const vaultService = new VaultService(workspacePath, artifactBasePath, artifactBaseUrl, fileBrowserBasePath);
    const linkService = new LinkService(workspacePath);
    const projectService = new ProjectService(workspacePath);
    return new CardArtifactService(vaultService, linkService, cardService, projectService, artifactBaseUrl);
  }

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

        const vaultService = new VaultService(workspacePath, artifactBasePath, artifactBaseUrl, config.fileBrowserBasePath);

        try {
          const { link, filePath } = await vaultService.createArtifact(
            params.projectSlug,
            card.slug,
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
    )
    .get(
      '/api/projects/:projectSlug/cards/:cardRef/artifacts/:artifactRef',
      async ({ params, set }) => {
        const config = ConfigService.getInstance();
        const svc = makeArtifactService(config);
        if (!svc) {
          set.status = 400;
          return {
            error: 'ARTIFACT_NOT_CONFIGURED',
            message: 'Set ARTIFACT_BASE_URL and ARTIFACT_BASE_PATH in .env to enable artifact resolution.',
          };
        }

        try {
          const resolved = await svc.resolveCardArtifact(
            {
              projectSlug: params.projectSlug,
              cardSlug: params.cardRef,
              artifactRef: params.artifactRef,
            },
            true
          );

          return {
            cardId: resolved.cardId,
            cardSlug: resolved.cardSlug,
            artifact: {
              id: resolved.link.id,
              label: resolved.link.label,
              kind: resolved.link.kind,
              url: resolved.link.url,
              path: resolved.relativePath,
              hash: resolved.hash,
              sizeBytes: resolved.sizeBytes,
              lineCount: resolved.lineCount,
              content: resolved.content,
              createdAt: resolved.link.createdAt,
              updatedAt: resolved.link.updatedAt,
            },
          };
        } catch (err: any) {
          if (err?.error) {
            set.status = toHttpStatus(err.error);
            return err;
          }
          throw err;
        }
      },
      {
        detail: {
          tags: ['Artifacts'],
          summary: 'Read a card artifact',
          description: [
            'Reads a card artifact by project slug, card slug or card ID, and artifact reference.',
            'artifactRef is matched by: link ID → vault path → URL → unique label.',
            'Returns the artifact content along with metadata.',
          ].join('\n'),
        },
      }
    )
    .patch(
      '/api/projects/:projectSlug/cards/:cardRef/artifacts/:artifactRef',
      async ({ params, body, set }) => {
        const config = ConfigService.getInstance();
        const svc = makeArtifactService(config);
        if (!svc) {
          set.status = 400;
          return {
            error: 'ARTIFACT_NOT_CONFIGURED',
            message: 'Set ARTIFACT_BASE_URL and ARTIFACT_BASE_PATH in .env to enable artifact updates.',
          };
        }

        if (!body.content && !body.label && !body.kind) {
          set.status = 400;
          return {
            error: 'INVALID_INPUT',
            message: 'Provide at least one of: content, label, kind.',
          };
        }

        try {
          // First resolve the artifact (metadata only)
          const resolved = await svc.resolveCardArtifact(
            {
              projectSlug: params.projectSlug,
              cardSlug: params.cardRef,
              artifactRef: params.artifactRef,
            },
            false
          );

          // Then apply the update
          const result = await svc.updateCardArtifact({
            projectSlug: resolved.projectSlug,
            cardSlug: resolved.cardSlug,
            cardId: resolved.cardId,
            link: resolved.link,
            relativePath: resolved.relativePath,
            content: body.content,
            label: body.label,
            kind: body.kind,
            expectedHash: body.expectedHash,
          });

          return {
            ok: true,
            cardId: result.cardId,
            cardSlug: result.cardSlug,
            artifact: {
              id: result.link.id,
              label: result.link.label,
              kind: result.link.kind,
              url: result.link.url,
              path: result.relativePath,
              hash: result.hash,
              updatedAt: result.updatedAt,
            },
          };
        } catch (err: any) {
          if (err?.error) {
            set.status = toHttpStatus(err.error);
            return err;
          }
          throw err;
        }
      },
      {
        detail: {
          tags: ['Artifacts'],
          summary: 'Update a card artifact',
          description: [
            'Updates a card artifact content and/or link metadata (label, kind).',
            'Provide expectedHash (sha256:...) for optimistic concurrency control.',
            'The viewer URL is preserved — only the backing file content changes.',
          ].join('\n'),
        },
        body: t.Object({
          content: t.Optional(t.String({ description: 'New markdown content for the artifact file.' })),
          label: t.Optional(t.String({ minLength: 1, description: 'New display label for the link.' })),
          kind: t.Optional(KIND_LITERALS),
          expectedHash: t.Optional(t.String({ description: 'Current sha256:... hash for conflict detection.' })),
        }),
      }
    );
};
