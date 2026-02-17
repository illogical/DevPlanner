import { Elysia, t } from 'elysia';
import { HistoryService } from '../services/history.service';

const historyService = HistoryService.getInstance();

export const historyRoutes = new Elysia({ prefix: '/api' }).get(
  '/projects/:projectSlug/history',
  async ({ params, query }) => {
    const { projectSlug } = params;
    const limit = Math.min(
      parseInt((query.limit as string) || '50'),
      500 // Increased max from 100 to 500 to match persistence
    );

    const events = await historyService.getEvents(projectSlug, limit);

    return {
      events,
      total: events.length, // Use actual length since getEventCount would need to be async too
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
