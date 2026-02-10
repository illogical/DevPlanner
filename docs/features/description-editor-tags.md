# Description Editor & Tag Management

## Context

Card content in DevPlanner is currently read-only in the UI — the description is rendered as HTML via `marked` and there's no way to edit it. Tags exist in the data model (`CardFrontmatter.tags`) and are displayed as read-only badges, but there's no UI for adding or removing them. This feature adds:

1. **Editable description** — toggle between rendered markdown view and a plain text editor
2. **Tag management** — search/add/remove tags in the card detail panel with autocomplete from existing project tags

## Design

### Description Editor
- Pencil icon next to the "Description" header toggles edit mode
- Edit mode shows a `<textarea>` with raw markdown (Tasks section stripped out)
- Save/Cancel buttons, plus keyboard shortcuts: Cmd/Ctrl+Enter to save, Escape to cancel
- On save, the `## Tasks` section is re-appended to preserve task data

### Tag Management (Detail Panel Only)
- Tags section always visible in CardMetadata (even when no tags exist)
- Small "+" button to reveal a search/add interface
- Combobox with dropdown showing matching tags from the project
- "Create '{text}'" option when typed text doesn't match any existing tag
- Each tag badge has an "x" button to remove it

---

## Implementation

### Step 1: Backend — Tags Endpoint

**File: `src/routes/cards.ts`**

Add a new route to collect all unique tags across a project. Insert this BEFORE the `/:cardSlug` routes (before line 71) to avoid Elysia treating "tags" as a cardSlug:

```typescript
.get('/api/projects/:projectSlug/tags', async ({ params }) => {
  const cards = await cardService.listCards(params.projectSlug);
  const tagSet = new Set<string>();
  for (const card of cards) {
    if (card.frontmatter.tags) {
      for (const tag of card.frontmatter.tags) {
        tagSet.add(tag);
      }
    }
  }
  return { tags: Array.from(tagSet).sort() };
})
```

No other backend changes needed — the existing `PATCH /api/projects/:projectSlug/cards/:cardSlug` route (line 232) already accepts `content` and `tags` in the request body via `UpdateCardInput`.

### Step 2: Frontend Types

**File: `frontend/src/types/index.ts`**

Add `UpdateCardInput` interface (mirrors backend `src/types/index.ts`):

```typescript
export interface UpdateCardInput {
  title?: string;
  status?: 'in-progress' | 'blocked' | 'review' | 'testing' | null;
  priority?: 'low' | 'medium' | 'high' | null;
  assignee?: 'user' | 'agent' | null;
  tags?: string[] | null;
  content?: string;
}
```

Add tags response type:

```typescript
export interface TagsResponse {
  tags: string[];
}
```

### Step 3: API Client

**File: `frontend/src/api/client.ts`**

Add `update` and `listTags` methods to the `cardsApi` object:

```typescript
import type {
  // ... existing imports ...
  UpdateCardInput,
  TagsResponse,
} from '../types';

export const cardsApi = {
  // ... existing methods (list, get, create, archive, move, reorder) ...

  update: (projectSlug: string, cardSlug: string, updates: UpdateCardInput) =>
    fetchJSON<Card>(`${API_BASE}/projects/${projectSlug}/cards/${cardSlug}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  listTags: (projectSlug: string) =>
    fetchJSON<TagsResponse>(`${API_BASE}/projects/${projectSlug}/tags`),
};
```

### Step 4: Zustand Store

**File: `frontend/src/store/index.ts`**

Add to the `DevPlannerStore` interface (after the `addTask` declaration around line 74):

```typescript
// Card editing
updateCard: (cardSlug: string, updates: UpdateCardInput) => Promise<void>;

