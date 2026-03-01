# Search Palette

## Context

DevPlanner has basic board-level search: an inline header input that highlights matching card titles and task text. It does not surface results in an interactive list, does not search descriptions, files, or links, and offers no keyboard-driven navigation.

This feature replaces that with a **command-palette overlay** — a keyboard-driven, real-time search UI inspired by VS Code's Command Palette, JetBrains Search Everywhere, and Raycast.

**Existing code that is being replaced / extended:**
- `frontend/src/components/layout/Header.tsx` — inline search input will become a trigger button
- `GET /api/projects/:slug/cards/search?q=` — basic title+task search; kept backward-compatible, a new richer endpoint is added alongside it
- `searchQuery`, `searchResults`, `isSearching`, `setSearchQuery`, `clearSearch`, `isCardHighlighted`, `getMatchedTaskIndices` in the Zustand store — retained for board-level highlighting; palette gets its own parallel state

---

## Design

### Trigger
- **Keyboard shortcut:** `Ctrl+K` (Windows/Linux) / `Cmd+K` (Mac)
- Fires from any focusable state, including text inputs (re-binding overrides browser defaults that are unused)
- The header search input is removed; the header center area becomes a `SearchTriggerButton` — a styled chip displaying "Search…" and the shortcut hint `⌘K` / `Ctrl+K`

### Overlay layout

```
┌─────────────────────────────────────────────────────────────┐
│   🔍  Search DevPlanner…                    [This project ▾]│  ← input + scope toggle
├─────────────────────────────────────────────────────────────┤
│  [All]  [Cards]  [Tasks]  [Files]  [Links]                  │  ← type filter tabs
├─────────────────────────────────────────────────────────────┤
│  CARDS  ·  3                                                │
│  ▸ [Card]        Authentication Flow          In Progress   │
│  ▸ [Description] …implements auth flow using JWT tokens…    │
│                                                             │
│  TASKS  ·  2                                                │
│  ▸ [Task]        Implement JWT refresh logic  MP-04         │
│  ▸ [Task]        Write auth integration test  MP-07         │
│                                                             │
│  FILES  ·  1                                                │
│  ▸ [File]        auth-spec.md                MP-04         │
└─────────────────────────────────────────────────────────────┘
```

- Full-screen dimmed backdrop (`bg-black/60`, `backdrop-blur-sm`)
- Centered panel, max-width `640px`, max-height `70vh`, scrollable result list
- Framer Motion `AnimatePresence` — slide-down + fade-in on open, fade-out on close
- Focus is trapped inside the palette while open

### Keyboard model

| Key | Action |
|-----|--------|
| `Ctrl+K` / `Cmd+K` | Open palette (anywhere on page) |
| `Esc` | Close palette, clear query |
| `↑` / `↓` | Move selection through the flat list of visible results |
| `Enter` | Activate selected result → navigate to target |
| `Tab` | Advance to next filter tab |
| `Shift+Tab` | Go to previous filter tab |
| Click result | Activate (same as Enter) |

### Search scope toggle

A `<select>` or small pill button in the top-right of the input row toggles between:
- **This project** (default) — queries only `activeProjectSlug`
- **All projects** — queries the global search endpoint; results include a project badge in the subtitle

The scope toggle re-executes the current query immediately.

### Result types and labels

| Label chip | Color | What it matches |
|------------|-------|----------------|
| `Card` | blue | Card title, card identifier (e.g. `MP-42`) |
| `Task` | purple | Checklist item text |
| `Description` | teal | Card body / Markdown content |
| `Tag` | green | Tag values |
| `Assignee` | orange | Assignee field value |
| `File` | yellow | Attached file name |
| `File Desc` | amber | Attached file description |
| `Link` | sky | Link URL (hostname shown) |
| `Link Label` | indigo | Link display title |
| `Link Desc` | violet | Link description field |

### Filter tabs
- **All** — all result types
- **Cards** — types: `card`, `description`, `tag`, `assignee`
- **Tasks** — types: `task`
- **Files** — types: `file`, `file-description`
- **Links** — types: `link`, `link-label`, `link-description`

