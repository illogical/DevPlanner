# Card Editing — Title, Priority, Assignee, & Deletion

## Context

Cards in DevPlanner currently have limited editability in the UI. While tags and descriptions can now be edited (see `description-editor-tags.md`), other key metadata fields remain read-only:

- **Title** — displayed in CardDetailHeader but cannot be changed
- **Priority** — shown as a badge in CardMetadata but not editable
- **Assignee** — shown as a badge but cannot be set or cleared
- **Deletion** — no way to delete a card from the UI

Additionally, the **Attachments section** is currently positioned in the middle of the card detail panel (between CardMetadata and CardContent), making it feel like it's interrupting the content flow.

This feature adds:

1. **Editable title** — click to edit inline in the card detail header
2. **Priority dropdown** — click the priority badge to select from low/medium/high or clear it
3. **Assignee dropdown** — click the assignee badge (or "Assign" button) to set user/agent or clear it
4. **Delete card** — trashcan icon in the header with confirmation modal
5. **Attachments repositioning** — move the Attachments section to the bottom of the panel (below TaskList)

---

## Design

### 1. Title Editing

**Location:** `CardDetailHeader`

- Click on the title text to enter edit mode
- Title becomes an auto-resizing input field with focus
- Save on Enter or blur, cancel on Escape
- Real-time validation: title cannot be empty
- Updates both the detail panel and the card preview in the lane

### 2. Priority Dropdown

**Location:** `CardMetadata`

- Current behavior: Priority badge displays as read-only (e.g., "High", "Med", "Low")
- **New behavior:** Click the priority badge to open a dropdown menu
- Dropdown options:
  - Low (green)
  - Medium (amber/yellow)
  - High (red)
  - "Clear priority" option to set priority to `null`
- If no priority is set, show a "Set priority" button styled like the tag "Add tag" button
- Selecting an option updates the card immediately via the API
- Dropdown closes after selection

### 3. Assignee Dropdown

**Location:** `CardMetadata`

- Current behavior: Assignee badge displays as read-only (👤 User or 🤖 Agent)
- **New behavior:** Click the assignee badge to open a dropdown menu
- Dropdown options:
  - User (👤)
  - Agent (🤖)
  - "Clear assignee" option to set assignee to `null`
- If no assignee is set, show a "Set assignee" button styled like the tag "Add tag" button
- Selecting an option updates the card immediately via the API
- Dropdown closes after selection

### 4. Delete Card

**Location:** `CardDetailHeader` — next to the close button

- Add a trashcan icon button (red on hover) in the header
- Clicking the trashcan opens a **confirmation modal**:
  - Modal title: "Delete Card?"
  - Message: "Are you sure you want to delete '{card.frontmatter.title}'? This action cannot be undone."
  - Buttons: "Cancel" (default) and "Delete" (red, destructive)
- On confirm:
  - Call the archive card API (`DELETE /api/projects/:projectSlug/cards/:cardSlug`)
  - Close the detail panel
  - Remove the card from the lane in the UI
  - Show a brief success indicator (optional: toast notification)
- On cancel: Close the modal, no action

### 5. Attachments Section Repositioning

**Location:** `CardDetailPanel`

- **Current order:**
  1. CardMetadata
  2. Attachments (placeholder)
  3. CardContent
  4. TaskList
- **New order:**
  1. CardMetadata
  2. CardContent
  3. TaskList
  4. Attachments (placeholder) — **moved to bottom**
- The Attachments section should remain fixed at the bottom of the scrollable area
- This gives descriptions and tasks more prominence and keeps attachments accessible but not intrusive

---

## Implementation

### Step 1: Update Types (if needed)

**File: `frontend/src/types/index.ts`**

Verify that `UpdateCardInput` already supports `title`, `priority`, and `assignee` (it should, based on backend types):

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

No changes needed if this already exists.

### Step 2: Title Editing in CardDetailHeader

