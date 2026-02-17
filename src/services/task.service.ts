import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { TaskItem } from '../types';
import { MarkdownService } from './markdown.service';
import { ALL_LANES } from '../constants';

/**
 * Service for managing tasks within cards.
 */
export class TaskService {
  private workspacePath: string;
  private locks: Map<string, Promise<void>> = new Map();

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Acquire a lock for a specific card to prevent concurrent modifications
   */
  private async acquireLock(cardKey: string): Promise<() => void> {
    // Wait for any existing lock to be released
    while (this.locks.has(cardKey)) {
      await this.locks.get(cardKey);
    }

    // Create a new lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.locks.set(cardKey, lockPromise);

    // Return the release function
    return () => {
      this.locks.delete(cardKey);
      releaseLock!();
    };
  }

  /**
   * Find which lane a card is in by searching all lanes
   */
  private async findCardLane(
    projectSlug: string,
    cardSlug: string
  ): Promise<string | null> {
    for (const laneName of ALL_LANES) {
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

    // Acquire lock to prevent concurrent modifications
    const cardKey = `${projectSlug}:${cardSlug}`;
    const releaseLock = await this.acquireLock(cardKey);

    try {
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
    } finally {
      releaseLock();
    }
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

    // Acquire lock to prevent concurrent modifications
    const cardKey = `${projectSlug}:${cardSlug}`;
    const releaseLock = await this.acquireLock(cardKey);

    try {
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
    } finally {
      releaseLock();
    }
  }
}
