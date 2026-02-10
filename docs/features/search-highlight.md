# Search and Highlight

## Context

DevPlanner currently has no search functionality in the frontend. A `search_cards` tool exists in the MCP server but is not exposed via the REST API or UI. This feature adds a search box to the header that highlights matching text in card titles and tasks on the currently-selected project board.

## Design

### Behavior
- Search box appears in the header bar, inline with the "DevPlanner" title
- As the user types, matching text in card titles and task text is highlighted with a yellow marker
- Cards with matches get a subtle yellow ring/border to draw attention
- **Cards are never hidden** — the entire board remains visible, only matched content is highlighted
- If tasks are collapsed on a card that has task matches, they are auto-expanded
- If the "All tasks complete!" message is shown (hiding individual tasks), override it to show the individual tasks when there are search matches
- When search has task matches, show all tasks on the card (not capped at 5)
- Search clears when switching projects
- Empty search box resets all highlighting

### Search Scope (Initial)
- Card titles
- Task text (checklist items)

### Future Improvements (see TASKS.md)
- Search card descriptions
- Search cards in collapsed lanes
- Show card description snippet when searching
- Show all tasks (including completed) when searching

---

## Implementation

### Step 1: Backend Types

**File: `src/types/index.ts`**

Add search result types:

```typescript
export interface SearchResult {
  slug: string;
  lane: string;
  matchedFields: ('title' | 'tags' | 'tasks')[];
  matchedTaskIndices: number[];
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}
```

### Step 2: Backend Search Endpoint

**File: `src/routes/cards.ts`**

Add a search route. **This MUST be registered BEFORE the `GET /api/projects/:projectSlug/cards/:cardSlug` route** (before line 71), otherwise Elysia will treat "search" as a `:cardSlug` parameter.

Insert after the `GET /api/projects/:projectSlug/cards` route (after line 23):

```typescript
.get('/api/projects/:projectSlug/cards/search', async ({ params, query }) => {
  const searchQuery = query.q?.trim();
  if (!searchQuery) {
    return { results: [], query: '' };
  }

  const queryLower = searchQuery.toLowerCase();
  const cards = await cardService.listCards(params.projectSlug);
  const results: Array<{
    slug: string;
    lane: string;
    matchedFields: string[];
    matchedTaskIndices: number[];
  }> = [];

  for (const cardSummary of cards) {
    const matchedFields: string[] = [];
    const matchedTaskIndices: number[] = [];

    // Search title
    if (cardSummary.frontmatter.title.toLowerCase().includes(queryLower)) {
      matchedFields.push('title');
    }

    // Search tasks (requires full card load)
    if (cardSummary.taskProgress.total > 0) {
      const fullCard = await cardService.getCard(params.projectSlug, cardSummary.slug);
      for (const task of fullCard.tasks) {
        if (task.text.toLowerCase().includes(queryLower)) {
          if (!matchedFields.includes('tasks')) {
            matchedFields.push('tasks');
          }
          matchedTaskIndices.push(task.index);
        }
      }
    }

    if (matchedFields.length > 0) {
      results.push({
        slug: cardSummary.slug,
        lane: cardSummary.lane,
        matchedFields,
        matchedTaskIndices,
      });
    }
  }

  return { results, query: searchQuery };
})
```

### Step 3: Frontend Types

**File: `frontend/src/types/index.ts`**

Add search types:

```typescript
export interface SearchResult {
  slug: string;
  lane: string;
  matchedFields: ('title' | 'tags' | 'tasks')[];
  matchedTaskIndices: number[];
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}
```

### Step 4: API Client

**File: `frontend/src/api/client.ts`**

Add search method to `cardsApi`:

```typescript
import type {
  // ... existing imports ...
  SearchResponse,
} from '../types';

export const cardsApi = {
  // ... existing methods ...

  search: (projectSlug: string, query: string) =>
    fetchJSON<SearchResponse>(
      `${API_BASE}/projects/${projectSlug}/cards/search?q=${encodeURIComponent(query)}`
    ),
};
```

### Step 5: Zustand Store — Search State

**File: `frontend/src/store/index.ts`**

Add to the `DevPlannerStore` interface:

```typescript
// Search
searchQuery: string;
searchResults: SearchResult[];
isSearching: boolean;
setSearchQuery: (query: string) => void;
clearSearch: () => void;
isCardHighlighted: (cardSlug: string) => boolean;
getMatchedTaskIndices: (cardSlug: string) => number[];
```

Add initial state:

```typescript
searchQuery: '',
searchResults: [],
isSearching: false,
```

Add a debounce timeout variable outside the store (at module scope):

```typescript
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
```

Add action implementations:

```typescript
setSearchQuery: (query: string) => {
  set({ searchQuery: query });

  // Clear previous debounce timer
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  if (!query.trim()) {
    get().clearSearch();
    return;
  }

  // Debounce search: wait 300ms after typing stops
  set({ isSearching: true });
  searchDebounceTimer = setTimeout(async () => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    try {
      const { results } = await cardsApi.search(activeProjectSlug, query);
      set({ searchResults: results, isSearching: false });

      // Auto-expand tasks for cards that have task matches
      const { expandedCardTasks } = get();
      for (const result of results) {
        if (result.matchedTaskIndices.length > 0 && !expandedCardTasks.has(result.slug)) {
          get().toggleCardTaskExpansion(result.slug);
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
      set({ isSearching: false });
    }
  }, 300);
},

clearSearch: () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  set({ searchQuery: '', searchResults: [], isSearching: false });
},

isCardHighlighted: (cardSlug: string) => {
  const { searchResults, searchQuery } = get();
  if (!searchQuery) return false;
  return searchResults.some(r => r.slug === cardSlug);
},

getMatchedTaskIndices: (cardSlug: string) => {
  const result = get().searchResults.find(r => r.slug === cardSlug);
  return result?.matchedTaskIndices || [];
},
```

Also, in the existing `setActiveProject` action (around line 205), add search clearing:

```typescript
setActiveProject: (slug) => {
  const project = get().projects.find((p) => p.slug === slug);
  if (project) {
    set({ activeProjectSlug: slug });
    get().clearSearch(); // <-- Add this line
    // ... rest of existing logic
  }
},
```

### Step 6: Text Highlighting Utility

**File: `frontend/src/utils/highlight.tsx`** (new)

```tsx
import React from 'react';

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlights occurrences of `query` within `text` using <mark> elements.
 * Returns the original text if query is empty.
 */
export function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;

  const escaped = escapeRegex(query);
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  if (parts.length === 1) return text; // No matches

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-yellow-500/30 text-yellow-200 rounded px-0.5"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}
```

### Step 7: Header — Search Box

**File: `frontend/src/components/layout/Header.tsx`**

Replace the spacer `<div className="flex-1" />` (line 97) with a search input:

```tsx
import { useStore } from '../../store';

export function Header({ connectionState }: HeaderProps) {
  const {
    isSidebarOpen, toggleSidebar,
    isActivityPanelOpen, toggleActivityPanel,
    searchQuery, setSearchQuery, clearSearch, isSearching,
  } = useStore();

  // ... existing handleRetry ...

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4">
      {/* Sidebar toggles — unchanged */}

      {/* Logo and title — unchanged */}

      {/* Search box (replaces the spacer div) */}
      <div className="flex-1 max-w-md mx-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search cards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-8 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {isSearching && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {/* Small spinner or pulsing dot */}
              <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Connection Indicator — unchanged */}
      {/* Activity History Toggle — unchanged */}
    </header>
  );
}
```

### Step 8: CardPreview — Highlight Matched Cards & Titles

**File: `frontend/src/components/kanban/CardPreview.tsx`**

Add search highlighting to the card:

```tsx
import { useStore } from '../../store';
import { highlightText } from '../../utils/highlight';

// Inside the CardPreview component, add:
const searchQuery = useStore(state => state.searchQuery);
const isHighlighted = useStore(state => state.isCardHighlighted(card.slug));
```

Modify the card wrapper's `className` (around line 97) to add a yellow ring when highlighted:

```tsx
className={cn(
  'group relative rounded-lg border border-gray-700 p-3 cursor-pointer',
  'bg-gray-800',
  'hover:bg-gray-750 card-hover',
  !isDragging && !isDraggingOverlay && getPriorityBorderClass(card.frontmatter.priority),
  (isDragging || isDraggingOverlay) && 'shadow-xl shadow-blue-500/20 rotate-2 scale-105 opacity-90 border-blue-500',
  isDragging && 'opacity-50',
  // Search highlight
  isHighlighted && !isDragging && 'ring-2 ring-yellow-500/50 border-yellow-500/30',
)}
```

Modify the title rendering (around line 109) to highlight matching text:

```tsx
<h3 className="text-sm font-medium text-gray-100 line-clamp-2 leading-snug min-w-0">
  {searchQuery
    ? highlightText(card.frontmatter.title, searchQuery)
    : card.frontmatter.title}
</h3>
```

### Step 9: CardPreviewTasks — Highlight Matched Tasks

**File: `frontend/src/components/kanban/CardPreviewTasks.tsx`**

This is the most complex change. The component needs to:
1. Override "All tasks complete!" when search has task matches
2. Show all matched tasks (not capped at 5) when search is active
3. Pass search query to TaskCheckbox for text highlighting

