import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { TaskItem } from '../types';
import { MarkdownService } from './markdown.service';
import { resourceLock } from '../utils/resource-lock';
import { resolveCardRef, type CardLaneResult } from '../utils/card-resolver';

/**
 * Service for managing tasks within cards.
 */
export class TaskService {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Find which lane a card is in by searching all lanes.
   * Accepts either a slug (filename without .md) or a card ID (e.g. DEV-42, dev42).
   * Returns { lane, slug } where slug is always the canonical filename-based slug.
   */
  private async findCardLane(
    projectSlug: string,
    cardRef: string
  ): Promise<CardLaneResult | null> {
    return resolveCardRef(this.workspacePath, projectSlug, cardRef);
  }

  /**
   * Strip leading Markdown checkbox/list syntax that LLMs sometimes add by mistake.
   * e.g. "- [ ] Do the thing" → "Do the thing"
   *      "- [x] Done"         → "Done"
   *      "- Just a list item" → "Just a list item"
   */
  private sanitizeTaskText(text: string): string {
    return text
      .replace(/^[\s]*-\s*\[[ xX]\]\s*/, '') // strip "- [ ]" or "- [x]"
      .replace(/^[\s]*-\s+/, '')              // strip bare "- " list prefix
      .trim();
  }

  /**
   * Add a new task to a card
   */
  async addTask(
    projectSlug: string,
    cardSlug: string,
    text: string
  ): Promise<TaskItem> {
    const sanitized = this.sanitizeTaskText(text);
    if (!sanitized || sanitized.length === 0) {
      throw new Error('Task text is required');
    }

    const result = await this.findCardLane(projectSlug, cardSlug);
    if (!result) {
      throw new Error(`Card '${cardSlug}' not found in project '${projectSlug}'`);
    }

    const { lane, slug } = result;
    // Acquire lock to prevent concurrent modifications
    const releaseLock = await resourceLock.acquire(`${projectSlug}:card:${slug}`);

    try {
      const cardPath = join(this.workspacePath, projectSlug, lane, `${slug}.md`);
      const fileContent = await readFile(cardPath, 'utf-8');
      const { frontmatter, content } = MarkdownService.parse(fileContent);

      // Append the new task (using sanitized text)
      const updatedContent = MarkdownService.appendTask(content, sanitized);

      // Update timestamp and version
      const now = new Date().toISOString();
      frontmatter.updated = now;
      frontmatter.version = (frontmatter.version ?? 1) + 1;

      // Record task timestamp metadata
      if (!frontmatter.taskMeta) {
        frontmatter.taskMeta = [];
      }
      frontmatter.taskMeta.push({ addedAt: now, completedAt: null });

      // Serialize and write
      const markdown = MarkdownService.serialize(frontmatter, updatedContent);
      await writeFile(cardPath, markdown);

      // Parse tasks to get the new task with its index
      const tasks = MarkdownService.parseTasks(updatedContent);
      const newTask = tasks[tasks.length - 1];
      const meta = frontmatter.taskMeta[newTask.index];
      if (meta) {
        newTask.addedAt = meta.addedAt;
        newTask.completedAt = meta.completedAt;
      }

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
    const result = await this.findCardLane(projectSlug, cardSlug);
    if (!result) {
      throw new Error(`Card '${cardSlug}' not found in project '${projectSlug}'`);
    }

    const { lane, slug } = result;
    // Acquire lock to prevent concurrent modifications
    const releaseLock = await resourceLock.acquire(`${projectSlug}:card:${slug}`);

    try {
      const cardPath = join(this.workspacePath, projectSlug, lane, `${slug}.md`);
      const fileContent = await readFile(cardPath, 'utf-8');
      const { frontmatter, content } = MarkdownService.parse(fileContent);

      // Update the task
      const updatedContent = MarkdownService.setTaskChecked(content, taskIndex, checked);

      // Update timestamp and version
      const now = new Date().toISOString();
      frontmatter.updated = now;
      frontmatter.version = (frontmatter.version ?? 1) + 1;

      // Update task completion timestamp in metadata
      if (frontmatter.taskMeta && frontmatter.taskMeta[taskIndex] !== undefined) {
        frontmatter.taskMeta[taskIndex].completedAt = checked ? now : null;
      }

      // Serialize and write
      const markdown = MarkdownService.serialize(frontmatter, updatedContent);
      await writeFile(cardPath, markdown);

      // Parse tasks to get the updated task
      const tasks = MarkdownService.parseTasks(updatedContent);
      const updatedTask = tasks[taskIndex];

      if (!updatedTask) {
        throw new Error(`Task index ${taskIndex} not found`);
      }

      // Attach timestamp metadata if available
      const meta = frontmatter.taskMeta?.[taskIndex];
      if (meta) {
        updatedTask.addedAt = meta.addedAt;
        updatedTask.completedAt = meta.completedAt;
      }

      return updatedTask;
    } finally {
      releaseLock();
    }
  }

  /**
   * Update the text of an existing task
   */
  async updateTaskText(
    projectSlug: string,
    cardSlug: string,
    taskIndex: number,
    text: string
  ): Promise<TaskItem> {
    if (!text || text.trim().length === 0) {
      throw new Error('Task text is required');
    }

    const result = await this.findCardLane(projectSlug, cardSlug);
    if (!result) {
      throw new Error(`Card '${cardSlug}' not found in project '${projectSlug}'`);
    }

    const { lane, slug } = result;
    const releaseLock = await resourceLock.acquire(`${projectSlug}:card:${slug}`);

    try {
      const cardPath = join(this.workspacePath, projectSlug, lane, `${slug}.md`);
      const fileContent = await readFile(cardPath, 'utf-8');
      const { frontmatter, content } = MarkdownService.parse(fileContent);

      const updatedContent = MarkdownService.updateTaskText(content, taskIndex, text.trim());

      const now = new Date().toISOString();
      frontmatter.updated = now;
      frontmatter.version = (frontmatter.version ?? 1) + 1;

      const markdown = MarkdownService.serialize(frontmatter, updatedContent);
      await writeFile(cardPath, markdown);

      const tasks = MarkdownService.parseTasks(updatedContent);
      const updatedTask = tasks[taskIndex];

      if (!updatedTask) {
        throw new Error(`Task index ${taskIndex} not found`);
      }

      const meta = frontmatter.taskMeta?.[taskIndex];
      if (meta) {
        updatedTask.addedAt = meta.addedAt;
        updatedTask.completedAt = meta.completedAt;
      }

      return updatedTask;
    } finally {
      releaseLock();
    }
  }

  /**
   * Delete a task by index; remaining tasks shift their indices down
   */
  async deleteTask(
    projectSlug: string,
    cardSlug: string,
    taskIndex: number
  ): Promise<TaskItem[]> {
    const result = await this.findCardLane(projectSlug, cardSlug);
    if (!result) {
      throw new Error(`Card '${cardSlug}' not found in project '${projectSlug}'`);
    }

    const { lane, slug } = result;
    const releaseLock = await resourceLock.acquire(`${projectSlug}:card:${slug}`);

    try {
      const cardPath = join(this.workspacePath, projectSlug, lane, `${slug}.md`);
      const fileContent = await readFile(cardPath, 'utf-8');
      const { frontmatter, content } = MarkdownService.parse(fileContent);

      const updatedContent = MarkdownService.deleteTask(content, taskIndex);

      const now = new Date().toISOString();
      frontmatter.updated = now;
      frontmatter.version = (frontmatter.version ?? 1) + 1;

      // Remove the deleted task's metadata and re-index remaining entries
      if (frontmatter.taskMeta && frontmatter.taskMeta.length > taskIndex) {
        frontmatter.taskMeta.splice(taskIndex, 1);
      }

      const markdown = MarkdownService.serialize(frontmatter, updatedContent);
      await writeFile(cardPath, markdown);

      const tasks = MarkdownService.parseTasks(updatedContent);

      // Re-attach timestamp metadata
      for (const task of tasks) {
        const meta = frontmatter.taskMeta?.[task.index];
        if (meta) {
          task.addedAt = meta.addedAt;
          task.completedAt = meta.completedAt;
        }
      }

      return tasks;
    } finally {
      releaseLock();
    }
  }
}
