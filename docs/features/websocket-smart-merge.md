# WebSocket Smart Merge — Preventing Edit Interruptions

## Context

When users edit cards in the detail panel (e.g., typing a title, editing description, adding tags), WebSocket messages can interrupt their work. The cards "blink" and the edit screen disappears, even when no actual changes occurred. This creates a poor user experience:

- **The Problem**: User is typing a card title → WebSocket ping/update arrives → edit screen vanishes → user loses work
- **Current Behavior**: WebSocket updates trigger full card refetch with loading state
- **User Impact**: Edit sessions are interrupted, forcing users to restart their edits

### Root Cause

In `frontend/src/store/index.ts` (lines 980-982), when a `card:updated` WebSocket event arrives:

1. The handler calls `openCardDetail(slug)` to refetch the card
2. `openCardDetail` sets `isLoadingCardDetail: true` (line 488)
3. `CardDetailPanel` shows a loading spinner (lines 75-78)
4. All child components unmount (CardDetailHeader, CardContent, CardMetadata)
5. Local editing state is lost:
   - `isEditingTitle`, `editTitle` (CardDetailHeader)
   - `isEditing`, `editContent` (CardContent)
   - Inline edit states (CardMetadata)

### Why It Happens

The deduplication check `_isRecentLocalAction` (line 974) has a 5-second window. If:
- The WebSocket message arrives after this window expires
- It's from an external source (another client, file watcher)
- Timing issues cause the check to fail

Then `openCardDetail` is called unnecessarily, interrupting the user's editing session.

---

## Design

### Solution: Smart Merge with Edit State Tracking

Implement a hybrid approach that:
1. **Tracks which fields are being edited** at the store level
2. **Fetches updates without loading state** when user is editing
3. **Merges intelligently**: preserves edited fields, updates non-edited fields
4. **Prevents interruptions** while maintaining real-time collaboration

### Benefits

- **No interruptions**: User edits are never interrupted by WebSocket updates
- **Real-time sync**: External changes to non-edited fields appear immediately
- **Conflict prevention**: Local edits take precedence over remote updates
- **No visual glitches**: No loading spinner, no component unmounting
- **Smart task updates**: Tasks update unless user is editing content (which includes task section)

### Trade-offs

**Pros**:
- Better collaborative editing experience
- Users see external changes immediately where they should
- More intuitive UX
- Still prevents interruptions completely

**Cons**:
- More complex than simple "skip refetch while editing"
- Need to handle async merge edge cases (e.g., fetch completes after user finishes editing)
- Requires discipline to add `setCardEditState` calls in all edit handlers
- Slight delay before non-edited fields update (async fetch)

---

## Implementation

### Step 1: Add Edit State Tracking to Store

**File**: `frontend/src/store/index.ts`

Add new state fields to track which fields are being edited.

**Add to DevPlannerStore interface** (after line 66, before Task operations):

```typescript
// Edit state tracking (prevent WebSocket interruptions)
activeCardEdits: {
  isEditingTitle: boolean;
  isEditingContent: boolean;
  isEditingMetadata: boolean;
};
setCardEditState: (field: 'title' | 'content' | 'metadata', isEditing: boolean) => void;
```

**Initialize state** (around line 162, after `isDetailPanelOpen`):

```typescript
activeCardEdits: {
  isEditingTitle: false,
  isEditingContent: false,
  isEditingMetadata: false,
},
```

**Add action** (after `closeCardDetail`, before Task actions):

```typescript
setCardEditState: (field, isEditing) => {
  set((state) => ({
    activeCardEdits: {
      ...state.activeCardEdits,
      [`isEditing${field.charAt(0).toUpperCase() + field.slice(1)}`]: isEditing,
    },
  }));
},
```

---

### Step 2: Track Edit State in CardDetailHeader

**File**: `frontend/src/components/card-detail/CardDetailHeader.tsx`

Add calls to `setCardEditState` to track title editing state.

**In `handleStartEditing`** (line ~51):

```typescript
const handleStartEditing = () => {
  setEditTitle(card.frontmatter.title);
  setIsEditingTitle(true);
  useStore.getState().setCardEditState('title', true); // ADD THIS
};
```

**In `handleSaveTitle`** (lines ~56-74):

```typescript
const handleSaveTitle = async () => {
  const trimmed = editTitle.trim();
  if (!trimmed || trimmed === card.frontmatter.title) {
    setIsEditingTitle(false);
    useStore.getState().setCardEditState('title', false); // ADD THIS
    setEditTitle(card.frontmatter.title);
    return;
  }

  setIsSaving(true);
  try {
    await updateCard(card.slug, { title: trimmed });
    setIsEditingTitle(false);
    useStore.getState().setCardEditState('title', false); // ADD THIS
  } catch (error) {
    console.error('Failed to update title:', error);
    setEditTitle(card.frontmatter.title);
    useStore.getState().setCardEditState('title', false); // ADD THIS (cleanup on error)
  } finally {
    setIsSaving(false);
  }
};
```

