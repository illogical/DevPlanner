# Card Identifiers

## Context

Cards in DevPlanner currently use slugs derived from their titles (e.g., `video-upload-pipeline`) as their only identifier. These are long, not sequential, and difficult to reference in human or AI conversation. This feature adds short, project-scoped identifiers like `MA-3` (project prefix + sequential number) to make cards easy to reference.

## Design

### Identifier Format

```
{PROJECT_PREFIX}-{CARD_NUMBER}
```

Examples:
- "Memory API" project: `MA-1`, `MA-2`, `MA-3`
- "Media Manager" project: `MM-1`, `MM-2`, `MM-3`
- "LM API" project: `LA-1`, `LA-2`

### Prefix Generation Rules

1. Take the first letter of each word in the project name, uppercase
2. Max 4 characters
3. Single-word names use first 2 letters (e.g., "DevPlanner" -> "DP")
4. **Prefixes must be unique across all projects** — if auto-generated prefix collides with an existing project, try variations:
   - Use more letters from each word (e.g., "My App" -> "MA" taken, try "MYA")
   - If still colliding, append a digit (e.g., "MA2")

### Storage

- `prefix` and `nextCardNumber` stored in `_project.json`
- `cardNumber` stored in each card's YAML frontmatter
- Both fields are optional (`?`) for backward compatibility

---

## Implementation

### Step 1: Backend Types

**File: `src/types/index.ts`**

Add `prefix` and `nextCardNumber` to `ProjectConfig`:

```typescript
export interface ProjectConfig {
  name: string;
  description?: string;
  created: string;
  updated: string;
  archived: boolean;
  lanes: Record<string, LaneConfig>;
  prefix?: string;         // 2-4 uppercase chars, unique across projects
  nextCardNumber?: number;  // Auto-incrementing counter, starts at 1
}
```

Add `cardNumber` to `CardFrontmatter`:

```typescript
export interface CardFrontmatter {
  title: string;
  status?: 'in-progress' | 'blocked' | 'review' | 'testing';
  priority?: 'low' | 'medium' | 'high';
  assignee?: 'user' | 'agent';
  created: string;
  updated: string;
  tags?: string[];
  cardNumber?: number;  // Sequential within project
}
```

### Step 2: Prefix Generation Utility

**File: `src/utils/prefix.ts`** (new)

```typescript
/**
 * Generate a unique project prefix from a project name.
 * Takes the first letter of each word, uppercase, max 4 chars.
 * Single-word names use first 2 letters.
 *
 * If the generated prefix collides with existing ones, tries variations:
 * 1. Use more letters from words (e.g., "My App" -> "MYA")
 * 2. Append digit (e.g., "MA2")
 */
export function generatePrefix(name: string, existingPrefixes: string[] = []): string {
  const words = name.trim().split(/\s+/).filter(w => w.length > 0);

  // Generate base prefix
  let prefix: string;
  if (words.length === 1) {
    prefix = words[0].substring(0, 2).toUpperCase();
  } else {
    prefix = words
      .map(w => w.charAt(0).toUpperCase())
      .join('')
      .substring(0, 4);
  }

  // Check uniqueness
  if (!existingPrefixes.includes(prefix)) {
    return prefix;
  }

  // Variation 1: Use more letters from words
  if (words.length > 1) {
    for (let chars = 2; chars <= 3; chars++) {
      const variation = words
        .map(w => w.substring(0, chars).toUpperCase())
        .join('')
        .substring(0, 4);
      if (!existingPrefixes.includes(variation)) {
        return variation;
      }
    }
  }

  // Variation 2: Append digit
  let counter = 2;
  while (existingPrefixes.includes(`${prefix}${counter}`)) {
    counter++;
  }
  return `${prefix}${counter}`;
}
```

Add unit tests in `src/__tests__/prefix.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { generatePrefix } from '../utils/prefix';

describe('generatePrefix', () => {
  test('multi-word names use first letters', () => {
    expect(generatePrefix('Memory API')).toBe('MA');
    expect(generatePrefix('Media Manager')).toBe('MM');
  });

  test('single-word names use first 2 letters', () => {
    expect(generatePrefix('DevPlanner')).toBe('DE');
  });

  test('max 4 characters', () => {
    expect(generatePrefix('My Very Long Project Name')).toBe('MVLP');
  });

  test('collision avoidance with more letters', () => {
    expect(generatePrefix('Memory API', ['MA'])).not.toBe('MA');
  });

  test('collision avoidance with digit suffix', () => {
    const existing = ['MA', 'MEA', 'MEMA'];
    const result = generatePrefix('Memory API', existing);
    expect(result).toBe('MA2');
  });
});
```