### Grouping
Results are grouped by type. Each group shows a section header with the label and count. Within a group, results are ordered by score descending. Max **5 results per group** initially; a "Show N more…" row expands the group.

### Inline snippet
For `description`, `task`, `file-description`, and `link-description` results, a second line beneath the primary text shows a 120-character excerpt with the matched substring wrapped in `<mark>`.

### Navigation behavior after result activation

| Result type | Action |
|-------------|--------|
| `card` | Switch to card's project (if global), ensure lane is visible, open card detail panel |
| `description` | Open card detail panel, set `detailScrollTarget = { section: 'description' }` |
| `task` | Open card detail panel, set `detailScrollTarget = { section: 'tasks', taskIndex: N }` |
| `tag` / `assignee` | Open card detail panel, set `detailScrollTarget = { section: 'metadata' }` |
| `file` / `file-description` | Open card detail panel, set `detailScrollTarget = { section: 'files', filename: '...' }` |
| `link` / `link-label` / `link-description` | Open card detail panel, set `detailScrollTarget = { section: 'links', linkId: '...' }` |

`detailScrollTarget` is a Zustand field that card-detail section components watch. On mount / change they scroll into view and apply a 2-second amber pulse animation, then clear the target.

---

## Implementation Plan

### Step 1 — Backend: new types (`src/types/index.ts`)

Add after the existing `SearchResult` / `SearchResponse` interfaces:

```typescript
export type PaletteResultType =
  | 'card'
  | 'task'
  | 'description'
  | 'tag'
  | 'assignee'
  | 'file'
  | 'file-description'
  | 'link'
  | 'link-label'
  | 'link-description';

export interface PaletteSearchResult {
  type: PaletteResultType;
  cardSlug: string;
  cardTitle: string;       // Always present — used for subtitle context
  cardId?: string;         // e.g. "MP-42"
  laneSlug: string;
  projectSlug: string;
  // Type-specific identifiers for navigation
  taskIndex?: number;
  fileFilename?: string;
  linkId?: string;
  // Display
  primaryText: string;     // The main matched text (title, task text, file name, etc.)
  snippet?: string;        // 120-char excerpt with match context (for desc/task/file-desc/link-desc)
  score: number;           // Higher is better
}

export interface PaletteSearchResponse {
  results: PaletteSearchResult[];
  query: string;
  projectSlug: string;
  totalCount: number;
}

export interface GlobalPaletteSearchResponse {
  results: PaletteSearchResult[];
  query: string;
  totalCount: number;
}
```

---

### Step 2 — Backend: palette search endpoint (`src/routes/cards.ts`)

Add a new route **before** the existing `/cards/search` route (which must remain before `/:cardSlug`).

`GET /api/projects/:projectSlug/search?q=&types=`

- `q` — search query (required, min 2 chars after trim)
- `types` — optional comma-separated filter (e.g. `card,task`); defaults to all

**Search scope per result type:**

| Type | Data source | Load strategy |
|------|-------------|---------------|
| `card` | `cardSummary.frontmatter.title`, `cardSummary.cardId` | `listCards()` summary pass |
| `task` | `task.text` | `getCard()` on cards with `taskProgress.total > 0` |
| `description` | `card.content` | `getCard()` on all cards (lazy, only if not already loaded) |
| `tag` | `cardSummary.frontmatter.tags[]` | summary pass |
| `assignee` | `cardSummary.frontmatter.assignee` | summary pass |
| `file` | `file.filename`, `file.originalName` | `fileService.listFiles(projectSlug)` once |
| `file-description` | `file.description` | same files pass |
| `link` | `card.frontmatter.links[].url` | summary pass (links in frontmatter) |
| `link-label` | `card.frontmatter.links[].label` | summary pass |
| `link-description` | `card.frontmatter.links[].description` | summary pass |

**Snippet extraction:** For `description`, `task`, `file-description`, `link-description` — find the first occurrence of the query string (case-insensitive), extract ±60 characters of surrounding text, ellipsize edges.

**Scoring:** Assign base scores:
- `card` title exact match: 100 · `card` substring: 80
- `task` match: 70
- `description` match: 60
- `tag`: 75 · `assignee`: 65
- `link-label`: 72 · `link`: 55 · `link-description`: 50
- `file`: 68 · `file-description`: 45