**In `handleCancelEdit`** (lines ~76-79):

```typescript
const handleCancelEdit = () => {
  setIsEditingTitle(false);
  setEditTitle(card.frontmatter.title);
  useStore.getState().setCardEditState('title', false); // ADD THIS
};
```

---

### Step 3: Track Edit State in CardContent

**File**: `frontend/src/components/card-detail/CardContent.tsx`

Add calls to `setCardEditState` to track content editing state.

**In `handleStartEditing`** (line ~31):

```typescript
const handleStartEditing = () => {
  setEditContent(descriptionOnly);
  setIsEditing(true);
  useStore.getState().setCardEditState('content', true); // ADD THIS
};
```

**In `handleSave`** (lines ~45-57):

```typescript
const handleSave = async () => {
  setIsSaving(true);
  try {
    const newContent = editContent.trim() + (tasksSection ? '\n\n' + tasksSection : '');
    await updateCard(cardSlug, { content: newContent });
    setIsEditing(false);
    useStore.getState().setCardEditState('content', false); // ADD THIS
  } catch (error) {
    console.error('Failed to save description:', error);
    useStore.getState().setCardEditState('content', false); // ADD THIS (cleanup on error)
  } finally {
    setIsSaving(false);
  }
};
```

**In `handleCancel`** (lines ~59-61):

```typescript
const handleCancel = () => {
  setIsEditing(false);
  useStore.getState().setCardEditState('content', false); // ADD THIS
};
```

---

### Step 4: Track Edit State in CardMetadata

**File**: `frontend/src/components/card-detail/CardMetadata.tsx`

Wrap all inline edit operations (priority, assignee, tags) with edit state tracking.

**Pattern to apply**:

```typescript
useStore.getState().setCardEditState('metadata', true);
try {
  await updateCard(...);
} finally {
  useStore.getState().setCardEditState('metadata', false);
}
```

**Apply to these handlers** (lines ~193, ~200, ~213, ~230):

1. **`handleAddTag`** (line ~193):

```typescript
const handleAddTag = async (tag: string) => {
  const currentTags = frontmatter.tags || [];
  if (!currentTags.includes(tag)) {
    useStore.getState().setCardEditState('metadata', true);
    try {
      await updateCard(card.slug, { tags: [...currentTags, tag] });
    } finally {
      useStore.getState().setCardEditState('metadata', false);
    }
  }
};
```

2. **`handleRemoveTag`** (line ~200):

```typescript
const handleRemoveTag = async (tag: string) => {
  const currentTags = frontmatter.tags || [];
  useStore.getState().setCardEditState('metadata', true);
  try {
    await updateCard(card.slug, { tags: currentTags.filter(t => t !== tag) });
  } finally {
    useStore.getState().setCardEditState('metadata', false);
  }
};
```

3. **Priority selector callback** (line ~213):

```typescript
onSelect={async (priority) => {
  useStore.getState().setCardEditState('metadata', true);
  try {
    await updateCard(card.slug, { priority });
  } finally {
    useStore.getState().setCardEditState('metadata', false);
  }
}}
```

4. **Assignee selector callback** (line ~230):

```typescript
onSelect={async (assignee) => {
  useStore.getState().setCardEditState('metadata', true);
  try {
    await updateCard(card.slug, { assignee });
  } finally {
    useStore.getState().setCardEditState('metadata', false);
  }
}}
```

---

### Step 5: Implement Smart Merge in WebSocket Handler

**File**: `frontend/src/store/index.ts`

Replace the simple refetch in `wsHandleCardUpdated` (lines 980-985) with intelligent merge logic.

**Current code**:

```typescript
if (state.activeCard?.slug === slug && !isRecentAction) {
  console.log(`[wsHandleCardUpdated] REFETCHING ${slug} from API`);
  state.openCardDetail(slug);
}
```

**Replace with**:

