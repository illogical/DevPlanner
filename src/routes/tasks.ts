import { Elysia, t } from 'elysia';
import { TaskService } from '../services/task.service';
import { MarkdownService } from '../services/markdown.service';
import { CardService } from '../services/card.service';
import { WebSocketService } from '../services/websocket.service';
import { recordAndBroadcastHistory } from '../utils/history-helper';
import type { TaskToggledData, CardUpdatedData } from '../types';

export const taskRoutes = (workspacePath: string) => {
  const taskService = new TaskService(workspacePath);
  const cardService = new CardService(workspacePath);
  const wsService = WebSocketService.getInstance();

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

        // Broadcast card:updated event (task list changed)
        const eventData: CardUpdatedData = {
          card: {
            slug: card.slug,
            filename: card.filename,
            lane: card.lane,
            frontmatter: card.frontmatter,
            taskProgress,
          },
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'card:updated',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Record history
        recordAndBroadcastHistory(
          params.projectSlug,
          'task:added',
          `Task added to "${card.frontmatter.title}": ${body.text}`,
          {
            cardSlug: params.cardSlug,
            cardTitle: card.frontmatter.title,
            lane: card.lane,
            taskIndex: task.index,
            taskText: body.text,
          }
        );

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

        // Broadcast task:toggled event
        const eventData: TaskToggledData = {
          cardSlug: params.cardSlug,
          taskIndex,
          checked: body.checked,
          taskProgress,
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'task:toggled',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Record history
        recordAndBroadcastHistory(
          params.projectSlug,
          body.checked ? 'task:completed' : 'task:uncompleted',
          `Task ${body.checked ? 'completed' : 'uncompleted'} in "${card.frontmatter.title}": ${task.text}`,
          {
            cardSlug: params.cardSlug,
            cardTitle: card.frontmatter.title,
            lane: card.lane,
            taskIndex,
            taskText: task.text,
          }
        );

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