Within a type, boost if match is at the start of the string (+10).

Return results sorted by score descending, max 50 total.

**Example response:**
```json
{
  "results": [
    {
      "type": "card",
      "cardSlug": "auth-flow",
      "cardTitle": "Authentication Flow",
      "cardId": "MP-04",
      "laneSlug": "02-in-progress",
      "projectSlug": "media-manager",
      "primaryText": "Authentication Flow",
      "score": 100
    },
    {
      "type": "task",
      "cardSlug": "auth-flow",
      "cardTitle": "Authentication Flow",
      "cardId": "MP-04",
      "laneSlug": "02-in-progress",
      "projectSlug": "media-manager",
      "primaryText": "Implement JWT refresh logic",
      "taskIndex": 2,
      "score": 70
    }
  ],
  "query": "auth",
  "projectSlug": "media-manager",
  "totalCount": 2
}
```

---

### Step 3 — Backend: global search endpoint (`src/routes/search.ts`)

Create a new route file:

```
GET /api/search?q=&projects=
```

- `q` — search query
- `projects` — optional comma-separated project slugs; defaults to all non-archived projects

Implementation: call `cardService.listCards()` and `fileService.listFiles()` per project, collect all `PaletteSearchResult[]`, merge and sort by score.

Register in `src/server.ts`:
```typescript
import { searchRoutes } from './routes/search';
// ...
app.use(searchRoutes(workspacePath))
```

---

### Step 4 — Frontend: new types (`frontend/src/types/index.ts`)

Mirror the backend types. Add after existing `SearchResult`:

```typescript
export type PaletteResultType =
  | 'card' | 'task' | 'description' | 'tag' | 'assignee'
  | 'file' | 'file-description'
  | 'link' | 'link-label' | 'link-description';

export interface PaletteSearchResult {
  type: PaletteResultType;
  cardSlug: string;
  cardTitle: string;
  cardId?: string;
  laneSlug: string;
  projectSlug: string;
  taskIndex?: number;
  fileFilename?: string;
  linkId?: string;
  primaryText: string;
  snippet?: string;
  score: number;
}

export interface PaletteSearchResponse {
  results: PaletteSearchResult[];
  query: string;
  projectSlug: string;
  totalCount: number;
}

export type PaletteFilterTab = 'all' | 'cards' | 'tasks' | 'files' | 'links';

export type DetailScrollSection = 'description' | 'tasks' | 'metadata' | 'files' | 'links';

export interface DetailScrollTarget {
  section: DetailScrollSection;
  taskIndex?: number;
  filename?: string;
  linkId?: string;
}
```

---

### Step 5 — Frontend: API client (`frontend/src/api/client.ts`)

Add a new `searchApi` export:

```typescript
export const searchApi = {
  palette: (projectSlug: string, query: string, types?: string) =>
    fetchJSON<PaletteSearchResponse>(
      `${API_BASE}/projects/${projectSlug}/search?q=${encodeURIComponent(query)}${types ? `&types=${types}` : ''}`
    ),

  global: (query: string, projects?: string) =>
    fetchJSON<{ results: PaletteSearchResult[]; query: string; totalCount: number }>(
      `${API_BASE}/search?q=${encodeURIComponent(query)}${projects ? `&projects=${projects}` : ''}`
    ),
};
```

Update the import in `store/index.ts` to include `searchApi`.

---

### Step 6 — Frontend: fuzzy utility (`frontend/src/utils/fuzzy.ts`)

Used for **instant** client-side re-sorting of results as the user types before the debounced API call resolves.

```typescript
/**
 * Score how well `query` matches `text`.
 * Returns 0 if no match, higher is better.
 * Matching priority: exact match > word prefix > initials > substring.
 */
export function fuzzyScore(text: string, query: string): number {
  if (!query || !text) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;
  // Word-prefix: every query word is a prefix of a word in text
  const textWords = t.split(/\s+/);
  const queryWords = q.split(/\s+/);
  const allWordPrefixes = queryWords.every(qw => textWords.some(tw => tw.startsWith(qw)));
  if (allWordPrefixes) return 80;
  // Initials: query chars match first letter of each word
  if (q.length >= 2) {
    const initials = textWords.map(w => w[0]).join('');
    if (initials.includes(q)) return 60;
  }
  return 0;
}

/** Filter and sort results client-side by fuzzy score. */
export function fuzzyFilter<T extends { primaryText: string; score: number }>(
  results: T[],
  query: string
): T[] {
  if (!query) return results;
  return results
    .map(r => ({ ...r, score: Math.max(r.score, fuzzyScore(r.primaryText, query)) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
```

