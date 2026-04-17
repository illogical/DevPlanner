import { Elysia, t } from 'elysia';
import { existsSync } from 'fs';
import { ProjectService } from '../services/project.service';
import { WorktreeService } from '../services/worktree.service';
import { slugify } from '../utils/slug';
import { WebSocketService } from '../services/websocket.service';
import { recordAndBroadcastHistory } from '../utils/history-helper';
import type { ProjectUpdatedData } from '../types';

export const projectRoutes = (workspacePath: string) => {
  const projectService = new ProjectService(workspacePath);
  const worktreeService = new WorktreeService();
  const wsService = WebSocketService.getInstance();

  return new Elysia({ prefix: '/api/projects', detail: { tags: ['Projects'] } })
    .get('/', async ({ query }) => {
      const includeArchived = query.includeArchived === 'true';
      const projects = await projectService.listProjects(includeArchived);

      return { projects };
    }, {
      detail: { summary: 'List all projects', description: 'Returns all projects in the workspace. Archived projects are excluded by default.' },
    })
    .post(
      '/',
      async ({ body, set }) => {
        const project = await projectService.createProject(body.name, body.description);
        const slug = slugify(body.name);
        set.status = 201;

        // Record history
        recordAndBroadcastHistory(
          slug,
          'project:created',
          `Project "${body.name}" created`,
          { projectName: body.name }
        );

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
        detail: { summary: 'Create a project', description: 'Creates a new project with default lane configuration.' },
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 100 }),
          description: t.Optional(t.String({ maxLength: 500 })),
        }),
      }
    )
    .get('/:projectSlug', async ({ params }) => {
      const project = await projectService.getProject(params.projectSlug);
      return project;
    }, {
      detail: { summary: 'Get a project', description: 'Returns detailed information about a single project by slug.' },
    })
    .patch(
      '/:projectSlug',
      async ({ params, body, set }) => {
        // Validate repoPath if provided
        if (body.repoPath !== undefined && body.repoPath !== null) {
          if (!existsSync(body.repoPath)) {
            set.status = 400;
            return {
              error: 'REPO_NOT_FOUND',
              message: `Repository path does not exist: ${body.repoPath}`,
            };
          }
          if (!worktreeService.validateRepo(body.repoPath)) {
            set.status = 400;
            return {
              error: 'REPO_NOT_FOUND',
              message: `Path is not a git repository: ${body.repoPath}`,
            };
          }
        }

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

        // Record history
        const changedFields = Object.keys(body).filter(k => body[k as keyof typeof body] !== undefined);
        recordAndBroadcastHistory(
          params.projectSlug,
          'project:updated',
          `Project "${project.name}" updated (${changedFields.join(', ')})`,
          { projectName: project.name, changedFields }
        );

        return project;
      },
      {
        detail: { summary: 'Update a project', description: 'Partially updates project configuration such as name, description, archived status, or repository path.' },
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
          description: t.Optional(t.String({ maxLength: 500 })),
          archived: t.Optional(t.Boolean()),
          repoPath: t.Optional(t.Union([t.String(), t.Null()])),
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

        // Record history
        recordAndBroadcastHistory(
          params.projectSlug,
          'project:archived',
          `Project "${project.name}" archived`,
          { projectName: project.name }
        );

        return {
          slug: params.projectSlug,
          archived: true,
        };
      }
    }, {
      detail: { summary: 'Delete or archive a project', description: 'Soft-deletes (archives) a project by default. Use ?hard=true to permanently remove the project from disk.' },
    });
};