// Project tags (for autocomplete)
projectTags: string[];
loadProjectTags: () => Promise<void>;
```

Add initial state (after `isActivityPanelOpen: false` around line 148):

```typescript
projectTags: [],
```

Add `updateCard` action implementation (after the `addTask` action):

```typescript
updateCard: async (cardSlug, updates) => {
  const { activeProjectSlug } = get();
  if (!activeProjectSlug) return;

  // Record local action for self-echo dedup
  get()._recordLocalAction(`card:updated:${cardSlug}`);

  const updatedCard = await cardsApi.update(activeProjectSlug, cardSlug, updates);

  // Update activeCard if it matches
  if (get().activeCard?.slug === cardSlug) {
    set({ activeCard: updatedCard });
  }

  // Update card summary in cardsByLane
  set((state) => {
    const newCardsByLane = { ...state.cardsByLane };
    for (const [lane, cards] of Object.entries(newCardsByLane)) {
      const cardIndex = cards.findIndex((c) => c.slug === cardSlug);
      if (cardIndex !== -1) {
        newCardsByLane[lane] = cards.map((c, i) =>
          i === cardIndex
            ? {
                ...c,
                frontmatter: updatedCard.frontmatter,
                taskProgress: {
                  total: updatedCard.tasks.length,
                  checked: updatedCard.tasks.filter(t => t.checked).length,
                },
              }
            : c
        );
        break;
      }
    }
    return { cardsByLane: newCardsByLane };
  });

  // Add visual indicator
  get().addChangeIndicator({
    type: 'card:updated',
    cardSlug,
  });

  // Reload project tags in case new tags were added
  if (updates.tags !== undefined) {
    get().loadProjectTags();
  }
},

loadProjectTags: async () => {
  const { activeProjectSlug } = get();
  if (!activeProjectSlug) return;

  try {
    const { tags } = await cardsApi.listTags(activeProjectSlug);
    set({ projectTags: tags });
  } catch (error) {
    console.error('Failed to load project tags:', error);
  }
},
```

Also add `cardsApi` to the imports at the top of the file (it may already be imported via the destructured import).

### Step 5: Description Editor

**File: `frontend/src/components/card-detail/CardContent.tsx`**

Replace the entire component with a toggleable view/edit version:

```tsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { marked } from 'marked';
import { useStore } from '../../store';

interface CardContentProps {
  content: string;
  cardSlug: string;
}