---

### Step 7 — Frontend: Zustand store additions (`frontend/src/store/index.ts`)

Add to the `DevPlannerStore` interface:

```typescript
// Search Palette
isPaletteOpen: boolean;
openPalette: () => void;
closePalette: () => void;
paletteQuery: string;
setPaletteQuery: (query: string) => void;
paletteResults: PaletteSearchResult[];
isPaletteSearching: boolean;
paletteTab: PaletteFilterTab;
setPaletteTab: (tab: PaletteFilterTab) => void;
isPaletteGlobal: boolean;
togglePaletteGlobal: () => void;
selectedPaletteIndex: number;
setSelectedPaletteIndex: (index: number) => void;
activatePaletteResult: (result: PaletteSearchResult) => Promise<void>;

// Post-navigation scroll/highlight target for card detail panel
detailScrollTarget: DetailScrollTarget | null;
setDetailScrollTarget: (target: DetailScrollTarget | null) => void;
```

Add a module-level debounce timer:
```typescript
let paletteDebounceTimer: ReturnType<typeof setTimeout> | null = null;
```

Add initial state values:
```typescript
isPaletteOpen: false,
paletteQuery: '',
paletteResults: [],
isPaletteSearching: false,
paletteTab: 'all',
isPaletteGlobal: false,
selectedPaletteIndex: 0,
detailScrollTarget: null,
```

Add action implementations:

```typescript
openPalette: () => set({ isPaletteOpen: true, paletteQuery: '', paletteResults: [], selectedPaletteIndex: 0, paletteTab: 'all' }),

closePalette: () => {
  if (paletteDebounceTimer) clearTimeout(paletteDebounceTimer);
  set({ isPaletteOpen: false, paletteQuery: '', paletteResults: [], isPaletteSearching: false });
},

setPaletteQuery: (query) => {
  set({ paletteQuery: query, selectedPaletteIndex: 0 });
  if (paletteDebounceTimer) clearTimeout(paletteDebounceTimer);
  if (!query.trim() || query.trim().length < 2) {
    set({ paletteResults: [], isPaletteSearching: false });
    return;
  }
  set({ isPaletteSearching: true });
  paletteDebounceTimer = setTimeout(async () => {
    const { activeProjectSlug, isPaletteGlobal } = get();
    try {
      let results: PaletteSearchResult[];
      if (isPaletteGlobal) {
        const resp = await searchApi.global(query.trim());
        results = resp.results;
      } else {
        if (!activeProjectSlug) return;
        const resp = await searchApi.palette(activeProjectSlug, query.trim());
        results = resp.results;
      }
      set({ paletteResults: results, isPaletteSearching: false });
    } catch (err) {
      console.error('Palette search failed:', err);
      set({ isPaletteSearching: false });
    }
  }, 150);
},

setPaletteTab: (tab) => set({ paletteTab: tab, selectedPaletteIndex: 0 }),

togglePaletteGlobal: () => {
  const newGlobal = !get().isPaletteGlobal;
  set({ isPaletteGlobal: newGlobal, selectedPaletteIndex: 0 });
  // Re-execute current query
  const query = get().paletteQuery;
  if (query.trim().length >= 2) get().setPaletteQuery(query);
},

setSelectedPaletteIndex: (index) => set({ selectedPaletteIndex: index }),

setDetailScrollTarget: (target) => set({ detailScrollTarget: target }),

activatePaletteResult: async (result) => {
  const { openCardDetail, setActiveProject, projects, setDetailScrollTarget } = get();

  // 1. Switch project if needed (global mode)
  const activeSlug = get().activeProjectSlug;
  if (result.projectSlug !== activeSlug) {
    const project = projects.find(p => p.slug === result.projectSlug);
    if (project) setActiveProject(result.projectSlug);
    // Wait for cards to load
    await get().loadCards();
  }

  // 2. Open card detail panel
  await openCardDetail(result.cardSlug);

  // 3. Set scroll target
  const target: DetailScrollTarget = (() => {
    switch (result.type) {
      case 'task':        return { section: 'tasks', taskIndex: result.taskIndex };
      case 'description': return { section: 'description' };
      case 'tag':
      case 'assignee':    return { section: 'metadata' };
      case 'file':
      case 'file-description': return { section: 'files', filename: result.fileFilename };
      case 'link':
      case 'link-label':
      case 'link-description': return { section: 'links', linkId: result.linkId };
      default:            return { section: 'description' }; // card — just open
    }
  })();
  setDetailScrollTarget(target);

  // 4. Close palette
  get().closePalette();
},
```

