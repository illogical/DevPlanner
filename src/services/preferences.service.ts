import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { Preferences } from '../types';

/**
 * Service for managing workspace-level preferences
 */
export class PreferencesService {
  private workspacePath: string;
  private preferencesPath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.preferencesPath = join(workspacePath, '_preferences.json');
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(): Preferences {
    return {
      lastSelectedProject: null,
    };
  }

  /**
   * Load preferences from disk
   */
  async getPreferences(): Promise<Preferences> {
    try {
      const content = await readFile(this.preferencesPath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      // If file doesn't exist, return defaults
      if (error.code === 'ENOENT') {
        return this.getDefaultPreferences();
      }
      throw error;
    }
  }

  /**
   * Save preferences to disk
   */
  async savePreferences(preferences: Preferences): Promise<void> {
    const content = JSON.stringify(preferences, null, 2);
    await writeFile(this.preferencesPath, content, 'utf-8');
  }

  /**
   * Update only specific preference fields (partial update)
   */
  async updatePreferences(updates: Partial<Preferences>): Promise<Preferences> {
    const current = await this.getPreferences();
    const updated = { ...current, ...updates };
    await this.savePreferences(updated);
    return updated;
  }

  /**
   * Get the last selected project slug
   */
  async getLastSelectedProject(): Promise<string | null> {
    const prefs = await this.getPreferences();
    return prefs.lastSelectedProject;
  }

  /**
   * Set the last selected project slug
   */
  async setLastSelectedProject(projectSlug: string | null): Promise<void> {
    await this.updatePreferences({ lastSelectedProject: projectSlug });
  }
}
