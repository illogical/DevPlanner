import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import type { ProjectConfig, ProjectSummary, LaneConfig } from '../types';
import { slugify } from '../utils/slug';

/**
 * Service for managing projects in the workspace.
 */
export class ProjectService {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Get default lane configuration for new projects
   */
  private getDefaultLanes(): Record<string, LaneConfig> {
    return {
      '01-upcoming': {
        displayName: 'Upcoming',
        color: '#6b7280',
        collapsed: false,
      },
      '02-in-progress': {
        displayName: 'In Progress',
        color: '#3b82f6',
        collapsed: false,
      },
      '03-complete': {
        displayName: 'Complete',
        color: '#22c55e',
        collapsed: true,
      },
      '04-archive': {
        displayName: 'Archive',
        color: '#9ca3af',
        collapsed: true,
      },
    };
  }

  /**
   * Count cards in each lane for a project
   */
  private async countCardsInLanes(
    projectPath: string,
    lanes: Record<string, LaneConfig>
  ): Promise<Record<string, number>> {
    const cardCounts: Record<string, number> = {};

    for (const laneSlug of Object.keys(lanes)) {
      const lanePath = join(projectPath, laneSlug);
      try {
        const files = await readdir(lanePath);
        // Count .md files only
        cardCounts[laneSlug] = files.filter((f) => f.endsWith('.md')).length;
      } catch {
        // Lane folder doesn't exist, set count to 0
        cardCounts[laneSlug] = 0;
      }
    }

    return cardCounts;
  }

  /**
   * List all projects in the workspace
   */
  async listProjects(includeArchived: boolean = false): Promise<ProjectSummary[]> {
    const entries = await readdir(this.workspacePath, { withFileTypes: true });
    const projects: ProjectSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const projectPath = join(this.workspacePath, entry.name);
      const configPath = join(projectPath, '_project.json');

      try {
        const configContent = await readFile(configPath, 'utf-8');
        const config: ProjectConfig = JSON.parse(configContent);

        // Filter archived projects if not requested
        if (!includeArchived && config.archived) {
          continue;
        }

        const cardCounts = await this.countCardsInLanes(projectPath, config.lanes);

        projects.push({
          slug: entry.name,
          ...config,
          cardCounts,
        });
      } catch {
        // Skip directories without _project.json
        continue;
      }
    }

    // Sort by created date (newest first)
    return projects.sort((a, b) => b.created.localeCompare(a.created));
  }

  /**
   * Get a single project by slug
   */
  async getProject(slug: string): Promise<ProjectConfig> {
    const configPath = join(this.workspacePath, slug, '_project.json');

    try {
      const configContent = await readFile(configPath, 'utf-8');
      return JSON.parse(configContent);
    } catch (error) {
      throw new Error(`Project not found: ${slug}`);
    }
  }

  /**
   * Create a new project
   */
  async createProject(
    name: string,
    description?: string
  ): Promise<ProjectConfig> {
    if (!name || name.trim().length === 0) {
      throw new Error('Project name is required');
    }

    const slug = slugify(name);
    if (!slug) {
      throw new Error('Invalid project name: cannot generate slug');
    }

    const projectPath = join(this.workspacePath, slug);

    // Check if project already exists
    try {
      await stat(projectPath);
      throw new Error(`Project already exists: ${slug}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Create timestamps
    const now = new Date().toISOString();

    // Create project config
    const config: ProjectConfig = {
      name,
      description,
      created: now,
      updated: now,
      archived: false,
      lanes: this.getDefaultLanes(),
    };

    // Create project directory
    await mkdir(projectPath, { recursive: true });

    // Create lane directories with empty _order.json files
    for (const laneSlug of Object.keys(config.lanes)) {
      const lanePath = join(projectPath, laneSlug);
      await mkdir(lanePath, { recursive: true });
      await writeFile(join(lanePath, '_order.json'), JSON.stringify([], null, 2));
    }

    // Write project config
    const configPath = join(projectPath, '_project.json');
    await writeFile(configPath, JSON.stringify(config, null, 2));

    return config;
  }

  /**
   * Update a project's metadata
   */
  async updateProject(
    slug: string,
    updates: Partial<ProjectConfig>
  ): Promise<ProjectConfig> {
    const config = await this.getProject(slug);

    // Apply updates
    const updatedConfig: ProjectConfig = {
      ...config,
      ...updates,
      updated: new Date().toISOString(),
    };

    // Write updated config
    const configPath = join(this.workspacePath, slug, '_project.json');
    await writeFile(configPath, JSON.stringify(updatedConfig, null, 2));

    return updatedConfig;
  }

  /**
   * Archive a project (sets archived: true)
   */
  async archiveProject(slug: string): Promise<void> {
    await this.updateProject(slug, { archived: true });
  }
}