---

### Step 8 — Frontend: `SearchPalette.tsx` component

**File:** `frontend/src/components/search/SearchPalette.tsx` (new directory `search/`)

**Structure:**
```
SearchPalette
├── Backdrop (div, onClick → closePalette)
├── Panel (motion.div, slide-down + fade-in)
│   ├── InputRow
│   │   ├── SearchIcon
│   │   ├── <input> (autoFocus, controlled by paletteQuery)
│   │   ├── ScopeToggle (button: "This project" / "All projects")
│   │   └── EscHint (<kbd>Esc</kbd>)
│   ├── FilterTabs (All / Cards / Tasks / Files / Links)
│   ├── ResultList (scrollable)
│   │   ├── [for each visible group]
│   │   │   ├── GroupHeader (label + count badge)
│   │   │   └── [for each result in group]
│   │   │       └── ResultRow (highlighted on selectedIndex)
│   │   └── EmptyState (no results / min chars / searching spinner)
│   └── Footer (shortcut hints)
```

**Result grouping logic:**

```typescript
const TAB_TYPES: Record<PaletteFilterTab, PaletteResultType[]> = {
  all:   ['card','task','description','tag','assignee','file','file-description','link','link-label','link-description'],
  cards: ['card','description','tag','assignee'],
  tasks: ['task'],
  files: ['file','file-description'],
  links: ['link','link-label','link-description'],
};

const GROUP_ORDER: PaletteResultType[] = ['card','task','description','tag','assignee','file','file-description','link','link-label','link-description'];

// Group label display names
const TYPE_LABELS: Record<PaletteResultType, string> = {
  card: 'Card',
  task: 'Task',
  description: 'Description',
  tag: 'Tag',
  assignee: 'Assignee',
  file: 'File',
  'file-description': 'File Desc',
  link: 'Link',
  'link-label': 'Link Label',
  'link-description': 'Link Desc',
};
```

**ResultRow** displays:
- Left: label chip (colored `<span>` with type label)
- Center: primary text (with matched query substring wrapped in `<mark>`) + optional snippet line
- Right: context — card ID badge + lane name (or project name if global)
- Selection highlight: `bg-gray-700` when `index === selectedPaletteIndex`

**Keyboard handler** — `useEffect` on `isPaletteOpen`:
```typescript
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closePalette(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedPaletteIndex(Math.min(flatResults.length - 1, selectedPaletteIndex + 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedPaletteIndex(Math.max(0, selectedPaletteIndex - 1)); }
    if (e.key === 'Enter' && flatResults[selectedPaletteIndex]) activatePaletteResult(flatResults[selectedPaletteIndex]);
    if (e.key === 'Tab') { e.preventDefault(); advanceTab(e.shiftKey); }
  };
  if (isPaletteOpen) document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}, [isPaletteOpen, selectedPaletteIndex, flatResults]);
```

**Framer Motion animation:**
```tsx
<AnimatePresence>
  {isPaletteOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
      onClick={closePalette}
    >
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-[640px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ... content ... */}
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

---

### Step 9 — Frontend: global keyboard shortcut

**File:** `frontend/src/App.tsx`

Register a `useEffect` at the root level:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (isPaletteOpen) closePalette();
      else openPalette();
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [isPaletteOpen, openPalette, closePalette]);
```