```typescript
if (state.activeCard?.slug === slug && !isRecentAction) {
  const { activeCardEdits } = get();
  const isEditing = activeCardEdits.isEditingTitle ||
                    activeCardEdits.isEditingContent ||
                    activeCardEdits.isEditingMetadata;

  if (isEditing) {
    console.log(`[wsHandleCardUpdated] User is editing, performing smart merge for ${slug}`);

    // Fetch full card data WITHOUT setting loading state
    cardsApi.get(state.activeProjectSlug!, slug).then((fetchedCard) => {
      const currentState = get();

      // Only merge if still the active card and user still editing
      if (currentState.activeCard?.slug === slug &&
          (currentState.activeCardEdits.isEditingTitle ||
           currentState.activeCardEdits.isEditingContent ||
           currentState.activeCardEdits.isEditingMetadata)) {

        // Smart merge: preserve editing fields, update others
        const mergedCard = {
          ...fetchedCard,
          frontmatter: {
            ...fetchedCard.frontmatter,
            // Preserve title if editing
            title: currentState.activeCardEdits.isEditingTitle
              ? currentState.activeCard!.frontmatter.title
              : fetchedCard.frontmatter.title,
            // Preserve metadata if editing
            ...(currentState.activeCardEdits.isEditingMetadata ? {
              priority: currentState.activeCard!.frontmatter.priority,
              assignee: currentState.activeCard!.frontmatter.assignee,
              tags: currentState.activeCard!.frontmatter.tags,
            } : {}),
          },
          // Preserve content if editing
          content: currentState.activeCardEdits.isEditingContent
            ? currentState.activeCard!.content
            : fetchedCard.content,
        };

        console.log(`[wsHandleCardUpdated] Applied smart merge for ${slug}`);
        set({ activeCard: mergedCard });
      } else if (currentState.activeCard?.slug === slug) {
        // No longer editing, apply full update
        console.log(`[wsHandleCardUpdated] Editing finished, applying full update for ${slug}`);
        set({ activeCard: fetchedCard });
      }
    }).catch((error) => {
      console.error(`[wsHandleCardUpdated] Failed to fetch for smart merge:`, error);
    });
  } else {
    // No editing, safe to refetch with loading state
    console.log(`[wsHandleCardUpdated] No editing, performing full refetch for ${slug}`);
    state.openCardDetail(slug);
  }
}
```

**Key points**:
- Fetches full card data without setting `isLoadingCardDetail: true` (prevents spinner/unmount)
- Uses `cardsApi.get()` directly (should already be imported in store)
- Merges fields intelligently based on edit state
- Tasks are always updated (unless content is being edited, which includes task section)
- If user finishes editing before fetch completes, applies full update

---

### Step 6: Verify cardsApi Import

**File**: `frontend/src/store/index.ts`

Check if `cardsApi` is imported at the top of the file (line ~1):

```typescript
import { projectsApi, cardsApi, tasksApi, preferencesApi } from '../api/client';
```

This should already exist since the store uses `cardsApi` in `openCardDetail` and other places. No changes needed.

---

### Step 7: Clean Up Edit State on Panel Close

**File**: `frontend/src/store/index.ts`

Update `closeCardDetail` (lines 513-515) to reset edit state when panel closes:

**Current code**:

```typescript
closeCardDetail: () => {
  set({ isDetailPanelOpen: false, activeCard: null });
},
```

**Replace with**:

```typescript
closeCardDetail: () => {
  set({
    isDetailPanelOpen: false,
    activeCard: null,
    activeCardEdits: {
      isEditingTitle: false,
      isEditingContent: false,
      isEditingMetadata: false,
    },
  });
},
```

