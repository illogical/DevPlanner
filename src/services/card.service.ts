import { readdir, readFile, writeFile, rename, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import type { Card, CardSummary, CardFrontmatter, CreateCardInput, UpdateCardInput } from '../types';
import { MarkdownService } from './markdown.service';
import { slugify } from '../utils/slug';
import { ALL_LANES, LANE_NAMES } from '../constants';
import { resourceLock } from '../utils/resource-lock';
import { resolveCardRef, slugExists, type CardLaneResult } from '../utils/card-resolver';

/**
 * Service for managing cards within projects.
 */
export class CardService {
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

    const result = [...orderedFiles, ...unorderedFiles];
    
    // Only log for the lane we care about (02-in-progress) to reduce noise
    if (lane === '02-in-progress') {
      console.log(`[CardService] getOrderedCardFilenames for ${projectSlug}/${lane}:`);
      console.log(`  _order.json contains:`, order);
      console.log(`  .md files in folder:`, mdFiles);
      console.log(`  Returning ordered list:`, result);
    }
    
    return result;
  }

  /**
   * Compute the short card identifier (e.g., "DE-12") from project prefix and card number.
   * Returns null if either value is missing (backward compat for old cards/projects).
   */
  private computeCardId(prefix: string | undefined, cardNumber: number | undefined): string | null {
    if (!prefix || cardNumber === undefined) return null;
    return `${prefix}-${cardNumber}`;
  }

  /**
   * Read the project prefix from _project.json.
   * Returns undefined if the config cannot be read or has no prefix.
   */
  private async readProjectPrefix(projectSlug: string): Promise<string | undefined> {
    const projectConfigPath = join(this.workspacePath, projectSlug, '_project.json');
    try {
      const raw = await readFile(projectConfigPath, 'utf-8');
      return (JSON.parse(raw) as { prefix?: string }).prefix;
    } catch {
      return undefined;
    }
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

    while (await slugExists(this.workspacePath, projectSlug, slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * List all cards in a project, optionally filtered by lane, since date, or staleness
   */
  async listCards(
    projectSlug: string,
    lane?: string,
    since?: string,
    staleDays?: number
  ): Promise<CardSummary[]> {
    const lanes = lane ? [lane] : ALL_LANES;

    const cards: CardSummary[] = [];

    // Read project prefix once for all cards in this call
    const prefix = await this.readProjectPrefix(projectSlug);

    const sinceTime = since ? new Date(since).getTime() : undefined;
    const staleThreshold =
      staleDays !== undefined
        ? new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).getTime()
        : undefined;

    for (const laneName of lanes) {
      const filenames = await this.getOrderedCardFilenames(projectSlug, laneName);

      for (const filename of filenames) {
        const cardPath = join(this.workspacePath, projectSlug, laneName, filename);
        try {
          const content = await readFile(cardPath, 'utf-8');
          const { frontmatter, tasks } = MarkdownService.parse(content);
          const taskProgress = MarkdownService.taskProgress(tasks);

          // Apply since filter on updated timestamp
          if (sinceTime !== undefined) {
            const updatedTime = new Date(frontmatter.updated).getTime();
            if (updatedTime < sinceTime) {
              continue;
            }
          }

          // Apply staleDays filter: keep cards whose updated is OLDER than the threshold
          if (staleThreshold !== undefined) {
            const updatedTime = new Date(frontmatter.updated).getTime();
            if (updatedTime >= staleThreshold) {
              continue; // Not stale yet
            }
          }

          cards.push({
            slug: filename.replace(/\.md$/, ''),
            filename,
            lane: laneName,
            cardId: this.computeCardId(prefix, frontmatter.cardNumber),
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
  async getCard(projectSlug: string, cardRef: string): Promise<Card> {
    const result = await this.findCardLane(projectSlug, cardRef);
    if (!result) {
      throw new Error(`Card '${cardRef}' not found in project '${projectSlug}'`);
    }

    const { lane, slug } = result;
    const cardPath = join(this.workspacePath, projectSlug, lane, `${slug}.md`);
    const content = await readFile(cardPath, 'utf-8');
    const { frontmatter, content: body, tasks } = MarkdownService.parse(content);

    const prefix = await this.readProjectPrefix(projectSlug);

    return {
      slug,
      filename: `${slug}.md`,
      lane,
      cardId: this.computeCardId(prefix, frontmatter.cardNumber),
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

    const lane = data.lane || LANE_NAMES.UPCOMING;
    const baseSlug = slugify(data.title);
    const slug = await this.generateUniqueSlug(projectSlug, baseSlug);
    const filename = `${slug}.md`;

    const now = new Date().toISOString();

    const frontmatter: CardFrontmatter = {
      title: data.title,
      created: now,
      updated: now,
      version: 1,
    };

    if (data.description) frontmatter.description = data.description;
    if (data.status) frontmatter.status = data.status;
    if (data.priority) frontmatter.priority = data.priority;
    if (data.assignee) frontmatter.assignee = data.assignee;
    if (data.tags) frontmatter.tags = data.tags;
    if (data.blockedReason !== undefined) frontmatter.blockedReason = data.blockedReason;

    // Acquire locks for project config and lane order atomically.
    const release = await resourceLock.acquireMultiple([
      `${projectSlug}:config`,
      `${projectSlug}:order:${lane}`,
    ]);

    let cardPrefix: string | undefined;
    try {
      // Assign card number from project config and capture prefix
      const projectConfigPath = join(this.workspacePath, projectSlug, '_project.json');
      try {
        const projectConfigRaw = await readFile(projectConfigPath, 'utf-8');
        const projectConfig = JSON.parse(projectConfigRaw);

        cardPrefix = projectConfig.prefix as string | undefined;

        if (projectConfig.nextCardNumber !== undefined) {
          frontmatter.cardNumber = projectConfig.nextCardNumber;
          projectConfig.nextCardNumber += 1;
          projectConfig.updated = new Date().toISOString();
          await writeFile(projectConfigPath, JSON.stringify(projectConfig, null, 2));
        }
      } catch (error) {
        // If project config can't be read, skip card number assignment
        console.error('Failed to assign card number:', error);
      }

      const markdown = MarkdownService.serialize(frontmatter, data.content ?? '');

      // Write the card file
      const cardPath = join(this.workspacePath, projectSlug, lane, filename);
      await writeFile(cardPath, markdown);

      // Add to order file
      const order = await this.readOrderFile(projectSlug, lane);
      order.push(filename);
      await this.writeOrderFile(projectSlug, lane, order);
    } finally {
      release();
    }

    const initialContent = data.content ?? '';
    return {
      slug,
      filename,
      lane,
      cardId: this.computeCardId(cardPrefix, frontmatter.cardNumber),
      frontmatter,
      content: initialContent,
      tasks: MarkdownService.parseTasks(initialContent),
    };
  }

  /**
   * Update card metadata and/or content
   */
  async updateCard(
    projectSlug: string,
    cardRef: string,
    updates: UpdateCardInput
  ): Promise<Card> {
    // Find which lane the card lives in before acquiring the lock.
    const result = await this.findCardLane(projectSlug, cardRef);
    if (!result) {
      throw new Error(`Card '${cardRef}' not found in project '${projectSlug}'`);
    }

    const { lane, slug } = result;
    const release = await resourceLock.acquire(`${projectSlug}:card:${slug}`);
    try {
      const cardPath = join(this.workspacePath, projectSlug, lane, `${slug}.md`);
      const cardContent = await readFile(cardPath, 'utf-8');
      const { frontmatter, content } = MarkdownService.parse(cardContent);

      // Merge updates into frontmatter
      if (updates.title !== undefined) {
        frontmatter.title = updates.title;
      }
      if (updates.description !== undefined) {
        if (updates.description === null) {
          delete frontmatter.description;
        } else {
          frontmatter.description = updates.description;
        }
      }
      if (updates.status !== undefined) {
        if (updates.status === null) {
          delete frontmatter.status;
        } else {
          frontmatter.status = updates.status;
        }
      }
      if (updates.priority !== undefined) {
        if (updates.priority === null) {
          delete frontmatter.priority;
        } else {
          frontmatter.priority = updates.priority;
        }
      }
      if (updates.assignee !== undefined) {
        if (updates.assignee === null) {
          delete frontmatter.assignee;
        } else {
          frontmatter.assignee = updates.assignee;
        }
      }
      if (updates.tags !== undefined) {
        if (updates.tags === null) {
          delete frontmatter.tags;
        } else {
          frontmatter.tags = updates.tags;
        }
      }
      if (updates.blockedReason !== undefined) {
        if (updates.blockedReason === null) {
          delete frontmatter.blockedReason;
        } else {
          frontmatter.blockedReason = updates.blockedReason;
        }
      }

      // Update content body if provided, preserving any existing tasks section
      let finalContent = content;
      if (updates.content !== undefined) {
        const newTasks = MarkdownService.parseTasks(updates.content);
        if (newTasks.length === 0) {
          // New content has no tasks — preserve the existing tasks section
          const tasksSectionMatch = content.match(/(\n*## Tasks\n[\s\S]*)$/m);
          if (tasksSectionMatch) {
            finalContent = updates.content.trimEnd() + tasksSectionMatch[0];
          } else {
            const existingTasks = MarkdownService.parseTasks(content);
            if (existingTasks.length > 0) {
              const taskLines = content.split('\n').filter((l) => /^\s*-\s+\[[ xX]\]/.test(l));
              finalContent = updates.content.trimEnd() + '\n\n## Tasks\n' + taskLines.join('\n');
            } else {
              finalContent = updates.content;
            }
          }
        } else {
          finalContent = updates.content;
        }
      }

      // Update timestamp and increment version
      frontmatter.updated = new Date().toISOString();
      frontmatter.version = (frontmatter.version ?? 1) + 1;

      // Serialize and write back to disk
      const markdown = MarkdownService.serialize(frontmatter, finalContent);
      await writeFile(cardPath, markdown);

      // Parse tasks from the final content
      const tasks = MarkdownService.parseTasks(finalContent);

      const prefix = await this.readProjectPrefix(projectSlug);

      return {
        slug,
        filename: `${slug}.md`,
        lane,
        cardId: this.computeCardId(prefix, frontmatter.cardNumber),
        frontmatter,
        content: finalContent,
        tasks,
      };
    } finally {
      release();
    }
  }

  /**
   * Archive a card (move to archive lane)
   */
  async archiveCard(projectSlug: string, cardRef: string): Promise<void> {
    await this.moveCard(projectSlug, cardRef, LANE_NAMES.ARCHIVE);
  }

  /**
   * Permanently delete a card from disk
   */
  async deleteCard(projectSlug: string, cardRef: string): Promise<void> {
    const result = await this.findCardLane(projectSlug, cardRef);
    if (!result) {
      throw new Error(`Card '${cardRef}' not found in project '${projectSlug}'`);
    }

    const { lane, slug } = result;
    const filename = `${slug}.md`;
    const release = await resourceLock.acquireMultiple([
      `${projectSlug}:card:${slug}`,
      `${projectSlug}:order:${lane}`,
    ]);
    try {
      const cardPath = join(this.workspacePath, projectSlug, lane, filename);
      await unlink(cardPath);

      const order = await this.readOrderFile(projectSlug, lane);
      const updatedOrder = order.filter((f) => f !== filename);
      await this.writeOrderFile(projectSlug, lane, updatedOrder);
    } finally {
      release();
    }
  }

  /**
   * Move a card to a different lane, optionally at a specific position
   */
  async moveCard(
    projectSlug: string,
    cardRef: string,
    targetLane: string,
    position?: number
  ): Promise<Card> {
    const result = await this.findCardLane(projectSlug, cardRef);
    if (!result) {
      throw new Error(`Card '${cardRef}' not found in project '${projectSlug}'`);
    }

    const { lane: sourceLane, slug } = result;

    // Acquire all required locks in sorted order to prevent deadlocks.
    const lockKeys = [
      `${projectSlug}:card:${slug}`,
      `${projectSlug}:order:${sourceLane}`,
    ];
    if (targetLane !== sourceLane) {
      lockKeys.push(`${projectSlug}:order:${targetLane}`);
    }
    const release = await resourceLock.acquireMultiple(lockKeys);

    try {
      const filename = `${slug}.md`;
      const sourcePath = join(this.workspacePath, projectSlug, sourceLane, filename);
      const targetPath = join(this.workspacePath, projectSlug, targetLane, filename);

      // Read the card to update its timestamp and version
      const cardContent = await readFile(sourcePath, 'utf-8');
      const { frontmatter, content } = MarkdownService.parse(cardContent);

      frontmatter.updated = new Date().toISOString();
      frontmatter.version = (frontmatter.version ?? 1) + 1;
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
      } else if (sourceLane !== targetLane) {
        // Cross-lane move without explicit position: prepend so the moved card appears first
        targetOrder.unshift(filename);
      } else {
        targetOrder.push(filename);
      }

      await this.writeOrderFile(projectSlug, targetLane, targetOrder);

      const tasks = MarkdownService.parseTasks(content);
      const prefix = await this.readProjectPrefix(projectSlug);

      return {
        slug,
        filename,
        lane: targetLane,
        cardId: this.computeCardId(prefix, frontmatter.cardNumber),
        frontmatter,
        content,
        tasks,
      };
    } finally {
      release();
    }
  }

  /**
   * Reorder cards within a lane
   */
  async reorderCards(
    projectSlug: string,
    laneSlug: string,
    order: string[]
  ): Promise<void> {
    console.log(`[CardService] Reordering cards in ${projectSlug}/${laneSlug}`);
    console.log(`[CardService] New order:`, order);

    const release = await resourceLock.acquire(`${projectSlug}:order:${laneSlug}`);
    try {
      // Get all actual files in the lane
      const lanePath = join(this.workspacePath, projectSlug, laneSlug);
      let files: string[];
      try {
        files = await readdir(lanePath);
      } catch {
        throw new Error(`Lane not found: ${laneSlug}`);
      }

      const mdFiles = files.filter((f) => f.endsWith('.md'));
      console.log(`[CardService] Files currently in lane:`, mdFiles);

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
      console.log(`[CardService] Writing final order to _order.json:`, finalOrder);

      await this.writeOrderFile(projectSlug, laneSlug, finalOrder);
      console.log(`[CardService] Order file written successfully`);
    } finally {
      release();
    }
  }
}