**File: `frontend/src/components/card-detail/CardDetailHeader.tsx`**

Add state for inline editing:

```tsx
import { useState, useRef, useEffect } from 'react';
import { IconButton } from '../ui/IconButton';
import { useStore } from '../../store';
import type { Card } from '../../types';

interface CardDetailHeaderProps {
  card: Card;
  onClose: () => void;
}

const laneDisplayNames: Record<string, string> = {
  '01-upcoming': 'Upcoming',
  '02-in-progress': 'In Progress',
  '03-complete': 'Complete',
  '04-archive': 'Archive',
};

export function CardDetailHeader({ card, onClose }: CardDetailHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(card.frontmatter.title);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { updateCard } = useStore();
  const activeProjectSlug = useStore(state => state.activeProjectSlug);
  const projectPrefix = useStore(
    state => state.projects.find(p => p.slug === activeProjectSlug)?.prefix
  );

  const cardId = (projectPrefix && card.frontmatter.cardNumber)
    ? `${projectPrefix}-${card.frontmatter.cardNumber}`
    : null;

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  // Reset edit state when card changes
  useEffect(() => {
    setEditTitle(card.frontmatter.title);
    setIsEditingTitle(false);
  }, [card.slug, card.frontmatter.title]);

  const handleStartEditing = () => {
    setEditTitle(card.frontmatter.title);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === card.frontmatter.title) {
      setIsEditingTitle(false);
      setEditTitle(card.frontmatter.title);
      return;
    }

    setIsSaving(true);
    try {
      await updateCard(card.slug, { title: trimmed });
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Failed to update title:', error);
      setEditTitle(card.frontmatter.title);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditTitle(card.frontmatter.title);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  return (
    <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 z-10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {cardId && (
            <span className="text-sm text-gray-500 font-mono">{cardId}</span>
          )}
          {isEditingTitle ? (
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveTitle}
              disabled={isSaving}
              className="w-full text-xl font-semibold text-gray-100 bg-gray-800 border border-blue-500 rounded px-2 py-1 mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <h2
              onClick={handleStartEditing}
              className="text-xl font-semibold text-gray-100 mb-1 cursor-pointer hover:text-blue-400 transition-colors"
              title="Click to edit title"
            >
              {card.frontmatter.title}
            </h2>
          )}
          <p className="text-sm text-gray-500">
            {laneDisplayNames[card.lane] || card.lane}
          </p>
        </div>
        <IconButton label="Close panel" onClick={onClose}>
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </IconButton>
      </div>
    </div>
  );
}
```

### Step 3: Delete Button in CardDetailHeader

**File: `frontend/src/components/card-detail/CardDetailHeader.tsx`**

Add delete button and confirmation modal state. Place the delete button before the close button:

```tsx
// Add to imports
import { ConfirmModal } from '../ui/ConfirmModal';

// Add to component state (after isSaving)
const [showDeleteModal, setShowDeleteModal] = useState(false);
const { updateCard, archiveCard, closeCardDetail } = useStore();

// Add delete handler
const handleDelete = async () => {
  try {
    await archiveCard(card.slug);
    closeCardDetail();
  } catch (error) {
    console.error('Failed to delete card:', error);
  }
};

// Update the header buttons section (replace the current close button area)
<div className="flex items-center gap-2">
  {/* Delete button */}
  <IconButton
    label="Delete card"
    onClick={() => setShowDeleteModal(true)}
    className="text-gray-500 hover:text-red-400"
  >
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  </IconButton>

  {/* Close button */}
  <IconButton label="Close panel" onClick={onClose}>
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  </IconButton>
</div>

// Add modal at the end of the component (after the main div)
{showDeleteModal && (
  <ConfirmModal
    title="Delete Card?"
    message={`Are you sure you want to delete "${card.frontmatter.title}"? This action cannot be undone.`}
    confirmLabel="Delete"
    confirmVariant="danger"
    onConfirm={handleDelete}
    onCancel={() => setShowDeleteModal(false)}
  />
)}
```

