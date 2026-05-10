/**
 * POST /api/card-artifacts/resolve
 *
 * Cross-card artifact resolution endpoint. Accepts any combination of identifiers
 * (url, cardId, projectSlug+cardSlug) and an optional artifactRef, then returns the
 * fully resolved artifact metadata (and optionally its content).
 *
 * This is distinct from the per-project artifact routes because it does not require
 * the caller to know which project/card a URL belongs to.
 */

import { Elysia, t } from 'elysia';
import { CardArtifactService } from '../services/card-artifact.service';
import { VaultService } from '../services/vault.service';
import { LinkService } from '../services/link.service';
import { CardService } from '../services/card.service';
import { ProjectService } from '../services/project.service';
import { ConfigService } from '../services/config.service';

function toHttpStatus(error: string): number {
  switch (error) {
    case 'INVALID_INPUT':
    case 'ARTIFACT_NOT_CONFIGURED':
    case 'AMBIGUOUS_ARTIFACT_REF':
    case 'UNSUPPORTED_ARTIFACT_SOURCE':
      return 400;
    case 'ARTIFACT_NOT_FOUND':
      return 404;
    case 'ARTIFACT_CONFLICT':
      return 409;
    default:
      return 500;
  }
}

export const cardArtifactRoutes = (workspacePath: string) => {
  return new Elysia()
    .post(
      '/api/card-artifacts/resolve',
      async ({ body, set }) => {
        const config = ConfigService.getInstance();
        const { artifactBaseUrl, artifactBasePath, fileBrowserBasePath } = config;

        if (!artifactBaseUrl || !artifactBasePath) {
          set.status = 400;
          return {
            error: 'ARTIFACT_NOT_CONFIGURED',
            message: 'Set ARTIFACT_BASE_URL and ARTIFACT_BASE_PATH in .env to enable artifact resolution.',
          };
        }

        // At least one card identifier required
        if (!body.url && !body.cardId && !(body.projectSlug && body.cardSlug)) {
          set.status = 400;
          return {
            error: 'INVALID_INPUT',
            message: 'Provide url, cardId, or projectSlug + cardSlug to resolve an artifact.',
          };
        }

        const vaultService = new VaultService(workspacePath, artifactBasePath, artifactBaseUrl, fileBrowserBasePath);
        const linkService = new LinkService(workspacePath);
        const cardService = new CardService(workspacePath);
        const projectService = new ProjectService(workspacePath);
        const artifactService = new CardArtifactService(
          vaultService, linkService, cardService, projectService, artifactBaseUrl
        );

        try {
          const resolved = await artifactService.resolveCardArtifact(
            {
              url: body.url,
              cardId: body.cardId,
              projectSlug: body.projectSlug,
              cardSlug: body.cardSlug,
              artifactRef: body.artifactRef,
            },
            body.includeContent ?? false
          );

          return {
            card: {
              projectSlug: resolved.projectSlug,
              cardSlug: resolved.cardSlug,
              cardId: resolved.cardId,
              title: resolved.cardTitle,
            },
            link: {
              id: resolved.link.id,
              label: resolved.link.label,
              kind: resolved.link.kind,
              url: resolved.link.url,
              createdAt: resolved.link.createdAt,
              updatedAt: resolved.link.updatedAt,
            },
            artifact: {
              path: resolved.relativePath,
              hash: resolved.hash,
              sizeBytes: resolved.sizeBytes,
              lineCount: resolved.lineCount,
              ...(resolved.content !== undefined ? { content: resolved.content } : {}),
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
          summary: 'Resolve a card artifact',
          description: [
            'Resolves any artifact identifier to its full metadata.',
            '',
            'Accepts any of: url (viewer/editor URL), cardId, or projectSlug+cardSlug.',
            'Use artifactRef to disambiguate when a card has multiple artifacts.',
            'artifactRef is matched by: link ID → vault path → URL → unique label.',
            '',
            'Set includeContent=true to fetch the artifact file content in the response.',
          ].join('\n'),
        },
        body: t.Object({
          url: t.Optional(t.String({ description: 'Viewer/editor URL for the artifact (most precise).' })),
          cardId: t.Optional(t.String({ description: 'Card identifier (e.g. HE-42). Scans all projects.' })),
          projectSlug: t.Optional(t.String({ description: 'Project slug. Use with cardSlug.' })),
          cardSlug: t.Optional(t.String({ description: 'Card slug. Use with projectSlug.' })),
          artifactRef: t.Optional(t.String({
            description: 'Disambiguator: link ID (UUID), vault path, or unique label.',
          })),
          includeContent: t.Optional(t.Boolean({
            description: 'When true, include the full artifact file content in the response.',
            default: false,
          })),
        }),
      }
    );
};
