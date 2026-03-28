import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');

export type PromptTokens = Record<string, string>;

/**
 * Loads prompt templates from the `src/prompts/` directory and performs
 * simple `{{token}}` replacement.
 *
 * Files must be `.md` — pass the stem (e.g. `"dispatch-system"`) not the
 * full filename.
 */
export class PromptLoader {
  private static cache = new Map<string, string>();

  /**
   * Load and render a prompt template.
   *
   * @param name   Template stem (e.g. `"dispatch-system"`)
   * @param tokens Key-value map for `{{token}}` substitution
   */
  static async load(name: string, tokens: PromptTokens = {}): Promise<string> {
    const template = await this.readTemplate(name);
    return this.render(template, tokens);
  }

  /**
   * Read a template file (with in-memory cache).
   */
  private static async readTemplate(name: string): Promise<string> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }
    const filePath = join(PROMPTS_DIR, `${name}.md`);
    const content = await readFile(filePath, 'utf-8');
    this.cache.set(name, content);
    return content;
  }

  /**
   * Replace `{{token}}` placeholders with values from the tokens map.
   * Unknown tokens are left unchanged.
   */
  static render(template: string, tokens: PromptTokens): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : match;
    });
  }

  /** Clear the in-memory template cache (useful for tests). */
  static clearCache(): void {
    this.cache.clear();
  }
}
