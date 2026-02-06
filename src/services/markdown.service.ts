import matter from 'gray-matter';
import type { CardFrontmatter, TaskItem } from '../types';

/**
 * Service for parsing and manipulating Markdown files with YAML frontmatter and checklists.
 */
export class MarkdownService {
  /**
   * Parse a .md file string into frontmatter + content + tasks
   */
  static parse(raw: string): {
    frontmatter: CardFrontmatter;
    content: string;
    tasks: TaskItem[];
  } {
    const { data, content } = matter(raw);
    const frontmatter = data as CardFrontmatter;
    const tasks = this.parseTasks(content);

    return {
      frontmatter,
      content,
      tasks,
    };
  }

  /**
   * Serialize frontmatter + content back into a .md file string
   */
  static serialize(frontmatter: CardFrontmatter, content: string): string {
    return matter.stringify(content, frontmatter);
  }

  /**
   * Parse checklist items from Markdown content.
   * Matches both `- [ ]` and `- [x]` patterns.
   */
  static parseTasks(content: string): TaskItem[] {
    const tasks: TaskItem[] = [];
    const lines = content.split('\n');
    let taskIndex = 0;

    for (const line of lines) {
      // Match `- [ ]` or `- [x]` at the start of the line (allowing leading spaces)
      const match = line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
      if (match) {
        const checked = match[1].toLowerCase() === 'x';
        const text = match[2].trim();
        tasks.push({ index: taskIndex, text, checked });
        taskIndex++;
      }
    }

    return tasks;
  }

  /**
   * Set a specific task's checked state in Markdown content.
   * Returns the updated content.
   */
  static setTaskChecked(
    content: string,
    taskIndex: number,
    checked: boolean
  ): string {
    const lines = content.split('\n');
    let currentTaskIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(\s*-\s+\[)([ xX])(\]\s+.+)$/);

      if (match) {
        if (currentTaskIndex === taskIndex) {
          // Replace the checkbox state
          const newCheckbox = checked ? 'x' : ' ';
          lines[i] = `${match[1]}${newCheckbox}${match[3]}`;
          return lines.join('\n');
        }
        currentTaskIndex++;
      }
    }

    throw new Error(`Task index ${taskIndex} not found in content`);
  }

  /**
   * Append a new checklist item to the content.
   * Adds it at the end of the content with proper formatting.
   */
  static appendTask(content: string, text: string): string {
    const newTask = `- [ ] ${text}`;

    // If content is empty or doesn't end with newline, add one
    if (!content) {
      return newTask;
    }

    const trimmedContent = content.trimEnd();
    return `${trimmedContent}\n${newTask}`;
  }

  /**
   * Compute task progress summary
   */
  static taskProgress(tasks: TaskItem[]): { total: number; checked: number } {
    const total = tasks.length;
    const checked = tasks.filter((t) => t.checked).length;
    return { total, checked };
  }
}
