import { Elysia, t } from 'elysia';
import { ConfigService } from '../services/config.service';
import { GitService } from '../services/git.service';

function requireVaultPath(): string {
  const config = ConfigService.getInstance();
  if (!config.artifactBasePath) {
    throw { error: 'ARTIFACT_NOT_CONFIGURED', message: 'Set ARTIFACT_BASE_PATH in .env to enable git operations.' };
  }
  return config.artifactBasePath;
}

function toStatus(err: unknown): number {
  const e = err as any;
  if (e?.error === 'ARTIFACT_NOT_CONFIGURED' || e?.error === 'INVALID_PATH') return 400;
  return 500;
}

export const vaultGitRoutes = new Elysia()
  .get(
    '/api/vault/git/status',
    async ({ query, set }) => {
      try {
        const vaultPath = requireVaultPath();
        const svc = new GitService(vaultPath);
        const state = await svc.getStatus(query.path);
        return { path: query.path, state };
      } catch (err: any) {
        set.status = toStatus(err);
        return err;
      }
    },
    { query: t.Object({ path: t.String() }) }
  )
  .post(
    '/api/vault/git/statuses',
    async ({ body, set }) => {
      try {
        const vaultPath = requireVaultPath();
        const svc = new GitService(vaultPath);
        const statuses = await svc.getStatuses(body.paths);
        return { statuses };
      } catch (err: any) {
        set.status = toStatus(err);
        return err;
      }
    },
    { body: t.Object({ paths: t.Array(t.String()) }) }
  )
  .post(
    '/api/vault/git/stage',
    async ({ body, set }) => {
      try {
        const vaultPath = requireVaultPath();
        const svc = new GitService(vaultPath);
        const state = await svc.stage(body.path);
        return { ok: true, path: body.path, state };
      } catch (err: any) {
        set.status = toStatus(err);
        return err;
      }
    },
    { body: t.Object({ path: t.String() }) }
  )
  .post(
    '/api/vault/git/unstage',
    async ({ body, set }) => {
      try {
        const vaultPath = requireVaultPath();
        const svc = new GitService(vaultPath);
        const state = await svc.unstage(body.path);
        return { ok: true, path: body.path, state };
      } catch (err: any) {
        set.status = toStatus(err);
        return err;
      }
    },
    { body: t.Object({ path: t.String() }) }
  )
  .post(
    '/api/vault/git/discard',
    async ({ body, set }) => {
      try {
        const vaultPath = requireVaultPath();
        const svc = new GitService(vaultPath);
        const state = await svc.discardUnstaged(body.path);
        return { ok: true, path: body.path, state };
      } catch (err: any) {
        set.status = toStatus(err);
        return err;
      }
    },
    { body: t.Object({ path: t.String() }) }
  )
  .post(
    '/api/vault/git/commit',
    async ({ body, set }) => {
      try {
        const vaultPath = requireVaultPath();
        const svc = new GitService(vaultPath);
        const { state, output } = await svc.commit(body.path, body.message);
        return { ok: true, path: body.path, state, output };
      } catch (err: any) {
        set.status = toStatus(err);
        return err;
      }
    },
    { body: t.Object({ path: t.String(), message: t.String() }) }
  )
  .get(
    '/api/vault/git/diff',
    async ({ query, set }) => {
      try {
        const vaultPath = requireVaultPath();
        const svc = new GitService(vaultPath);
        const diff = await svc.getDiff(query.path, query.mode);
        set.headers['Content-Type'] = 'text/plain; charset=utf-8';
        return diff;
      } catch (err: any) {
        set.status = toStatus(err);
        return err;
      }
    },
    { query: t.Object({ path: t.String(), mode: t.Union([t.Literal('working'), t.Literal('staged')]) }) }
  )
  .get(
    '/api/vault/git/show',
    async ({ query, set }) => {
      try {
        const vaultPath = requireVaultPath();
        const svc = new GitService(vaultPath);
        const content = await svc.getFileAtRef(query.path, query.ref);
        set.headers['Content-Type'] = 'text/plain; charset=utf-8';
        return content;
      } catch (err: any) {
        set.status = toStatus(err);
        return err;
      }
    },
    { query: t.Object({ path: t.String(), ref: t.Union([t.Literal('staged'), t.Literal('HEAD')]) }) }
  );