Render `<SearchPalette />` near the root (alongside `<CardDetailPanel />`).

---

### Step 10 — Frontend: Header — replace search input with trigger button

**File:** `frontend/src/components/layout/Header.tsx`

Remove the entire center search `<div>` (lines 105–145 in the current file). Replace with:

```tsx
<div className="flex-1 flex justify-center px-6">
  <button
    onClick={openPalette}
    className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors w-full max-w-xs"
  >
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <span className="flex-1 text-left">Search…</span>
    <kbd className="hidden sm:inline text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
  </button>
</div>
```

Also remove `searchQuery`, `setSearchQuery`, `clearSearch`, `isSearching` from the `useStore()` destructure in `Header.tsx` since they are no longer used there. The board-level highlighting store state is still used by `CardPreview` and `CardPreviewTasks`.

Import `openPalette` from the store.

---

### Step 11 — Frontend: card detail panel scroll/highlight integration

**Concept:** `detailScrollTarget` in the store acts as a one-shot instruction to scroll and highlight a section. Components read it on mount/change, execute the scroll, pulse-animate the target, then clear it after 2 seconds.

#### 11a — `CardDetailPanel.tsx`

After `openCardDetail` resolves, the panel is already open. The scroll target is set by `activatePaletteResult`. The panel itself needs `overflow-y-auto` with a stable `ref` for scroll. Each section should have a stable `id` attribute.

Ensure sections have IDs:
- `id="card-section-description"`
- `id="card-section-tasks"`
- `id="card-section-metadata"`
- `id="card-section-files"`
- `id="card-section-links"`

#### 11b — Scroll effect hook (`frontend/src/hooks/useDetailScroll.ts`, new)

```typescript
import { useEffect } from 'react';
import { useStore } from '../store';

export function useDetailScroll(section: DetailScrollTarget['section']) {
  const target = useStore(s => s.detailScrollTarget);
  const setDetailScrollTarget = useStore(s => s.setDetailScrollTarget);

  useEffect(() => {
    if (!target || target.section !== section) return;
    const el = document.getElementById(`card-section-${section}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('highlight-pulse');
      const timer = setTimeout(() => {
        el.classList.remove('highlight-pulse');
        setDetailScrollTarget(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [target, section, setDetailScrollTarget]);
}
```

Call `useDetailScroll('description')` in `CardContent.tsx`, `useDetailScroll('tasks')` in `TaskList.tsx`, etc.

Add CSS class in `frontend/src/index.css`:
```css
.highlight-pulse {
  animation: highlight-pulse-anim 2s ease-out;
}
@keyframes highlight-pulse-anim {
  0%   { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.5); }   /* amber-400 */
  50%  { box-shadow: 0 0 0 8px rgba(251, 191, 36, 0); }
  100% { box-shadow: none; }
}
```

#### 11c — Row-level highlighting in `CardLinks.tsx` and `CardFiles.tsx`

When `detailScrollTarget.linkId` or `detailScrollTarget.filename` is set, the matching row should receive a transient amber ring.

In `CardLinks.tsx`:
```tsx
const target = useStore(s => s.detailScrollTarget);
// On each link row:
<div
  data-link-id={link.id}
  className={cn(
    'flex items-center ...',
    target?.section === 'links' && target?.linkId === link.id && 'ring-2 ring-amber-400/60 rounded'
  )}