export function CardContent({ content, cardSlug }: CardContentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { updateCard } = useStore();

  // Extract description (without ## Tasks section) for both display and editing
  const tasksMatch = content.match(/(## Tasks[\s\S]*$)/);
  const tasksSection = tasksMatch ? tasksMatch[1] : '';
  const descriptionOnly = content
    .replace(/## Tasks[\s\S]*?(?=##|$)/g, '')
    .replace(/^\s*-\s*\[[\sx]\]\s+.*/gm, '')
    .trim();

  const html = useMemo(() => {
    marked.setOptions({ breaks: true, gfm: true });
    if (!descriptionOnly) return '';
    return marked.parse(descriptionOnly);
  }, [descriptionOnly]);

  const handleStartEditing = () => {
    setEditContent(descriptionOnly);
    setIsEditing(true);
  };

  // Auto-focus and auto-resize textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [isEditing]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Re-combine description with tasks section
      const newContent = editContent.trim() + (tasksSection ? '\n\n' + tasksSection : '');
      await updateCard(cardSlug, { content: newContent });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save description:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleTextareaInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  return (
    <div className="border-t border-gray-700 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-400">Description</h3>
        {!isEditing && (
          <button
            onClick={handleStartEditing}
            className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Edit description"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleTextareaInput}
            placeholder="Enter description (markdown supported)..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none min-h-[100px] font-mono"
            disabled={isSaving}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Markdown supported</span>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : html ? (
        <div
          className="prose prose-invert prose-sm max-w-none
            prose-headings:text-gray-100 prose-headings:font-semibold
            prose-p:text-gray-300 prose-p:leading-relaxed
            prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
            prose-code:text-blue-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700
            prose-ul:text-gray-300 prose-ol:text-gray-300
            prose-li:marker:text-gray-500
            prose-blockquote:border-gray-600 prose-blockquote:text-gray-400
            prose-hr:border-gray-700"
          dangerouslySetInnerHTML={{ __html: html as string }}
        />
      ) : (
        <button
          onClick={handleStartEditing}
          className="text-sm text-gray-600 italic hover:text-gray-400 transition-colors cursor-pointer"
        >
          Click to add a description...
        </button>
      )}
    </div>
  );
}
```

Update the component usage in **`CardDetailPanel.tsx`** (line 108) to pass `cardSlug`:

```tsx
<CardContent content={activeCard.content} cardSlug={activeCard.slug} />
```

### Step 6: TagInput Component

**File: `frontend/src/components/ui/TagInput.tsx`** (new)

```tsx
import { useState, useRef, useEffect } from 'react';
import { Badge } from './Badge';

interface TagInputProps {
  tags: string[];
  availableTags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}

export function TagInput({ tags, availableTags, onAddTag, onRemoveTag }: TagInputProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter available tags: exclude already-applied tags, match search text
  const filteredTags = availableTags
    .filter(tag => !tags.includes(tag))
    .filter(tag => tag.toLowerCase().includes(searchText.toLowerCase()));

  const showCreateOption = searchText.trim().length > 0
    && !availableTags.some(t => t.toLowerCase() === searchText.toLowerCase());

  // Focus input when entering add mode
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsAdding(false);
        setSearchText('');
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectTag = (tag: string) => {
    onAddTag(tag);
    setSearchText('');
    setIsDropdownOpen(false);
    // Keep the input open for adding more tags
    inputRef.current?.focus();
  };

  const handleCreateTag = () => {
    const newTag = searchText.trim().toLowerCase();
    if (newTag) {
      onAddTag(newTag);
      setSearchText('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchText.trim()) {
      e.preventDefault();
      if (filteredTags.length > 0) {
        handleSelectTag(filteredTags[0]);
      } else if (showCreateOption) {
        handleCreateTag();
      }
    }
    if (e.key === 'Escape') {
      setIsAdding(false);
      setSearchText('');
      setIsDropdownOpen(false);
    }
  };

  return (
    <div ref={containerRef}>
      {/* Existing tags */}
      <div className="flex flex-wrap gap-1.5 mb-1">
        {tags.map(tag => (
          <Badge key={tag} variant="secondary" size="md">
            <span className="flex items-center gap-1">
              {tag}
              <button
                onClick={() => onRemoveTag(tag)}
                className="ml-0.5 hover:text-red-400 transition-colors"
                aria-label={`Remove tag ${tag}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          </Badge>
        ))}

        {/* Add tag button */}
        {!isAdding && (
          <button
            onClick={() => {
              setIsAdding(true);
              setIsDropdownOpen(true);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 border border-dashed border-gray-700 hover:border-gray-500 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add tag
          </button>
        )}
      </div>

      {/* Search input + dropdown */}
      {isAdding && (
        <div className="relative mt-2">
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search or create tag..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          {/* Dropdown */}
          {isDropdownOpen && (filteredTags.length > 0 || showCreateOption) && (
            <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => handleSelectTag(tag)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {tag}
                </button>
              ))}
              {showCreateOption && (
                <button
                  onClick={handleCreateTag}
                  className="w-full text-left px-3 py-1.5 text-sm text-blue-400 hover:bg-gray-700 transition-colors border-t border-gray-700"
                >
                  Create "{searchText.trim()}"
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Step 7: CardMetadata — Tag Editing

**File: `frontend/src/components/card-detail/CardMetadata.tsx`**

Replace the read-only tags section with the `TagInput` component and add handlers:

```tsx
import { useEffect } from 'react';
import { Badge, AssigneeBadge, PriorityBadge } from '../ui/Badge';
import { TagInput } from '../ui/TagInput';
import { useStore } from '../../store';
import type { Card } from '../../types';

interface CardMetadataProps {
  card: Card;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CardMetadata({ card }: CardMetadataProps) {
  const { frontmatter } = card;
  const { updateCard, projectTags, loadProjectTags, activeProjectSlug } = useStore();

  // Load project tags for autocomplete
  useEffect(() => {
    loadProjectTags();
  }, [activeProjectSlug, loadProjectTags]);

  const handleAddTag = async (tag: string) => {
    const currentTags = frontmatter.tags || [];
    if (!currentTags.includes(tag)) {
      await updateCard(card.slug, { tags: [...currentTags, tag] });
    }
  };

  const handleRemoveTag = async (tag: string) => {
    const currentTags = frontmatter.tags || [];
    await updateCard(card.slug, { tags: currentTags.filter(t => t !== tag) });
  };

  return (
    <div className="space-y-4">
      {/* Priority and Status row — unchanged */}
      <div className="flex flex-wrap gap-3">
        {frontmatter.priority && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Priority</p>
            <PriorityBadge priority={frontmatter.priority} size="md" />
          </div>
        )}
        {frontmatter.status && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <Badge variant="default" size="md">
              {frontmatter.status}
            </Badge>
          </div>
        )}
        {frontmatter.assignee && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Assignee</p>
            <AssigneeBadge assignee={frontmatter.assignee} size="md" />
          </div>
        )}
      </div>

      {/* Tags — now editable */}
      <div>
        <p className="text-xs text-gray-500 mb-1">Tags</p>
        <TagInput
          tags={frontmatter.tags || []}
          availableTags={projectTags}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
        />
      </div>

      {/* Dates — unchanged */}
      <div className="flex gap-6 text-sm">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Created</p>
          <p className="text-gray-300">{formatDate(frontmatter.created)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Updated</p>
          <p className="text-gray-300">{formatDate(frontmatter.updated)}</p>
        </div>
      </div>
    </div>
  );
}
```

Key change: The Tags section is now always rendered (not conditional on `tags.length > 0`), showing the `TagInput` with its "Add tag" button even when there are no tags.

---

## Files Modified

| File | Change |
|------|--------|
| `src/routes/cards.ts` | Add `GET /api/projects/:projectSlug/tags` endpoint |
| `frontend/src/types/index.ts` | Add `UpdateCardInput`, `TagsResponse` interfaces |
| `frontend/src/api/client.ts` | Add `cardsApi.update()` and `cardsApi.listTags()` |
| `frontend/src/store/index.ts` | Add `updateCard()`, `projectTags`, `loadProjectTags()` |
| `frontend/src/components/card-detail/CardContent.tsx` | Rewrite with view/edit toggle |
| `frontend/src/components/card-detail/CardDetailPanel.tsx` | Pass `cardSlug` to `CardContent` |
| `frontend/src/components/card-detail/CardMetadata.tsx` | Replace read-only tags with `TagInput` |
| `frontend/src/components/ui/TagInput.tsx` | **NEW** — Tag combobox component |

## Verification

1. **Description editing**: Open a card's detail panel, click the pencil icon, edit the description, save. Re-open the panel — verify the edit persisted. Verify the `## Tasks` section was not corrupted.
2. **Empty description**: On a card with no description, verify "Click to add a description..." appears and clicking it opens the editor.
3. **Tag autocomplete**: Open a card, click "Add tag". Type part of an existing tag name — verify the dropdown shows matching tags. Select one — verify it's added.
4. **Tag creation**: Type a tag name that doesn't exist. Verify "Create '{text}'" option appears. Click it — verify the tag is added.
5. **Tag removal**: Click the "x" on an existing tag badge. Verify it's removed.
6. **WebSocket sync**: Edit a card description in another tab or via API. Verify the detail panel updates in the open tab.
7. **Keyboard shortcuts**: In the description editor, verify Cmd/Ctrl+Enter saves and Escape cancels.
