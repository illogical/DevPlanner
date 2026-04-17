import { Elysia, t } from 'elysia';
import { ConfigService } from '../services/config.service';
import { VaultService } from '../services/vault.service';

function toHttpStatus(error: string): number {
  switch (error) {
    case 'ARTIFACT_NOT_CONFIGURED':
    case 'INVALID_PATH':
      return 400;
    case 'FILE_NOT_FOUND':
      return 404;
    default:
      return 500;
  }
}

export const vaultRoutes = new Elysia()
  .get(
    '/api/vault/content',
    async ({ query, set }) => {
      const config = ConfigService.getInstance();
      const { artifactBasePath } = config;

      if (!artifactBasePath) {
        set.status = 400;
        return {
          error: 'ARTIFACT_NOT_CONFIGURED',
          message: 'Set ARTIFACT_BASE_PATH in .env to enable vault file reading.',
        };
      }

      const relativePath = query.path;
      if (!relativePath || relativePath.trim() === '') {
        set.status = 400;
        return {
          error: 'INVALID_PATH',
          message: 'Query parameter "path" is required.',
        };
      }

      const vaultService = new VaultService('', artifactBasePath, config.artifactBaseUrl ?? '');

      try {
        const content = await vaultService.readArtifactContent(relativePath);
        set.headers['Content-Type'] = 'text/plain; charset=utf-8';
        return content;
      } catch (err: any) {
        if (err?.error) {
          set.status = toHttpStatus(err.error);
          return err;
        }
        throw err;
      }
    },
    {
      detail: { tags: ['Vault'], summary: 'Read vault file content', description: 'Returns the content of a vault artifact file by relative path.' },
      query: t.Object({
        path: t.Optional(t.String()),
      }),
    }
  )
  .put(
    '/api/vault/file',
    async ({ body, set }) => {
      const config = ConfigService.getInstance();
      const { artifactBasePath } = config;

      if (!artifactBasePath) {
        set.status = 400;
        return { error: 'ARTIFACT_NOT_CONFIGURED', message: 'Set ARTIFACT_BASE_PATH in .env to enable vault file writing.' };
      }

      const { path: relativePath, content } = body;
      const vaultService = new VaultService('', artifactBasePath, config.artifactBaseUrl ?? '');

      try {
        await vaultService.writeArtifactContent(relativePath, content);
        return { ok: true, path: relativePath };
      } catch (err: any) {
        if (err?.error) {
          set.status = toHttpStatus(err.error);
          return err;
        }
        throw err;
      }
    },
    {
      detail: { tags: ['Vault'], summary: 'Write vault file', description: 'Creates or overwrites a vault artifact file.' },
      body: t.Object({
        path: t.String(),
        content: t.String(),
      }),
    }
  )
  .delete(
    '/api/vault/file',
    async ({ body, set }) => {
      const config = ConfigService.getInstance();
      const { artifactBasePath } = config;

      if (!artifactBasePath) {
        set.status = 400;
        return { error: 'ARTIFACT_NOT_CONFIGURED', message: 'Set ARTIFACT_BASE_PATH in .env to enable vault file deletion.' };
      }

      const { path: relativePath } = body;
      const vaultService = new VaultService('', artifactBasePath, config.artifactBaseUrl ?? '');

      try {
        await vaultService.deleteArtifactFile(relativePath);
        return { ok: true, path: relativePath };
      } catch (err: any) {
        if (err?.error) {
          set.status = toHttpStatus(err.error);
          return err;
        }
        throw err;
      }
    },
    {
      detail: { tags: ['Vault'], summary: 'Delete vault file', description: 'Deletes a vault artifact file by relative path.' },
      body: t.Object({ path: t.String() }),
    }
  )
  .get(
    '/api/vault/tree',
    async ({ set }) => {
      const config = ConfigService.getInstance();
      const { artifactBasePath } = config;

      if (!artifactBasePath) {
        set.status = 400;
        return { error: 'ARTIFACT_NOT_CONFIGURED', message: 'Set ARTIFACT_BASE_PATH in .env to enable vault tree listing.' };
      }

      const vaultService = new VaultService('', artifactBasePath, config.artifactBaseUrl ?? '');

      try {
        return await vaultService.listTree();
      } catch (err: any) {
        if (err?.error) {
          set.status = toHttpStatus(err.error);
          return err;
        }
        throw err;
      }
    },
    {
      detail: { tags: ['Vault'], summary: 'List vault file tree', description: 'Returns a tree listing of all files in the vault.' },
    }
  );