### Step 4: Create ConfirmModal Component

**File: `frontend/src/components/ui/ConfirmModal.tsx`** (new)

```tsx
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './Button';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        />

        {/* Modal */}
        <motion.div
          className="relative bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-6 max-w-md w-full mx-4"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <h3 className="text-lg font-semibold text-gray-100 mb-2">
            {title}
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            {message}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button
              variant={confirmVariant}
              onClick={() => {
                onConfirm();
                onCancel();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
```

### Step 5: Update Button Component (if needed)

**File: `frontend/src/components/ui/Button.tsx`**

Ensure the Button component supports a `danger` variant. If not already present, add:

```typescript
type ButtonVariant = 'primary' | 'secondary' | 'danger';

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white',
  secondary: 'bg-gray-700 hover:bg-gray-600 text-gray-200',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
};
```

### Step 6: Priority Dropdown in CardMetadata

**File: `frontend/src/components/card-detail/CardMetadata.tsx`**

Replace the read-only priority badge with a clickable dropdown:

```tsx
import { useState, useRef, useEffect } from 'react';
// ... other imports

// Add new component for the priority dropdown
function PrioritySelector({
  currentPriority,
  onSelect,
}: {
  currentPriority: 'low' | 'medium' | 'high' | null;
  onSelect: (priority: 'low' | 'medium' | 'high' | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (priority: 'low' | 'medium' | 'high' | null) => {
    onSelect(priority);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {currentPriority ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="hover:opacity-80 transition-opacity"
        >
          <PriorityBadge priority={currentPriority} size="md" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 border border-dashed border-gray-700 hover:border-gray-500 transition-colors"
        >
          Set priority
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg py-1 min-w-[120px]">
          <button
            onClick={() => handleSelect('high')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <PriorityBadge priority="high" size="sm" />
            <span className="text-gray-300">High</span>
          </button>
          <button
            onClick={() => handleSelect('medium')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <PriorityBadge priority="medium" size="sm" />
            <span className="text-gray-300">Medium</span>
          </button>
          <button
            onClick={() => handleSelect('low')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <PriorityBadge priority="low" size="sm" />
            <span className="text-gray-300">Low</span>
          </button>
          {currentPriority && (
            <>
              <div className="border-t border-gray-700 my-1" />
              <button
                onClick={() => handleSelect(null)}
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
              >
                Clear priority
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Update the priority section in CardMetadata component:
<div>
  <p className="text-xs text-gray-500 mb-1">Priority</p>
  <PrioritySelector
    currentPriority={frontmatter.priority || null}
    onSelect={async (priority) => {
      await updateCard(card.slug, { priority });
    }}
  />
</div>
```

### Step 7: Assignee Dropdown in CardMetadata

**File: `frontend/src/components/card-detail/CardMetadata.tsx`**

Add an assignee selector component similar to the priority selector:

```tsx
// Add new component for the assignee dropdown
function AssigneeSelector({
  currentAssignee,
  onSelect,
}: {
  currentAssignee: 'user' | 'agent' | null;
  onSelect: (assignee: 'user' | 'agent' | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (assignee: 'user' | 'agent' | null) => {
    onSelect(assignee);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {currentAssignee ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="hover:opacity-80 transition-opacity"
        >
          <AssigneeBadge assignee={currentAssignee} size="md" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 border border-dashed border-gray-700 hover:border-gray-500 transition-colors"
        >
          Set assignee
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg py-1 min-w-[120px]">
          <button
            onClick={() => handleSelect('user')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <AssigneeBadge assignee="user" size="sm" />
            <span className="text-gray-300">User</span>
          </button>
          <button
            onClick={() => handleSelect('agent')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <AssigneeBadge assignee="agent" size="sm" />
            <span className="text-gray-300">Agent</span>
          </button>
          {currentAssignee && (
            <>
              <div className="border-t border-gray-700 my-1" />
              <button
                onClick={() => handleSelect(null)}
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
              >
                Clear assignee
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Update the assignee section in CardMetadata component:
<div>
  <p className="text-xs text-gray-500 mb-1">Assignee</p>
  <AssigneeSelector
    currentAssignee={frontmatter.assignee || null}
    onSelect={async (assignee) => {
      await updateCard(card.slug, { assignee });
    }}
  />
</div>
```