### Step 3: ProjectService Changes

**File: `src/services/project.service.ts`**

In `createProject()` method, after building the config object (around line 133), add prefix generation:

```typescript
import { generatePrefix } from '../utils/prefix';

// In createProject(), before building the config:
// Get existing prefixes for uniqueness check
const existingProjects = await this.listProjects(true); // include archived
const existingPrefixes = existingProjects
  .map(p => p.prefix)
  .filter((p): p is string => !!p);

const prefix = generatePrefix(name, existingPrefixes);

const config: ProjectConfig = {
  name,
  description,
  created: now,
  updated: now,
  archived: false,
  lanes: this.getDefaultLanes(),
  prefix,
  nextCardNumber: 1,
};
```

### Step 4: CardService Changes

**File: `src/services/card.service.ts`**

In `createCard()` method (around line 185), after building the frontmatter object, add card number assignment:

```typescript
// After building frontmatter, before writing the file:
// Assign card number from project config
const projectConfigPath = join(this.workspacePath, projectSlug, '_project.json');
try {
  const projectConfigRaw = await readFile(projectConfigPath, 'utf-8');
  const projectConfig = JSON.parse(projectConfigRaw);

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
```

No changes needed to `listCards()`, `getCard()`, or `updateCard()` — `cardNumber` is stored in YAML frontmatter and automatically parsed by `gray-matter`.

### Step 5: Migration Script

**File: `scripts/migrate-card-ids.ts`** (new)

```typescript
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { ConfigService } from '../src/services/config.service';
import { ProjectService } from '../src/services/project.service';
import { CardService } from '../src/services/card.service';
import { MarkdownService } from '../src/services/markdown.service';
import { generatePrefix } from '../src/utils/prefix';
import { ALL_LANES } from '../src/constants';

const config = ConfigService.getInstance();
const workspacePath = config.workspacePath;
const projectService = new ProjectService(workspacePath);
const cardService = new CardService(workspacePath);

async function migrate() {
  console.log('Migrating card identifiers...\n');

  const projects = await projectService.listProjects(true);
  const existingPrefixes: string[] = [];

  for (const project of projects) {
    console.log(`Project: ${project.name} (${project.slug})`);

    // Step 1: Assign prefix if missing
    let prefix = project.prefix;
    if (!prefix) {
      prefix = generatePrefix(project.name, existingPrefixes);
      console.log(`  Assigning prefix: ${prefix}`);
    }
    existingPrefixes.push(prefix);

    // Step 2: Collect all cards across all lanes, sorted by created date
    const allCards: Array<{
      slug: string;
      lane: string;
      frontmatter: any;
      content: string;
      created: string;
    }> = [];

    for (const lane of ALL_LANES) {
      const lanePath = join(workspacePath, project.slug, lane);
      let files: string[];
      try {
        files = await readdir(lanePath);
      } catch {
        continue;
      }

      for (const file of files.filter(f => f.endsWith('.md'))) {
        const cardPath = join(lanePath, file);
        const raw = await readFile(cardPath, 'utf-8');
        const { frontmatter, content } = MarkdownService.parse(raw);
        allCards.push({
          slug: file.replace(/\.md$/, ''),
          lane,
          frontmatter,
          content,
          created: frontmatter.created,
        });
      }
    }

    // Sort by created date (ascending)
    allCards.sort((a, b) => a.created.localeCompare(b.created));

    // Step 3: Assign sequential numbers (skip cards that already have one)
    let nextNumber = 1;
    for (const card of allCards) {
      if (card.frontmatter.cardNumber !== undefined) {
        // Already has a number, track the max
        nextNumber = Math.max(nextNumber, card.frontmatter.cardNumber + 1);
        continue;
      }

      card.frontmatter.cardNumber = nextNumber;
      nextNumber++;

      // Write updated card back to disk
      const markdown = MarkdownService.serialize(card.frontmatter, card.content);
      const cardPath = join(workspacePath, project.slug, card.lane, `${card.slug}.md`);
      await writeFile(cardPath, markdown);

      console.log(`  ${prefix}-${card.frontmatter.cardNumber}: ${card.frontmatter.title}`);
    }

    // Step 4: Update _project.json with prefix and nextCardNumber
    const configPath = join(workspacePath, project.slug, '_project.json');
    const configRaw = await readFile(configPath, 'utf-8');
    const projectConfig = JSON.parse(configRaw);
    projectConfig.prefix = prefix;
    projectConfig.nextCardNumber = nextNumber;
    projectConfig.updated = new Date().toISOString();
    await writeFile(configPath, JSON.stringify(projectConfig, null, 2));

    console.log(`  Total cards: ${allCards.length}, Next number: ${nextNumber}\n`);
  }

  console.log('Migration complete!');
}

migrate().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
```

