import { Elysia, t } from 'elysia';
import { ProjectService } from '../services/project.service';
import { slugify } from '../utils/slug';

export const projectRoutes = (workspacePath: string) => {
  const projectService = new ProjectService(workspacePath);

  return new Elysia({ prefix: '/api/projects' })
    .get('/', async ({ query }) => {
      const includeArchived = query.includeArchived === 'true';
      const projects = await projectService.listProjects(includeArchived);

      return { projects };
    })
    .post(
      '/',
      async ({ body, set }) => {
        const project = await projectService.createProject(body.name, body.description);
        const slug = slugify(body.name);
        set.status = 201;

        return {
          slug,
          ...project,
        };
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 100 }),
          description: t.Optional(t.String({ maxLength: 500 })),
        }),
      }
    )
    .get('/:projectSlug', async ({ params }) => {
      const project = await projectService.getProject(params.projectSlug);
      return project;
    })
    .patch(
      '/:projectSlug',
      async ({ params, body }) => {
        const project = await projectService.updateProject(params.projectSlug, body);
        return project;
      },
      {
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
          description: t.Optional(t.String({ maxLength: 500 })),
          archived: t.Optional(t.Boolean()),
        }),
      }
    )
    .delete('/:projectSlug', async ({ params }) => {
      await projectService.archiveProject(params.projectSlug);
      return {
        slug: params.projectSlug,
        archived: true,
      };
    });
};
