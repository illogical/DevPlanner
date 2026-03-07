import { Elysia } from 'elysia';
import { CardService } from '../services/card.service';
import { ProjectService } from '../services/project.service';
import { searchProjectForPalette } from './cards';

/**
 * Global search route: searches across all (non-archived) projects.
 */
export const searchRoutes = (workspacePath: string) => {
  const cardService = new CardService(workspacePath);
  const projectService = new ProjectService(workspacePath);

  return new Elysia()
    .get('/api/search', async ({ query }) => {
      const searchQuery = query.q?.trim();
      if (!searchQuery || searchQuery.length < 2) {
        return { results: [], query: searchQuery ?? '', projectsSearched: [] };
      }

      // Optionally filter to specific projects via ?projects=slug1,slug2
      const projectFilter = query.projects?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [];

      const projects = await projectService.listProjects(false);
      const projectsToSearch = projectFilter.length > 0
        ? projects.filter(p => projectFilter.includes(p.slug))
        : projects.filter(p => !p.archived);

      const allResults = await Promise.all(
        projectsToSearch.map(p =>
          searchProjectForPalette(p.slug, searchQuery, cardService).catch(() => [])
        )
      );

      return {
        results: allResults.flat(),
        query: searchQuery,
        projectsSearched: projectsToSearch.map(p => p.slug),
      };
    });
};
