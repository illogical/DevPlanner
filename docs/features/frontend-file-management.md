# Feature: Frontend File Management UI

**Status**: Ready for Implementation
**Backend Status**: ✅ Complete (see `reference-file-management.md`)
**Frontend Status**: ⏳ In Progress (types and API client done)
**Scope**: Text files only (code, markdown, .txt, JSON, etc.)

---

## Overview

Implement the frontend UI for file management in DevPlanner, building on the completed backend infrastructure. This feature provides two UI surfaces for managing project files:

1. **Card Files Section** - In card detail panel, showing files attached to that card
2. **Files Panel** - Sidebar panel for project-level file browsing and management

**Focus**: Text files (`.md`, `.txt`, `.json`, `.js`, `.ts`, `.yaml`, etc.) for AI agent workflows. Images and PDFs are out of scope.

---

## Backend Context (Already Complete)

The backend provides:
- **FileService** with CRUD, deduplication, many-to-many card associations
- **8 REST API endpoints** with WebSocket broadcasting for all file mutations
- **MCP tools** for AI agents (`list_project_files`, `list_card_files`, `read_file_content`)
- **File storage** in `workspace/{projectSlug}/_files/` with metadata in `_files.json`
- **WebSocket events**: `file:added`, `file:deleted`, `file:updated`, `file:associated`, `file:disassociated`

See `docs/features/reference-file-management.md` for full backend details.

---

## Frontend Architecture

### Existing Foundation

Already implemented:
- ✅ Type definitions in `frontend/src/types/index.ts` (`ProjectFileEntry`, `FilesResponse`)
- ✅ API client in `frontend/src/api/client.ts` (`filesApi` module with all CRUD methods)

Patterns to follow:
- **Zustand store** for state management with optimistic updates
- **Framer Motion** for panel animations (slide-in from right)
- **WebSocket integration** with self-echo deduplication using `_recordLocalAction()`
- **Panel mutual exclusivity** - Files panel and Activity panel can't both be open
- **Native HTML5 drag-and-drop** for file uploads (NOT `@dnd-kit`)

---

## Implementation Plan

### Phase 1: Utility Functions

**File**: `frontend/src/utils/file.ts` (new file)

Create reusable utility functions:

```typescript
/**
 * Format file size in bytes to human-readable string
 * Example: 1536 → "1.5 KB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if MIME type represents a text file (readable by AI agents)
 */
export function isTextFile(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    [
      'application/json',
      'application/javascript',
      'application/typescript',
      'application/xml',
      'application/yaml',
    ].includes(mimeType)
  );
}

/**
 * Get Tailwind CSS class for file icon color based on MIME type
 */
export function getFileIconClass(mimeType: string): string {
  if (mimeType.startsWith('text/markdown')) return 'text-blue-400';
  if (mimeType.startsWith('text/')) return 'text-gray-400';
  if (mimeType.includes('json')) return 'text-yellow-400';
  if (mimeType.includes('javascript') || mimeType.includes('typescript')) {
    return 'text-green-400';
  }
  if (mimeType.includes('yaml') || mimeType.includes('xml')) {
    return 'text-purple-400';
  }
  return 'text-gray-500';
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}
```

---

### Phase 2: Zustand Store Integration

**File**: `frontend/src/store/index.ts`

#### 2.1 State Shape Additions

Add to `DevPlannerStore` interface and initial state:

```typescript
// State
projectFiles: ProjectFileEntry[];
isLoadingFiles: boolean;
isUploadingFile: boolean;
isFilesPanelOpen: boolean;

// Initial values
projectFiles: [],
isLoadingFiles: false,
isUploadingFile: false,
isFilesPanelOpen: false,
```

#### 2.2 File Actions

**loadProjectFiles()**
- Set `isLoadingFiles: true`
- Call `filesApi.list(activeProjectSlug)`
- Update `projectFiles` state
- Handle errors gracefully (log to console)
- Set `isLoadingFiles: false` in finally block

**uploadFile(file: File, description?: string, autoAssociateCardSlug?: string)**
- Set `isUploadingFile: true`
- Call `filesApi.upload()`
- Record local action: `_recordLocalAction('file:added:${filename}')`
- If `autoAssociateCardSlug` provided:
  - Call `filesApi.associate()`
  - Record action: `_recordLocalAction('file:associated:${filename}:${cardSlug}')`
  - Update uploaded file's `cardSlugs` array
- Optimistically add file to `projectFiles` array (prepend)
- Set `isUploadingFile: false` in finally block