### Step 8: Reposition Attachments Section

**File: `frontend/src/components/card-detail/CardDetailPanel.tsx`**

Move the Attachments section from its current position (between CardMetadata and CardContent, lines 86-106) to the bottom (after TaskList). New structure:

```tsx
<div className="p-6 space-y-6">
  <CardMetadata card={activeCard} />

  <CardContent content={activeCard.content} cardSlug={activeCard.slug} />

  <TaskList
    tasks={activeCard.tasks}
    cardSlug={activeCard.slug}
  />

  {/* Attachments section - moved to bottom */}
  <div className="border-t border-gray-700 pt-4">
    <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
        />
      </svg>
      Attachments
    </h3>
    <p className="text-sm text-gray-600 italic">
      Coming soon...
    </p>
  </div>
</div>
```

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/components/card-detail/CardDetailHeader.tsx` | Add inline title editing, delete button, confirmation modal |
| `frontend/src/components/card-detail/CardMetadata.tsx` | Add `PrioritySelector` and `AssigneeSelector` dropdown components |
| `frontend/src/components/card-detail/CardDetailPanel.tsx` | Move Attachments section to bottom (after TaskList) |
| `frontend/src/components/ui/ConfirmModal.tsx` | **NEW** — Confirmation modal component |
| `frontend/src/components/ui/Button.tsx` | Add `danger` variant if not already present |

## Verification

1. **Title editing:**
   - Open a card detail panel
   - Click on the title → verify it becomes an editable input
   - Edit the title and press Enter → verify the title updates
   - Edit and press Escape → verify changes are cancelled
   - Edit and click outside → verify the title saves on blur
   - Verify the updated title appears in both the detail panel and the card preview in the lane

2. **Priority dropdown:**
   - Open a card with a priority set
   - Click the priority badge → verify dropdown appears with High/Medium/Low options
   - Select a different priority → verify the badge updates immediately
   - Click "Clear priority" → verify the badge is replaced with "Set priority" button
   - On a card with no priority, click "Set priority" → verify dropdown appears
   - Select a priority → verify the badge appears

3. **Assignee dropdown:**
   - Open a card with an assignee set
   - Click the assignee badge → verify dropdown appears with User/Agent options
   - Select a different assignee → verify the badge updates immediately
   - Click "Clear assignee" → verify the badge is replaced with "Set assignee" button
   - On a card with no assignee, click "Set assignee" → verify dropdown appears
   - Select an assignee → verify the badge appears

4. **Delete card:**
   - Open a card detail panel
   - Click the trashcan icon → verify confirmation modal appears
   - Click "Cancel" → verify modal closes, card remains
   - Click trashcan again, then "Delete" → verify:
     - Card is moved to archive folder
     - Detail panel closes
     - Card disappears from the lane
   - Verify WebSocket sync: delete a card in one tab, check that it disappears in another tab

5. **Attachments repositioning:**
   - Open any card detail panel
   - Scroll through the panel content
   - Verify the order is: Metadata → Description → Tasks → Attachments
   - Verify the Attachments section is at the bottom

6. **WebSocket sync:**
   - Open the same card in two browser tabs
   - Edit title/priority/assignee in tab 1 → verify updates appear in tab 2
   - Delete a card in tab 1 → verify detail panel closes in tab 2 if viewing the same card

7. **Keyboard shortcuts:**
   - Title editing: Verify Enter saves, Escape cancels
   - Delete modal: Verify Escape closes the modal
   - Dropdowns: Verify clicking outside closes them