>
```

Same pattern in `CardFiles.tsx` using `data-filename` / `target?.filename`.

For `detailScrollTarget.taskIndex` in `TaskList.tsx`, highlight the matching `TaskCheckbox` row.

---

### Step 12 — Backend: register routes in `src/server.ts`

Import and register the global search route:

```typescript
import { searchRoutes } from './routes/search';
// Inside the Elysia app setup:
.use(searchRoutes(workspacePath))
```

---

## Files Created / Modified

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `PaletteResultType`, `PaletteSearchResult`, `PaletteSearchResponse`, `GlobalPaletteSearchResponse` |
| `src/routes/cards.ts` | Add `GET /api/projects/:slug/search?q=&types=` (new richer endpoint alongside existing `/cards/search`) |
| `src/routes/search.ts` | **NEW** — `GET /api/search?q=&projects=` global search route |
| `src/server.ts` | Register `searchRoutes` |
| `frontend/src/types/index.ts` | Mirror new types + `PaletteFilterTab`, `DetailScrollTarget` |
| `frontend/src/api/client.ts` | Add `searchApi` with `palette()` and `global()` methods |
| `frontend/src/utils/fuzzy.ts` | **NEW** — `fuzzyScore()`, `fuzzyFilter()` |
| `frontend/src/store/index.ts` | Add palette state + actions + `detailScrollTarget` |
| `frontend/src/components/search/SearchPalette.tsx` | **NEW** — full palette component |
| `frontend/src/components/layout/Header.tsx` | Replace search input with `SearchTriggerButton` |
| `frontend/src/App.tsx` | Register global `Ctrl+K`/`Cmd+K` shortcut; render `<SearchPalette />` |
| `frontend/src/hooks/useDetailScroll.ts` | **NEW** — scroll + highlight hook |
| `frontend/src/components/card-detail/CardContent.tsx` | Add `id`, call `useDetailScroll('description')` |
| `frontend/src/components/card-detail/TaskList.tsx` | Add `id`, call `useDetailScroll('tasks')`, highlight matched row |
| `frontend/src/components/card-detail/CardMetadata.tsx` | Add `id`, call `useDetailScroll('metadata')` |
| `frontend/src/components/card-detail/CardFiles.tsx` | Add `id`, call `useDetailScroll('files')`, highlight matched file row |
| `frontend/src/components/card-detail/CardLinks.tsx` | Add `id`, call `useDetailScroll('links')`, highlight matched link row |
| `frontend/src/index.css` | Add `.highlight-pulse` animation class |

---

## Notes on keeping existing board search working

The existing `searchQuery` / `setSearchQuery` / `isCardHighlighted` store state continues to power the board-level yellow card highlights. This is intentional — after navigating via palette, the palette closes but the board still shows which cards had matches.

After the palette closes, call `setSearchQuery(get().paletteQuery)` so the board highlights update to match the last palette query. This links the two search systems without coupling their internals.

---

## Verification Checklist

1. **Ctrl+K / Cmd+K** opens the palette from any page state (while in a text input, while a card is open, etc.)
2. **Esc** closes the palette; clicking the backdrop also closes it
3. **Arrow keys** move the highlight through results; the view scrolls if results exceed panel height
4. **Enter** activates the selected result — card opens, correct section scrolls into view with amber pulse
5. **Type "mp-0"** — card identifier match appears as a `Card` result
6. **Type a task keyword** — matching task results appear; activating opens card, task row pulses
7. **Type a filename** — `File` result appears; activating opens card, file row in Files section pulses
8. **Type a link label** — `Link Label` result appears; activating opens card, link row pulses
9. **Toggle "All projects"** — results span all projects; each result shows project name in subtitle; switching project and opening card works
10. **Filter tabs** — selecting "Tasks" hides all non-task results; other tabs work correctly
11. **No results** — empty state message shows (not a blank panel)
12. **Short query (1 char)** — no API call made; prompt shows "Type at least 2 characters"
13. **Board highlighting** — after closing the palette, yellow card rings on the Kanban board reflect the last palette query
14. **Header trigger button** — visible on desktop; shows `⌘K` hint; clicking opens palette

---

## TASKS.md updates

When implementation is complete, mark these items done in `docs/TASKS.md` under **Priority 1: Search Improvements**:

- [x] Search palette UI (overlay, keyboard nav, Esc, backdrop)
- [x] Global Ctrl+K / Cmd+K shortcut registered in App.tsx
- [x] Header search input replaced with trigger button
- [x] Result types and label chip styles
- [x] Filter tabs (All / Cards / Tasks / Files / Links)
- [x] Scope toggle (This project / All projects)
- [x] Fuzzy utility (fuzzy.ts)
- [x] Backend: extended search endpoint `/api/projects/:slug/search`
- [x] Backend: global search endpoint `/api/search`
- [x] Navigation behavior for all result types
- [x] `detailScrollTarget` + `useDetailScroll` hook
- [x] Row-level highlight in CardLinks, CardFiles, TaskList
