import { Elysia, t } from 'elysia';
import { HistoryService } from '../services/history.service';
import { ProjectService } from '../services/project.service';

const historyService = HistoryService.getInstance();

export const activityRoutes = (workspacePath: string) => {
  const projectService = new ProjectService(workspacePath);

  return new Elysia({ prefix: '/api' }).get(
    '/activity',
    async ({ query }) => {
      const parsedLimit = parseInt((query.limit as string) || '50');
      const limit = Math.min(!isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50, 500);
      const since = query.since || undefined;

      // Discover all (non-archived) project slugs
      const projects = await projectService.listProjects();
      const slugs = projects.map((p) => p.slug);

      const events = await historyService.getActivityFeed(slugs, limit, since);

      return {
        events,
        total: events.length,
      };
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        since: t.Optional(t.String()),
      }),
    }
  );
};
