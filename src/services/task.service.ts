import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { TaskItem } from '../types';
import { MarkdownService } from './markdown.service';

/**
 * Service for managing tasks within cards.
 */
export class TaskService {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Find which lane a card is in by searching all lanes
   */
  private async findCardLane(
    projectSlug: string,
    cardSlug: string
  ): Promise<string | null> {
    const laneNames = ['01-upcoming', '02-in-progress', '03-complete', '04-archive'];

    for (const laneName of laneNames) {
      const cardPath = join(
        this.workspacePath,
        projectSlug,
        laneName,
        `${cardSlug}.md`
      );
      try {
        await readFile(cardPath);
        return laneName;
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Add a new task to a card
   */
  async addTask(
    projectSlug: string,
    cardSlug: string,
    text: string
  ): Promise<TaskItem> {
    if (!text || text.trim().length === 0) {
      throw new Error('Task text is required');
    }

    const lane = await this.findCardLane(projectSlug, cardSlug);
    if (!lane) {
      throw new Error(`Card not found: ${cardSlug}`);
    }

    const cardPath = join(this.workspacePath, projectSlug, lane, `${cardSlug}.md`);
    const fileContent = await readFile(cardPath, 'utf-8');
    const { frontmatter, content } = MarkdownService.parse(fileContent);

    // Append the new task
    const updatedContent = MarkdownService.appendTask(content, text);

    // Update timestamp
    frontmatter.updated = new Date().toISOString();

    // Serialize and write
    const markdown = MarkdownService.serialize(frontmatter, updatedContent);
    await writeFile(cardPath, markdown);

    // Parse tasks to get the new task with its index
    const tasks = MarkdownService.parseTasks(updatedContent);
    const newTask = tasks[tasks.length - 1];

    return newTask;
  }

  /**
   * Set a task's checked state
   */
  async setTaskChecked(
    projectSlug: string,
    cardSlug: string,
    taskIndex: number,
    checked: boolean
  ): Promise<TaskItem> {
    const lane = await this.findCardLane(projectSlug, cardSlug);
    if (!lane) {
      throw new Error(`Card not found: ${cardSlug}`);
    }

    const cardPath = join(this.workspacePath, projectSlug, lane, `${cardSlug}.md`);
    const fileContent = await readFile(cardPath, 'utf-8');
    const { frontmatter, content } = MarkdownService.parse(fileContent);

    // Update the task
    const updatedContent = MarkdownService.setTaskChecked(content, taskIndex, checked);

    // Update timestamp
    frontmatter.updated = new Date().toISOString();

    // Serialize and write
    const markdown = MarkdownService.serialize(frontmatter, updatedContent);
    await writeFile(cardPath, markdown);

    // Parse tasks to get the updated task
    const tasks = MarkdownService.parseTasks(updatedContent);
    const updatedTask = tasks[taskIndex];

    if (!updatedTask) {
      throw new Error(`Task index ${taskIndex} not found`);
    }

    return updatedTask;
  }
}
