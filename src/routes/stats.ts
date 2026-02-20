import { Elysia } from 'elysia';
import { CardService } from '../services/card.service';
import { HistoryService } from '../services/history.service';

export const statsRoutes = (workspacePath: string) => {
  const cardService = new CardService(workspacePath);
  const historyService = HistoryService.getInstance();

  return new Elysia().get(
    '/api/projects/:projectSlug/stats',
    async ({ params }) => {
      const { projectSlug } = params;

      const now = Date.now();
      const ms7d = 7 * 24 * 60 * 60 * 1000;
      const ms30d = 30 * 24 * 60 * 60 * 1000;

      // Fetch cards from each lane in parallel
      const [upcoming, inProgress, complete] = await Promise.all([
        cardService.listCards(projectSlug, '01-upcoming'),
        cardService.listCards(projectSlug, '02-in-progress'),
        cardService.listCards(projectSlug, '03-complete'),
      ]);

      // Completions: complete-lane cards whose updated timestamp falls in the window
      const completionsLast7Days = complete.filter(
        (c) => now - new Date(c.frontmatter.updated).getTime() <= ms7d
      ).length;
      const completionsLast30Days = complete.filter(
        (c) => now - new Date(c.frontmatter.updated).getTime() <= ms30d
      ).length;

      // Average days in progress: for completed cards, use (updated - created) / ms per day
      const completedWithBoth = complete.filter(
        (c) => c.frontmatter.created && c.frontmatter.updated
      );
      const avgDaysInProgress =
        completedWithBoth.length > 0
          ? completedWithBoth.reduce((sum, c) => {
              const days =
                (new Date(c.frontmatter.updated).getTime() -
                  new Date(c.frontmatter.created).getTime()) /
                (24 * 60 * 60 * 1000);
              return sum + days;
            }, 0) / completedWithBoth.length
          : 0;

      // WIP and backlog counts
      const wipCount = inProgress.length;
      const backlogDepth = upcoming.length;

      // Blocked count: in-progress cards with status === 'blocked'
      const blockedCount = inProgress.filter(
        (c) => c.frontmatter.status === 'blocked'
      ).length;

      return {
        slug: projectSlug,
        completionsLast7Days,
        completionsLast30Days,
        avgDaysInProgress: Math.round(avgDaysInProgress * 10) / 10,
        wipCount,
        backlogDepth,
        blockedCount,
      };
    }
  );
};