**deleteFile(filename: string)**
- Record local action: `_recordLocalAction('file:deleted:${filename}')`
- Call `filesApi.delete()`
- Optimistically remove from `projectFiles`
- If `activeCard` has this file, refetch card details
- On error: revert by calling `loadProjectFiles()` and rethrow

**updateFileDescription(filename: string, description: string)**
- Record local action: `_recordLocalAction('file:updated:${filename}')`
- Call `filesApi.update()`
- Optimistically update file in `projectFiles` array
- On error: revert and rethrow

**associateFile(filename: string, cardSlug: string)**
- Record local action: `_recordLocalAction('file:associated:${filename}:${cardSlug}')`
- Call `filesApi.associate()`
- Optimistically update `cardSlugs` array in `projectFiles`
- On error: revert and rethrow

**disassociateFile(filename: string, cardSlug: string)**
- Record local action: `_recordLocalAction('file:disassociated:${filename}:${cardSlug}')`
- Call `filesApi.disassociate()`
- Optimistically remove cardSlug from `cardSlugs` array
- On error: revert and rethrow

#### 2.3 Panel Control Actions

**toggleFilesPanel()**
- Toggle `isFilesPanelOpen`
- If opening Files panel, close Activity panel (`isActivityPanelOpen: false`)
- Implements mutual exclusivity

**setFilesPanelOpen(open: boolean)**
- Simple setter for `isFilesPanelOpen`

**Update toggleActivityPanel()** for mutual exclusivity:
- Toggle `isActivityPanelOpen`
- If opening Activity panel, close Files panel (`isFilesPanelOpen: false`)

#### 2.4 WebSocket Event Handlers

**wsHandleFileAdded(data: { file: ProjectFileEntry })**
- Check self-echo: `_isRecentLocalAction('file:added:${filename}')`
- If self-echo, log and return
- Add to `projectFiles` (dedup by filename - replace if exists, otherwise prepend)

**wsHandleFileDeleted(data: { filename: string })**
- Check self-echo
- Remove from `projectFiles`
- If `activeCard` has this file, refetch card details

**wsHandleFileUpdated(data: { file: ProjectFileEntry })**
- Check self-echo
- Update file in `projectFiles` array (map and replace)

**wsHandleFileAssociated(data: { filename: string; cardSlug: string })**
- Check self-echo
- Find file in `projectFiles`, add cardSlug to `cardSlugs` array if not present
- If `activeCard.slug` matches, refetch card details

**wsHandleFileDisassociated(data: { filename: string; cardSlug: string })**
- Check self-echo
- Find file in `projectFiles`, remove cardSlug from `cardSlugs` array
- If `activeCard.slug` matches, refetch card details

---

### Phase 3: WebSocket Event Registration

**File**: `frontend/src/hooks/useWebSocket.ts`

Register the 5 file event handlers:

```typescript
client.on('file:added', (data) => {
  wsHandleFileAdded?.(data as { file: ProjectFileEntry });
}),
client.on('file:deleted', (data) => {
  wsHandleFileDeleted?.(data as { filename: string });
}),
client.on('file:updated', (data) => {
  wsHandleFileUpdated?.(data as { file: ProjectFileEntry });
}),
client.on('file:associated', (data) => {
  wsHandleFileAssociated?.(data as { filename: string; cardSlug: string });
}),
client.on('file:disassociated', (data) => {
  wsHandleFileDisassociated?.(data as { filename: string; cardSlug: string });
}),
```

Add to existing event registration array in `useWebSocket` hook.

---

### Phase 4: FileListItem Component (Reusable)

**File**: `frontend/src/components/files/FileListItem.tsx` (new file)

**Props**:
```typescript
interface FileListItemProps {
  file: ProjectFileEntry;
  onDisassociate?: () => void;  // Remove from card (only in card context)
  onDelete?: () => void;         // Delete file completely
  showActions?: boolean;          // Show 3-dot menu (default true)
}
```

**Features**:
- File icon with color based on MIME type (use `getFileIconClass()`)
- Clickable filename that downloads file (`/api/projects/.../files/{filename}/download`)
- Show "Stored as: ..." if `originalName !== filename` (deduplicated names)
- Inline description editing (textarea + Save/Cancel buttons)
- 3-dot menu with actions:
  - "Edit description" - toggles inline editor
  - "Remove from card" - calls `onDisassociate` (if provided)
  - "Delete file" - calls `onDelete` (if provided, red text)
- Metadata row: file size, association count ("3 cards")
- Click-outside detection to close menu (useRef + useEffect)
- Group hover for menu button visibility (`opacity-0 group-hover:opacity-100`)

**Styling**:
- `bg-gray-800 hover:bg-gray-750` card background
- Truncate long filenames with `title` tooltip
- 3-dot menu: absolute positioned, z-10, `min-w-[160px]`

