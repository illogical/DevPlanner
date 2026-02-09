import { Elysia, t } from 'elysia';
import { ProjectService } from '../services/project.service';
import { slugify } from '../utils/slug';
import { WebSocketService } from '../services/websocket.service';
import type { ProjectUpdatedData } from '../types';

export const projectRoutes = (workspacePath: string) => {
  const projectService = new ProjectService(workspacePath);
  const wsService = WebSocketService.getInstance();

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

        // Return ProjectSummary format with cardCounts
        return {
          slug,
          name: project.name,
          description: project.description,
          created: project.created,
          updated: project.updated,
          archived: project.archived,
          lanes: project.lanes,
          cardCounts: {
            '01-upcoming': 0,
            '02-in-progress': 0,
            '03-complete': 0,
            '04-archive': 0,
          },
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

        // Broadcast project:updated event
        const eventData: ProjectUpdatedData = {
          slug: params.projectSlug,
          config: project,
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'project:updated',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

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
    .delete('/:projectSlug', async ({ params, query }) => {
      const hardDelete = query.hard === 'true';

      if (hardDelete) {
        // Hard delete: permanently remove project from disk
        await projectService.deleteProject(params.projectSlug);

        // Broadcast project:deleted event to subscribed clients
        const eventData: { slug: string } = {
          slug: params.projectSlug,
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'project:deleted',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Disconnect all clients subscribed to this project
        wsService.disconnectProject(params.projectSlug);

        return {
          slug: params.projectSlug,
          deleted: true,
        };
      } else {
        // Soft delete: archive the project
        await projectService.archiveProject(params.projectSlug);

        // Get updated project to broadcast
        const project = await projectService.getProject(params.projectSlug);

        // Broadcast project:updated event
        const eventData: ProjectUpdatedData = {
          slug: params.projectSlug,
          config: project,
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'project:updated',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        return {
          slug: params.projectSlug,
          archived: true,
        };
      }
    });
};