```tsx
import { useState, useEffect } from 'react';
import { cardsApi } from '../../api/client';
import { useStore } from '../../store';
import { TaskCheckbox } from '../tasks/TaskCheckbox';
import { Spinner } from '../ui/Spinner';
import type { TaskItem, TaskProgress } from '../../types';

interface CardPreviewTasksProps {
  cardSlug: string;
  projectSlug: string;
  taskProgress: TaskProgress;
}

export function CardPreviewTasks({
  cardSlug,
  projectSlug,
  taskProgress,
}: CardPreviewTasksProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toggleTask } = useStore();

  // Search state
  const searchQuery = useStore(state => state.searchQuery);
  const matchedTaskIndices = useStore(state => state.getMatchedTaskIndices(cardSlug));
  const hasSearchMatches = matchedTaskIndices.length > 0;

  useEffect(() => {
    let mounted = true;

    cardsApi
      .get(projectSlug, cardSlug)
      .then((card) => {
        if (mounted) {
          setTasks(card.tasks);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error('Failed to load card tasks:', error);
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [projectSlug, cardSlug, JSON.stringify(taskProgress)]);

  if (isLoading) {
    return (
      <div className="py-2 flex justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (taskProgress.total === 0) {
    return (
      <p className="text-xs text-gray-500 py-2 italic">
        No tasks yet
      </p>
    );
  }

  // Show "All tasks complete!" ONLY if no search matches on this card's tasks
  if (
    taskProgress.total === taskProgress.checked &&
    taskProgress.total > 0 &&
    !hasSearchMatches
  ) {
    return (
      <p className="text-xs text-green-500 py-2 flex items-center gap-1">
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        All tasks complete!
      </p>
    );
  }

  const handleToggle = async (task: TaskItem, checked: boolean) => {
    await toggleTask(cardSlug, task.index, checked);
  };

  // When search is active with matches, show all tasks (no 5-task limit)
  const displayTasks = hasSearchMatches ? tasks : tasks.slice(0, 5);
  const remainingCount = hasSearchMatches ? 0 : Math.max(0, tasks.length - 5);

  return (
    <div className="space-y-0.5 py-1">
      {displayTasks.map((task) => (
        <TaskCheckbox
          key={task.index}
          task={task}
          cardSlug={cardSlug}
          onToggle={(checked) => handleToggle(task, checked)}
          compact
          searchQuery={searchQuery}
          isSearchMatch={matchedTaskIndices.includes(task.index)}
        />
      ))}
      {remainingCount > 0 && (
        <p className="text-xs text-gray-500 mt-1 pl-6">
          +{remainingCount} more tasks...
        </p>
      )}
    </div>
  );
}
```

### Step 10: TaskCheckbox — Search Highlight Support

**File: `frontend/src/components/tasks/TaskCheckbox.tsx`**

Add optional `searchQuery` and `isSearchMatch` props:

```tsx
import { highlightText } from '../../utils/highlight';

interface TaskCheckboxProps {
  task: TaskItem;
  cardSlug: string;
  onToggle: (checked: boolean) => void;
  compact?: boolean;
  searchQuery?: string;
  isSearchMatch?: boolean;
}
```

In the task text rendering, wrap with `highlightText` when `searchQuery` is provided:

```tsx
// Where the task text is rendered (find the <span> or text element that shows task.text):
<span className={cn(
  'text-sm',
  task.checked ? 'text-gray-500 line-through' : 'text-gray-200',
  compact && 'text-xs',
  isSearchMatch && 'font-medium', // Make matched tasks slightly bolder
)}>
  {searchQuery ? highlightText(task.text, searchQuery) : task.text}
</span>
```

Read the existing `TaskCheckbox.tsx` component to find the exact element that renders `task.text` and apply the highlight there.

---

## Files Modified

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `SearchResult`, `SearchResponse` interfaces |
| `src/routes/cards.ts` | Add `GET /api/projects/:projectSlug/cards/search?q=` endpoint |
| `frontend/src/types/index.ts` | Mirror `SearchResult`, `SearchResponse` |
| `frontend/src/api/client.ts` | Add `cardsApi.search()` |
| `frontend/src/store/index.ts` | Add search state, actions, debounced execution, clear on project switch |
| `frontend/src/utils/highlight.tsx` | **NEW** — `highlightText()` utility |
| `frontend/src/components/layout/Header.tsx` | Replace spacer with search input |
| `frontend/src/components/kanban/CardPreview.tsx` | Add yellow ring for matched cards, highlight titles |
| `frontend/src/components/kanban/CardPreviewTasks.tsx` | Override "All complete" message, show all tasks, highlight text |
| `frontend/src/components/tasks/TaskCheckbox.tsx` | Add `searchQuery`/`isSearchMatch` props for highlighting |

## Verification

1. **Title search**: Type a word that appears in a card title. Verify the card gets a yellow ring and the matching text is highlighted yellow.
2. **Task search**: Type a word that appears in a task. Verify the card's tasks auto-expand and the matching task text is highlighted.
3. **All tasks complete**: Find a card where all tasks are complete (showing "All tasks complete!"). Search for a task name on that card. Verify individual tasks appear with the match highlighted.
4. **Task cap override**: Find a card with more than 5 tasks. Search for a task beyond the 5th. Verify all tasks are shown (not capped at 5).
5. **Clear search**: Click the X button in the search box. Verify all highlighting is removed and task expansion returns to normal.
6. **Project switch**: Enter a search query, then switch projects. Verify the search box clears.
7. **Debounce**: Type quickly. Verify the search doesn't fire on every keystroke (check network tab — should only see requests after 300ms pause).
8. **Empty results**: Search for a string that doesn't match anything. Verify no cards are highlighted and the board looks normal.
9. **Case insensitive**: Search "upload" when the card title is "Video Upload Pipeline". Verify it matches.
