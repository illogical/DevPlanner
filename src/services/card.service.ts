import { readdir, readFile, writeFile, rename, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import type { Card, CardSummary, CardFrontmatter, CreateCardInput } from '../types';
import { MarkdownService } from './markdown.service';
import { slugify } from '../utils/slug';

/**
 * Service for managing cards within projects.
 */
export class CardService {
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
    const projectPath = join(this.workspacePath, projectSlug);
    const laneNames = ['01-upcoming', '02-in-progress', '03-complete', '04-archive'];

    for (const laneName of laneNames) {
      const cardPath = join(projectPath, laneName, `${cardSlug}.md`);
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
   * Read the order file for a lane
   */
  private async readOrderFile(projectSlug: string, lane: string): Promise<string[]> {
    const orderPath = join(this.workspacePath, projectSlug, lane, '_order.json');
    try {
      const content = await readFile(orderPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Write the order file for a lane
   */
  private async writeOrderFile(
    projectSlug: string,
    lane: string,
    order: string[]
  ): Promise<void> {
    const orderPath = join(this.workspacePath, projectSlug, lane, '_order.json');
    await writeFile(orderPath, JSON.stringify(order, null, 2));
  }

  /**
   * Get all card filenames in a lane, sorted according to _order.json
   */
  private async getOrderedCardFilenames(
    projectSlug: string,
    lane: string
  ): Promise<string[]> {
    const lanePath = join(this.workspacePath, projectSlug, lane);
    const order = await this.readOrderFile(projectSlug, lane);

    // Get all .md files in the lane
    let files: string[];
    try {
      files = await readdir(lanePath);
    } catch {
      return [];
    }

    const mdFiles = files.filter((f) => f.endsWith('.md'));

    // Files in order.json that exist in the folder
    const orderedFiles = order.filter((f) => mdFiles.includes(f));

    // Files not in order.json, sorted alphabetically
    const unorderedFiles = mdFiles
      .filter((f) => !order.includes(f))
      .sort((a, b) => a.localeCompare(b));

    return [...orderedFiles, ...unorderedFiles];
  }

  /**
   * Generate a unique slug for a card, appending -2, -3, etc. if needed
   */
  private async generateUniqueSlug(
    projectSlug: string,
    baseSlug: string
  ): Promise<string> {
    let slug = baseSlug;
    let counter = 2;

    while ((await this.findCardLane(projectSlug, slug)) !== null) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * List all cards in a project, optionally filtered by lane
   */
  async listCards(projectSlug: string, lane?: string): Promise<CardSummary[]> {
    const lanes = lane
      ? [lane]
      : ['01-upcoming', '02-in-progress', '03-complete', '04-archive'];

    const cards: CardSummary[] = [];

    for (const laneName of lanes) {
      const filenames = await this.getOrderedCardFilenames(projectSlug, laneName);

      for (const filename of filenames) {
        const cardPath = join(this.workspacePath, projectSlug, laneName, filename);
        try {
          const content = await readFile(cardPath, 'utf-8');
          const { frontmatter, tasks } = MarkdownService.parse(content);
          const taskProgress = MarkdownService.taskProgress(tasks);

          cards.push({
            slug: filename.replace(/\.md$/, ''),
            filename,
            lane: laneName,
            frontmatter,
            taskProgress,
          });
        } catch {
          // Skip files that can't be read or parsed
          continue;
        }
      }
    }

    return cards;
  }

  /**
   * Get a single card with full content
   */
  async getCard(projectSlug: string, cardSlug: string): Promise<Card> {
    const lane = await this.findCardLane(projectSlug, cardSlug);
    if (!lane) {
      throw new Error(`Card not found: ${cardSlug}`);
    }

    const cardPath = join(this.workspacePath, projectSlug, lane, `${cardSlug}.md`);
    const content = await readFile(cardPath, 'utf-8');
    const { frontmatter, content: body, tasks } = MarkdownService.parse(content);

    return {
      slug: cardSlug,
      filename: `${cardSlug}.md`,
      lane,
      frontmatter,
      content: body,
      tasks,
    };
  }

  /**
   * Create a new card
   */
  async createCard(projectSlug: string, data: CreateCardInput): Promise<Card> {
    if (!data.title || data.title.trim().length === 0) {
      throw new Error('Card title is required');
    }

    const lane = data.lane || '01-upcoming';
    const baseSlug = slugify(data.title);
    const slug = await this.generateUniqueSlug(projectSlug, baseSlug);
    const filename = `${slug}.md`;

    const now = new Date().toISOString();

    const frontmatter: CardFrontmatter = {
      title: data.title,
      created: now,
      updated: now,
    };

    if (data.status) frontmatter.status = data.status;
    if (data.priority) frontmatter.priority = data.priority;
    if (data.assignee) frontmatter.assignee = data.assignee;
    if (data.tags) frontmatter.tags = data.tags;

    const content = data.content || '';
    const markdown = MarkdownService.serialize(frontmatter, content);

    // Write the card file
    const cardPath = join(this.workspacePath, projectSlug, lane, filename);
    await writeFile(cardPath, markdown);

    // Add to order file
    const order = await this.readOrderFile(projectSlug, lane);
    order.push(filename);
    await this.writeOrderFile(projectSlug, lane, order);

    const tasks = MarkdownService.parseTasks(content);

    return {
      slug,
      filename,
      lane,
      frontmatter,
      content,
      tasks,
    };
  }

  /**
   * Archive a card (move to 04-archive lane)
   */
  async archiveCard(projectSlug: string, cardSlug: string): Promise<void> {
    await this.moveCard(projectSlug, cardSlug, '04-archive');
  }

  /**
   * Move a card to a different lane, optionally at a specific position
   */
  async moveCard(
    projectSlug: string,
    cardSlug: string,
    targetLane: string,
    position?: number
  ): Promise<Card> {
    const sourceLane = await this.findCardLane(projectSlug, cardSlug);
    if (!sourceLane) {
      throw new Error(`Card not found: ${cardSlug}`);
    }

    const filename = `${cardSlug}.md`;
    const sourcePath = join(this.workspacePath, projectSlug, sourceLane, filename);
    const targetPath = join(this.workspacePath, projectSlug, targetLane, filename);

    // Read the card to update its timestamp
    const cardContent = await readFile(sourcePath, 'utf-8');
    const { frontmatter, content } = MarkdownService.parse(cardContent);

    // Update the timestamp
    frontmatter.updated = new Date().toISOString();
    const updatedContent = MarkdownService.serialize(frontmatter, content);

    // Ensure target lane directory exists
    const targetLanePath = join(this.workspacePath, projectSlug, targetLane);
    await mkdir(targetLanePath, { recursive: true });

    // Write to target location
    await writeFile(targetPath, updatedContent);

    // Remove from source order and delete source file if moving between lanes
    if (sourceLane !== targetLane) {
      const sourceOrder = await this.readOrderFile(projectSlug, sourceLane);
      const newSourceOrder = sourceOrder.filter((f) => f !== filename);
      await this.writeOrderFile(projectSlug, sourceLane, newSourceOrder);

      // Delete source file
      await unlink(sourcePath);
    }

    // Add to target order at the specified position
    const targetOrder = await this.readOrderFile(projectSlug, targetLane);

    if (sourceLane === targetLane) {
      // Moving within the same lane - remove and re-insert
      const currentIndex = targetOrder.indexOf(filename);
      if (currentIndex !== -1) {
        targetOrder.splice(currentIndex, 1);
      }
    }

    if (position !== undefined && position >= 0 && position <= targetOrder.length) {
      targetOrder.splice(position, 0, filename);
    } else {
      targetOrder.push(filename);
    }

    await this.writeOrderFile(projectSlug, targetLane, targetOrder);

    const tasks = MarkdownService.parseTasks(content);

    return {
      slug: cardSlug,
      filename,
      lane: targetLane,
      frontmatter,
      content,
      tasks,
    };
  }

  /**
   * Reorder cards within a lane
   */
  async reorderCards(
    projectSlug: string,
    laneSlug: string,
    order: string[]
  ): Promise<void> {
    // Get all actual files in the lane
    const lanePath = join(this.workspacePath, projectSlug, laneSlug);
    let files: string[];
    try {
      files = await readdir(lanePath);
    } catch {
      throw new Error(`Lane not found: ${laneSlug}`);
    }

    const mdFiles = files.filter((f) => f.endsWith('.md'));

    // Validate that all files in order exist in the lane
    for (const filename of order) {
      if (!mdFiles.includes(filename)) {
        throw new Error(`Card not found in lane: ${filename}`);
      }
    }

    // Files not in the new order are appended alphabetically
    const unorderedFiles = mdFiles
      .filter((f) => !order.includes(f))
      .sort((a, b) => a.localeCompare(b));

    const finalOrder = [...order, ...unorderedFiles];

    await this.writeOrderFile(projectSlug, laneSlug, finalOrder);
  }
}