---

### Phase 5: CardFiles Component

**File**: `frontend/src/components/card-detail/CardFiles.tsx` (new file)

**Props**:
```typescript
interface CardFilesProps {
  cardSlug: string;  // Current card slug
}
```

**Features**:

1. **Header**: "Files ({count})" with paperclip icon
2. **Upload Zone** (drag-and-drop):
   - Native HTML5 `onDragOver`, `onDrop`, `onDragLeave`
   - Dashed border, changes to `border-blue-500 bg-blue-500/10` when dragging
   - Hidden file input, triggered by button click
   - Cloud upload icon, text: "Drop file or click to upload" / "Uploading..."
   - Auto-associates uploaded file with current card
3. **File List**:
   - Filter `projectFiles` by `cardSlugs.includes(cardSlug)`
   - Render `FileListItem` for each file
   - Pass `onDisassociate={() => disassociateFile(filename, cardSlug)}`
   - Show "No files attached" if empty

**State**:
- `isDragging` - visual feedback during drag
- `fileInputRef` - trigger file input programmatically

**Integration**:
Replace placeholder in `frontend/src/components/card-detail/CardDetailPanel.tsx` (lines 92-113) with:
```typescript
import { CardFiles } from './CardFiles';
// ...
<CardFiles cardSlug={activeCard.slug} />
```

---

### Phase 6: FilesPanel Component (Sidebar)

**File**: `frontend/src/components/files/FilesPanel.tsx` (new file)

**Props**:
```typescript
interface FilesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}
```

**Layout** (same pattern as `ActivityPanel`):
- Framer Motion `AnimatePresence` wrapper
- Backdrop: fixed, `bg-black/30`, z-40, click to close
- Panel: slide-in from right, `w-full md:w-[500px]`, z-50, `bg-gray-900`
- Animations: `initial={{ x: '100%' }}`, `animate={{ x: 0 }}`, spring transition

**Structure**:

1. **Header**:
   - "Project Files" title
   - Close button (X icon)

2. **Toolbar** (border-bottom):
   - **Upload button**: Full-width, blue, cloud icon, "Upload File" / "Uploading..."
   - **Search input**: Magnifying glass icon, "Search files...", filters by filename + description
   - **Filter tabs**: 3 buttons with counts
     - "All ({total})"
     - "Text ({textCount})" - filters by `isTextFile(mimeType)`
     - "Unassoc. ({unassocCount})" - filters by `cardSlugs.length === 0`

3. **File List** (flex-1, overflow-y-auto):
   - Loading spinner if `isLoadingFiles`
   - Empty state: "No files uploaded yet" / "No files match your search"
   - Render `FileListItem` for each filtered file
   - Pass `onDelete={() => setShowDeleteConfirm(filename)}`

4. **Delete Confirmation Modal**:
   - Overlay modal with backdrop (z-60)
   - "Delete File" title
   - "Are you sure..." message
   - Cancel + Delete (red) buttons
   - On confirm: call `deleteFile()` and close modal

**Effects**:
- `useEffect` on `isOpen` - load files when panel opens
- `useEffect` for Escape key - close panel

**State**:
- `searchQuery` - search input value
- `filterMode` - 'all' | 'text' | 'unassociated'
- `showDeleteConfirm` - filename to delete (or null)
- `fileInputRef` - trigger file input

---

### Phase 7: Header Integration

**File**: `frontend/src/components/layout/Header.tsx`

Add Files toggle button after Activity button (around line 168):

```typescript
// Import at top
const { isFilesPanelOpen, toggleFilesPanel } = useStore();

// Add button (after Activity toggle)
<button
  onClick={toggleFilesPanel}
  className={cn(
    'p-2 rounded-lg transition-colors',
    isFilesPanelOpen
      ? 'bg-blue-500/20 text-blue-400'
      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
  )}
  aria-label="Project files"
  title="Project files"
>
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
    />
  </svg>
</button>
```

Use paperclip/attachment icon from Heroicons.

---

### Phase 8: App Integration

**File**: `frontend/src/App.tsx`

Import and render `FilesPanel`:

```typescript
import { FilesPanel } from './components/files/FilesPanel';

function App() {
  const {
    isActivityPanelOpen,
    setActivityPanelOpen,
    isFilesPanelOpen,
    setFilesPanelOpen,
  } = useStore();

  return (
    <MainLayout connectionState={connectionState}>
      <KanbanBoard />
      <CardDetailPanel />
      <ActivityPanel
        isOpen={isActivityPanelOpen}
        onClose={() => setActivityPanelOpen(false)}
      />
      <FilesPanel
        isOpen={isFilesPanelOpen}
        onClose={() => setFilesPanelOpen(false)}
      />
    </MainLayout>
  );
}
```