Add to `package.json` scripts:

```json
"migrate:card-ids": "bun run scripts/migrate-card-ids.ts"
```

### Step 6: Seed Script Update

**File: `src/seed.ts`**

The seed script calls `projectService.createProject()` and `cardService.createCard()`. After Step 3 and Step 4 above, newly created projects will automatically get a prefix and card numbers. No direct changes to the seed script are needed — the service layer handles it.

However, when the seed script deletes and re-creates projects, the prefix uniqueness check will work correctly since it checks existing projects.

### Step 7: Frontend Types

**File: `frontend/src/types/index.ts`**

Add the same fields as the backend:

```typescript
export interface ProjectConfig {
  // ... existing fields ...
  prefix?: string;
  nextCardNumber?: number;
}

export interface CardFrontmatter {
  // ... existing fields ...
  cardNumber?: number;
}
```

### Step 8: CardPreview — Display Identifier

**File: `frontend/src/components/kanban/CardPreview.tsx`**

Add prefix lookup and display in the card header:

```tsx
// At top of CardPreview component, add:
import { useStore } from '../../store';

// Inside the component function:
const projectPrefix = useStore(
  state => state.projects.find(p => p.slug === projectSlug)?.prefix
);

const cardId = (projectPrefix && card.frontmatter.cardNumber)
  ? `${projectPrefix}-${card.frontmatter.cardNumber}`
  : null;
```

In the JSX, modify the title section (around line 108):

```tsx
{/* Header: Title + Task Count */}
<div className="flex items-start justify-between gap-3 mb-3">
  <h3 className="text-sm font-medium text-gray-100 line-clamp-2 leading-snug min-w-0">
    {cardId && (
      <span className="text-gray-500 font-mono text-xs mr-1.5">{cardId}</span>
    )}
    {card.frontmatter.title}
  </h3>
  {/* ... task count badge unchanged ... */}
</div>
```

Note: `projectSlug` is already available as a prop on `CardPreview`.

### Step 9: CardDetailHeader — Display Identifier

**File: `frontend/src/components/card-detail/CardDetailHeader.tsx`**

Add identifier display above the title:

```tsx
import { useStore } from '../../store';

export function CardDetailHeader({ card, onClose }: CardDetailHeaderProps) {
  const activeProjectSlug = useStore(state => state.activeProjectSlug);
  const projectPrefix = useStore(
    state => state.projects.find(p => p.slug === state.activeProjectSlug)?.prefix
  );

  const cardId = (projectPrefix && card.frontmatter.cardNumber)
    ? `${projectPrefix}-${card.frontmatter.cardNumber}`
    : null;

  return (
    <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 z-10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {cardId && (
            <span className="text-sm text-gray-500 font-mono">{cardId}</span>
          )}
          <h2 className="text-xl font-semibold text-gray-100 mb-1">
            {card.frontmatter.title}
          </h2>
          <p className="text-sm text-gray-500">
            {laneDisplayNames[card.lane] || card.lane}
          </p>
        </div>
        <IconButton label="Close panel" onClick={onClose}>
          {/* ... SVG unchanged ... */}
        </IconButton>
      </div>
    </div>
  );
}
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `prefix`, `nextCardNumber` to `ProjectConfig`; `cardNumber` to `CardFrontmatter` |
| `src/utils/prefix.ts` | **NEW** — Prefix generation with uniqueness checking |
| `src/__tests__/prefix.test.ts` | **NEW** — Unit tests for prefix generation |
| `src/services/project.service.ts` | Add prefix generation to `createProject()` |
| `src/services/card.service.ts` | Add card number assignment to `createCard()` |
| `scripts/migrate-card-ids.ts` | **NEW** — Migration script for existing cards |
| `frontend/src/types/index.ts` | Mirror backend type additions |
| `frontend/src/components/kanban/CardPreview.tsx` | Display `{prefix}-{number}` before title |
| `frontend/src/components/card-detail/CardDetailHeader.tsx` | Display identifier above title |

## Verification

1. **Run migration**: `bun run migrate:card-ids` — verify all existing cards get sequential numbers and projects get prefixes
2. **Create a new card**: Verify it gets the next sequential number and displays the ID in both the card preview and detail panel
3. **Check uniqueness**: Create two projects with names that would generate the same prefix — verify the second gets a different one
4. **Backward compatibility**: Verify cards without `cardNumber` render without errors (no empty ID shown)
5. **Run tests**: `bun test --filter "prefix"` to verify prefix generation logic