This ensures that edit state is cleared when the user closes the detail panel, preventing stale state.

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/store/index.ts` | Add edit state tracking (interface, state, actions), implement smart merge in `wsHandleCardUpdated`, update `closeCardDetail` to clear edit state |
| `frontend/src/components/card-detail/CardDetailHeader.tsx` | Add `setCardEditState` calls in `handleStartEditing`, `handleSaveTitle`, `handleCancelEdit` |
| `frontend/src/components/card-detail/CardContent.tsx` | Add `setCardEditState` calls in `handleStartEditing`, `handleSave`, `handleCancel` |
| `frontend/src/components/card-detail/CardMetadata.tsx` | Wrap tag/priority/assignee updates with `setCardEditState` calls |

---

## Verification

### 1. Self-edit + WebSocket Echo

**Test**: Verify that self-echo doesn't interrupt editing

1. Open a card detail panel
2. Start editing the title (click on title, start typing)
3. Save it (press Enter or click outside)
4. Wait for WebSocket `card:updated` event to arrive (should be within 5 seconds)
5. **Expected**: Edit screen does NOT disappear, no interruption
6. **Verify**: Check console logs for `[wsHandleCardUpdated]` messages

### 2. External Update While Editing

**Test**: Verify that external updates don't interrupt, but non-edited fields update

1. Open the same card in two browser tabs (Tab A and Tab B)
2. In Tab A: Start editing the title (click on title, don't save yet)
3. In Tab B: Update the card's description or tags
4. **Expected in Tab A**:
   - Title edit is NOT interrupted (you can continue typing)
   - Description update IS visible (smart merge working)
   - No loading spinner appears
   - No "blink" or component unmount

### 3. Edit Then Close Panel

**Test**: Verify edit state is cleared on panel close

1. Open a card, start editing the title
2. Close the panel without saving (press Escape or click close button)
3. Reopen the same card
4. **Expected**: Edit state is cleared, card shows original values

### 4. Multiple Field Edits

**Test**: Verify edit tracking works for different fields

1. Open a card
2. Start editing title, then cancel (Escape)
3. Start editing description (click Edit button)
4. **Expected**: Both tracking states work independently, no conflicts

### 5. Concurrent Edits in Multiple Tabs

**Test**: Verify collaborative editing works correctly

1. Open the same card in Tab A and Tab B
2. In Tab A: Start editing title
3. In Tab B: Start editing description
4. Save both
5. **Expected**:
   - Both updates succeed
   - Each tab preserves its own edit
   - Non-edited fields update via WebSocket
   - No conflicts or lost data

### 6. Error During Edit

**Test**: Verify edit state is cleared on error

1. Open a card, start editing title
2. Simulate a network error (disconnect network or kill backend)
3. Try to save
4. **Expected**:
   - Error is logged to console
   - Edit state is cleared in error handler
   - User can try again

### 7. WebSocket Ping During Long Edit Session

**Test**: Verify pings don't interrupt long edits

1. Open a card, start editing description
2. Type for 30+ seconds (WebSocket ping interval is 30s)
3. **Expected**:
   - Edit session is NOT interrupted by ping
   - No "blink" or component unmount
   - Can continue editing seamlessly

### 8. Task Updates While Editing Title

**Test**: Verify task updates work while editing non-task fields

1. Open a card in Tab A and Tab B
2. In Tab A: Start editing the title
3. In Tab B: Toggle a task checkbox
4. **Expected in Tab A**:
   - Title edit is NOT interrupted
   - Task list DOES update (shows new checkbox state)
   - Smart merge preserves title, updates tasks

---

## Edge Cases & Considerations

### 1. Race Condition: Fetch Completes After Edit Ends

**Scenario**: User starts editing → WebSocket update arrives → fetch starts → user saves and stops editing → fetch completes

**Handling**: The merge logic checks if user is still editing when fetch completes:
```typescript
if (currentState.activeCard?.slug === slug &&
    (currentState.activeCardEdits.isEditingTitle ||
     currentState.activeCardEdits.isEditingContent ||
     currentState.activeCardEdits.isEditingMetadata)) {
  // Still editing, merge
} else if (currentState.activeCard?.slug === slug) {
  // No longer editing, apply full update
}
```

### 2. Multiple Edits in Quick Succession

**Scenario**: User edits title → saves → immediately edits description

**Handling**: Each field has independent tracking (`isEditingTitle`, `isEditingContent`, `isEditingMetadata`). The merge logic checks all three flags.

### 3. Network Latency

**Scenario**: Slow network causes fetch to take 10+ seconds

**Handling**: The async fetch will eventually complete. If user is still editing, merge is applied. If not, full update is applied. No interruption occurs.

### 4. Card Deleted While Editing

**Scenario**: User editing card in Tab A → another user deletes it in Tab B

**Handling**: The `card:deleted` WebSocket handler will close the detail panel. This is existing behavior and should not change.

### 5. Content Edit Includes Task Section

**Scenario**: User edits description (which includes the `## Tasks` section)

**Handling**: When `isEditingContent` is true, the entire `content` field is preserved. This prevents task updates from appearing while editing description. This is acceptable since the user is actively editing the raw markdown that includes tasks.

---

## Future Enhancements

1. **Granular Content Merge**: Instead of preserving entire `content` field, split description and tasks to allow task updates while editing description only.

2. **Visual Indicators**: Show a subtle indicator when external changes are merged (e.g., briefly highlight updated fields).

3. **Conflict Resolution UI**: If user is editing the same field that was externally updated, show a diff/merge UI.

4. **Edit State Timeout**: Add a 30-second safety timeout to auto-clear stuck edit states (e.g., if component crashes mid-edit).

5. **Optimistic Update Refinement**: Improve the 5-second dedup window to be more adaptive based on network latency.

---

## Developer Notes

### Adding New Editable Fields

If you add a new editable field in the future:

1. **Update the interface**: Add a new boolean to `activeCardEdits` in `DevPlannerStore`
2. **Update initialization**: Add the field to the initial state object
3. **Update `setCardEditState`**: Support the new field name
4. **Track editing**: Call `setCardEditState` when entering/exiting edit mode
5. **Update smart merge**: Add merge logic for the new field in `wsHandleCardUpdated`

### Debugging

- All edit state changes are logged via `setCardEditState`
- Smart merge logic logs when it's triggered and what it's doing
- Check console for `[wsHandleCardUpdated]` messages to see merge decisions
- Use React DevTools to inspect `activeCardEdits` state in real-time

### Performance Considerations

- The smart merge adds an async fetch that doesn't block the UI
- No performance impact when not editing (uses existing refetch path)
- Minimal memory overhead (3 boolean flags in store)
- No additional API calls beyond what already happens
