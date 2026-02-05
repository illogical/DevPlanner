import { Elysia, t } from 'elysia';
import { TaskService } from '../services/task.service';
import { MarkdownService } from '../services/markdown.service';
import { CardService } from '../services/card.service';

export const taskRoutes = (workspacePath: string) => {
  const taskService = new TaskService(workspacePath);
  const cardService = new CardService(workspacePath);

  return new Elysia()
    .post(
      '/api/projects/:projectSlug/cards/:cardSlug/tasks',
      async ({ params, body, set }) => {
        const task = await taskService.addTask(
          params.projectSlug,
          params.cardSlug,
          body.text
        );

        // Get updated card to calculate task progress
        const card = await cardService.getCard(params.projectSlug, params.cardSlug);
        const taskProgress = MarkdownService.taskProgress(card.tasks);

        set.status = 201;
        return {
          ...task,
          taskProgress,
        };
      },
      {
        body: t.Object({
          text: t.String({ minLength: 1, maxLength: 500 }),
        }),
      }
    )
    .patch(
      '/api/projects/:projectSlug/cards/:cardSlug/tasks/:taskIndex',
      async ({ params, body }) => {
        const taskIndex = parseInt(params.taskIndex);

        if (isNaN(taskIndex) || taskIndex < 0) {
          throw new Error('Invalid task index');
        }

        const task = await taskService.setTaskChecked(
          params.projectSlug,
          params.cardSlug,
          taskIndex,
          body.checked
        );

        // Get updated card to calculate task progress
        const card = await cardService.getCard(params.projectSlug, params.cardSlug);
        const taskProgress = MarkdownService.taskProgress(card.tasks);

        return {
          ...task,
          taskProgress,
        };
      },
      {
        body: t.Object({
          checked: t.Boolean(),
        }),
      }
    );
};
