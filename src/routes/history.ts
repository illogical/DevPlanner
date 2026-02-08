import { Elysia, t } from 'elysia';
import { HistoryService } from '../services/history.service';

const historyService = HistoryService.getInstance();

export const historyRoutes = new Elysia({ prefix: '/api' }).get(
  '/projects/:projectSlug/history',
  ({ params, query }) => {
    const { projectSlug } = params;
    const limit = Math.min(
      parseInt((query.limit as string) || '50'),
      100
    );

    const events = historyService.getEvents(projectSlug, limit);

    return {
      events,
      total: historyService.getEventCount(projectSlug),
    };
  },
  {
    params: t.Object({
      projectSlug: t.String(),
    }),
    query: t.Object({
      limit: t.Optional(t.String()),
    }),
  }
);
