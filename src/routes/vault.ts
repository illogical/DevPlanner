import { Elysia, t } from 'elysia';
import { ConfigService } from '../services/config.service';
import { VaultService } from '../services/vault.service';

function toHttpStatus(error: string): number {
  switch (error) {
    case 'OBSIDIAN_NOT_CONFIGURED':
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
      const { obsidianVaultPath } = config;

      if (!obsidianVaultPath) {
        set.status = 400;
        return {
          error: 'OBSIDIAN_NOT_CONFIGURED',
          message: 'Set OBSIDIAN_VAULT_PATH in .env to enable vault file reading.',
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

      const vaultService = new VaultService('', obsidianVaultPath, config.obsidianBaseUrl ?? '');

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
      query: t.Object({
        path: t.Optional(t.String()),
      }),
    }
  );
