import { Elysia, t } from 'elysia';
import { DispatchService } from '../services/dispatch.service';
import { CardService } from '../services/card.service';
import { isValidAdapterName } from '../services/adapters/adapter.interface';
import type { DispatchRequest } from '../types/dispatch';

export const dispatchRoutes = (workspacePath: string) => {
  const dispatchService = DispatchService.getInstance();
  const cardService = new CardService(workspacePath);

  return new Elysia()
    // ── POST /api/projects/:projectSlug/cards/:cardSlug/dispatch ─────────────
    .post(
      '/api/projects/:projectSlug/cards/:cardSlug/dispatch',
      async ({ params, body, set }) => {
        const { projectSlug, cardSlug } = params;

        if (!isValidAdapterName(body.adapter)) {
          set.status = 400;
          return {
            error: 'INVALID_ADAPTER',
            message: `Unknown adapter: "${body.adapter}". Valid adapters: claude-cli, gemini-cli`,
          };
        }

        const request: DispatchRequest = {
          adapter: body.adapter,
          model: body.model,
          autoCreatePR: body.autoCreatePR ?? false,
        };

        try {
          const record = await dispatchService.dispatch(
            projectSlug,
            cardSlug,
            request,
            workspacePath
          );

          set.status = 201;
          return { dispatch: record };
        } catch (err: unknown) {
          const error = err as Error & { code?: string };
          const code = error.code;

          if (code === 'REPO_NOT_CONFIGURED') {
            set.status = 400;
            return { error: 'REPO_NOT_CONFIGURED', message: error.message };
          }
          if (code === 'REPO_NOT_FOUND') {
            set.status = 400;
            return { error: 'REPO_NOT_FOUND', message: error.message };
          }
          if (code === 'INVALID_ADAPTER') {
            set.status = 400;
            return { error: 'INVALID_ADAPTER', message: error.message };
          }
          if (code === 'DISPATCH_ACTIVE') {
            set.status = 409;
            return { error: 'DISPATCH_ACTIVE', message: error.message };
          }
          if (code === 'BRANCH_EXISTS') {
            set.status = 409;
            return { error: 'BRANCH_EXISTS', message: error.message };
          }
          if (code === 'CARD_ARCHIVED') {
            set.status = 400;
            return { error: 'CARD_ARCHIVED', message: error.message };
          }

          // Claude / Gemini CLI not installed
          if (
            error.message?.includes('not found') ||
            error.message?.includes('install with')
          ) {
            set.status = 400;
            return { error: 'CLI_NOT_FOUND', message: error.message };
          }

          throw err;
        }
      },
      {
        detail: { tags: ['Dispatch'], summary: 'Dispatch a card to AI', description: 'Dispatches a card to an AI coding agent via the specified adapter.' },
        body: t.Object({
          adapter: t.String(),
          model: t.Optional(t.String()),
          autoCreatePR: t.Optional(t.Boolean()),
        }),
      }
    )

    // ── GET /api/projects/:projectSlug/cards/:cardSlug/dispatch ─────────────
    .get(
      '/api/projects/:projectSlug/cards/:cardSlug/dispatch',
      async ({ params }) => {
        const { projectSlug, cardSlug } = params;
        // Resolve card ID or slug to canonical slug so lookup matches stored records
        const resolved = await cardService.getCard(projectSlug, cardSlug).catch(() => null);
        const slug = resolved?.slug ?? cardSlug;
        const record = dispatchService.getCardDispatch(projectSlug, slug);
        return { dispatch: record ?? null };
      },
      {
        detail: { tags: ['Dispatch'], summary: 'Get card dispatch status', description: 'Returns the active dispatch record for a card, if any.' },
      }
    )

    // ── POST /api/projects/:projectSlug/cards/:cardSlug/dispatch/cancel ──────
    .post(
      '/api/projects/:projectSlug/cards/:cardSlug/dispatch/cancel',
      async ({ params, set }) => {
        const { projectSlug, cardSlug } = params;
        // Resolve card ID or slug to canonical slug so lookup matches stored records
        const resolved = await cardService.getCard(projectSlug, cardSlug).catch(() => null);
        const slug = resolved?.slug ?? cardSlug;
        const record = dispatchService.getCardDispatch(projectSlug, slug);

        if (!record) {
          set.status = 404;
          return { error: 'NO_ACTIVE_DISPATCH', message: 'No active dispatch for this card' };
        }

        try {
          await dispatchService.cancel(record.id);
          return { success: true };
        } catch (err: unknown) {
          const error = err as Error & { code?: string };
          if (error.code === 'NO_ACTIVE_DISPATCH') {
            set.status = 404;
            return { error: 'NO_ACTIVE_DISPATCH', message: error.message };
          }
          throw err;
        }
      },
      {
        detail: { tags: ['Dispatch'], summary: 'Cancel a dispatch', description: 'Cancels the active AI dispatch for a card.' },
      }
    )

    // ── GET /api/projects/:projectSlug/cards/:cardSlug/dispatch/output ────────
    .get(
      '/api/projects/:projectSlug/cards/:cardSlug/dispatch/output',
      async ({ params }) => {
        const { projectSlug, cardSlug } = params;
        // Resolve card ID or slug to canonical slug so lookup matches stored records
        const resolved = await cardService.getCard(projectSlug, cardSlug).catch(() => null);
        const slug = resolved?.slug ?? cardSlug;
        const record = dispatchService.getCardDispatch(projectSlug, slug);
        if (!record) {
          return { events: [] };
        }
        return { events: dispatchService.getOutputBuffer(record.id) };
      },
      {
        detail: { tags: ['Dispatch'], summary: 'Get dispatch output', description: 'Returns the output event buffer for an active card dispatch.' },
      }
    )

    // ── GET /api/dispatches (all active dispatches) ───────────────────────────
    .get('/api/dispatches', () => {
      return { dispatches: dispatchService.listActive() };
    }, {
      detail: { tags: ['Dispatch'], summary: 'List active dispatches', description: 'Returns all currently active AI dispatches across all projects.' },
    });
};