---

## Testing & Verification

### Manual Test Cases

**1. File Upload - Card Context**
- ✓ Open card detail panel
- ✓ Drag `.md` file into upload zone
- ✓ Verify file appears in card files list
- ✓ Verify file is auto-associated (check Files panel shows card count)

**2. File Upload - Project Context**
- ✓ Open Files panel
- ✓ Click "Upload File" button
- ✓ Select `.txt` file
- ✓ Verify appears in project files list

**3. File Disassociation**
- ✓ In card detail, click menu > "Remove from card"
- ✓ Verify file disappears from card
- ✓ Verify file still in Files panel with updated card count

**4. File Deletion**
- ✓ In Files panel, click menu > "Delete file"
- ✓ Confirm in modal
- ✓ Verify file disappears everywhere

**5. Description Editing**
- ✓ Click menu > "Edit description"
- ✓ Enter text, click Save
- ✓ Verify description shows in file list

**6. Panel Mutual Exclusivity**
- ✓ Open Activity panel
- ✓ Click Files button → Activity closes, Files opens
- ✓ Click Activity button → Files closes, Activity opens

**7. WebSocket Real-Time Sync**
- ✓ Open 2 tabs, same project
- ✓ Upload in tab 1 → appears in tab 2 (< 500ms)
- ✓ Delete in tab 2 → disappears in tab 1
- ✓ Associate with card in tab 1 → visible in tab 2 card detail

**8. Filters & Search**
- ✓ Upload mix of `.md`, `.json`, `.pdf` files
- ✓ Filter "Text" → only text files show
- ✓ Filter "Unassoc." → only unassociated files show
- ✓ Search by filename → filters correctly

**9. Edge Cases**
- ✓ Duplicate filename → auto-renamed (`file-2.txt`)
- ✓ Special chars in filename → URL encoded correctly
- ✓ Delete file while card open → card updates
- ✓ Upload during network issue → error handled gracefully

---

## Files Created/Modified Summary

### New Files (4)
1. `frontend/src/utils/file.ts` - Utility functions
2. `frontend/src/components/files/FileListItem.tsx` - Reusable file row
3. `frontend/src/components/files/FilesPanel.tsx` - Sidebar panel
4. `frontend/src/components/card-detail/CardFiles.tsx` - Card attachments section

### Modified Files (5)
1. `frontend/src/store/index.ts` - State, actions, WebSocket handlers
2. `frontend/src/hooks/useWebSocket.ts` - Event registration
3. `frontend/src/components/layout/Header.tsx` - Files toggle button
4. `frontend/src/components/card-detail/CardDetailPanel.tsx` - Replace placeholder
5. `frontend/src/App.tsx` - Render FilesPanel

---

## Key Design Decisions

1. **Text File Focus**: Filtering and UI prioritize text files for AI agent workflows
2. **Auto-association**: Files uploaded in card context automatically associate with that card
3. **Optimistic Updates**: All mutations update UI immediately, revert on error
4. **Self-Echo Dedup**: WebSocket events use `_recordLocalAction()` to prevent double updates
5. **Panel Mutual Exclusivity**: Only one sidebar panel open at a time (Files OR Activity)
6. **Native Drag-Drop**: Use HTML5 APIs, not `@dnd-kit` library
7. **Inline Editing**: Descriptions edited inline, no separate modal
8. **Reusable Component**: `FileListItem` used in both card and project contexts
9. **No File Preview**: Clicking downloads file; preview can be added later

---

## Estimated Effort

**Total**: 10-12 hours

- Phase 1 (Utils): 30 min
- Phase 2 (Store): 2 hours
- Phase 3 (WebSocket): 1 hour
- Phase 4 (FileListItem): 1.5 hours
- Phase 5 (CardFiles): 1.5 hours
- Phase 6 (FilesPanel): 2.5 hours
- Phase 7 (Header): 15 min
- Phase 8 (App): 15 min
- Testing & fixes: 2 hours

---

## Dependencies

- Backend file management API (✅ complete)
- Zustand store patterns (✅ exists)
- Framer Motion (✅ installed)
- WebSocket infrastructure (✅ exists)
- Heroicons (✅ in use)
- File upload API client (✅ exists in `filesApi`)

---

## Future Enhancements (Out of Scope)

- File preview modal for text files
- Multi-file upload (bulk operations)
- Progress bars for large uploads
- File organization (folders, tags)
- Image/PDF support with thumbnails
- Drag files between cards
- File version history
