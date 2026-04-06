import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { ALL_LANES } from '../constants';
import { MarkdownService } from '../services/markdown.service';

/** Regex matching card IDs: DEV-42, dev42, dev-42, DEV42 */
const CARD_ID_REGEX = /^([A-Za-z]+)-?(\d+)$/;

export interface CardLaneResult {
  lane: string;
  slug: string;
}

/**
 * Resolve a cardRef (slug or card ID) to its lane and canonical slug.
 *
 * Resolution order:
 *   1. Slug lookup — check if `{cardRef}.md` exists in any lane.
 *   2. ID lookup — if cardRef matches the card ID pattern (e.g. DEV-42, dev42),
 *      scan all cards in the project to find the one with a matching cardNumber.
 *
 * @returns { lane, slug } if found; null otherwise.
 */
export async function resolveCardRef(
  workspacePath: string,
  projectSlug: string,
  cardRef: string
): Promise<CardLaneResult | null> {
  const projectPath = join(workspacePath, projectSlug);

  // 1. Slug-based lookup
  for (const laneName of ALL_LANES) {
    const cardPath = join(projectPath, laneName, `${cardRef}.md`);
    try {
      await readFile(cardPath);
      return { lane: laneName, slug: cardRef };
    } catch {
      // not in this lane
    }
  }

  // 2. Card ID-based lookup
  const idMatch = CARD_ID_REGEX.exec(cardRef);
  if (!idMatch) {
    return null;
  }

  const cardNumber = parseInt(idMatch[2], 10);

  for (const laneName of ALL_LANES) {
    const lanePath = join(projectPath, laneName);
    let files: string[];
    try {
      files = await readdir(lanePath);
    } catch {
      continue;
    }

    for (const filename of files) {
      if (!filename.endsWith('.md')) continue;
      try {
        const raw = await readFile(join(lanePath, filename), 'utf-8');
        const { frontmatter } = MarkdownService.parse(raw);
        if (frontmatter.cardNumber === cardNumber) {
          return { lane: laneName, slug: filename.replace(/\.md$/, '') };
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  return null;
}

/**
 * Check whether a slug filename already exists in any lane of the project.
 * Pure file-existence check — does NOT attempt card ID resolution.
 * Used by generateUniqueSlug to avoid false positives (e.g. slug "mp-1"
 * should not match card MP-1 via ID lookup).
 */
export async function slugExists(
  workspacePath: string,
  projectSlug: string,
  slug: string
): Promise<boolean> {
  const projectPath = join(workspacePath, projectSlug);
  for (const laneName of ALL_LANES) {
    const cardPath = join(projectPath, laneName, `${slug}.md`);
    try {
      await readFile(cardPath);
      return true;
    } catch {
      // not here
    }
  }
  return false;
}
