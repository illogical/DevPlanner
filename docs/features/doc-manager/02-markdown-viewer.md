# 02 — Markdown Viewer

**Status:** Planning  
**Depends on:** 01-Navigation  
**Phase:** 22.2

---

## Goal

A read-only Markdown viewer that renders vault artifact files with rich styling. Inspired by VaultPad's view mode, but rebuilt with React components and Tailwind CSS. The viewer is a full-width rendered preview — no editor pane visible.

---

## Feature Set

### Core Rendering

- **YAML frontmatter** — Parsed and displayed in a styled 2-column grid section above the body (key in accent color, value in secondary color). Empty/null fields like `sources: []` are hidden.
- **Headings** — `# H1`, `## H2`, `### H3` with color-coded text (blue, yellow, pink per VaultPad palette)
- **Lists** — Unordered `- item` rendered as styled bullet lists
- **Code blocks** — Fenced ` ``` ` blocks rendered with `highlight.js` syntax highlighting (already a dependency from Phase 21 Diff Viewer)
- **Key-value pairs** — Lines like `Author: John Doe` rendered with key in blue monospace and value in orange
- **Inline code** — Backtick-wrapped text in monospace with subtle background
- **Links** — Rendered as clickable cyan links
- **Paragraphs** — Standard body text with comfortable line height

### Loading & Navigation

- Load file from URL query param: `/viewer?path=my-project/file.md`
- Empty state when no file is loaded (prompt to open file browser)
- Show loading spinner while fetching file content
- Error banner on load failure (file not found, vault not configured)
- File path displayed in header breadcrumb area

### Integration Points

- **File Browser** (Phase 22.4) — Clicking a file in the browser navigates to `/viewer?path=<relativePath>`
- **Editor** — "Edit" button switches to `/editor?path=<samePath>` (preserves current file)
- **Card Links** — Vault artifact links in card detail can "Open in Viewer" as an alternative to "Open in Diff Viewer"

---

## Implementation Tasks

### 22.2.1 — Create `MarkdownPreview` shared component
- `frontend/src/components/doc/MarkdownPreview.tsx`
- Accepts `content: string` and renders parsed + styled HTML
- Uses the existing `marked` library (already a dependency) for Markdown parsing
- Configure `marked` with custom renderer for:
  - Frontmatter: detect `---` delimiters, parse YAML, render grid
  - Code blocks: apply `highlight.js` highlighting
  - Headings: apply VaultPad color classes
  - Key-value lines: custom pattern detection
- This component is **reused** by the Editor's preview pane (Phase 22.3)

### 22.2.2 — Create frontmatter parser utility
- `frontend/src/utils/frontmatter.ts`
- `parseFrontmatter(content: string): { frontmatter: Record<string, string> | null; body: string }`
- Extracts YAML between `---` delimiters
- Filters empty values (`[]`, `""`, `null`)
- Port logic from VaultPad's `parseFrontmatter()` but return structured data, not HTML strings

### 22.2.3 — Create `FrontmatterDisplay` component
- `frontend/src/components/doc/FrontmatterDisplay.tsx`
- Accepts parsed frontmatter record
- Renders as 2-column grid with styled key/value pairs
- Key: cyan/blue monospace text
- Value: off-white or orange accent text
- Bordered section with subtle background

### 22.2.4 — Create `ViewerPage`
- `frontend/src/pages/ViewerPage.tsx`
- Reads `?path=` from URL search params
- Fetches content via `vaultApi.getContent(path)`
- Renders `FrontmatterDisplay` + `MarkdownPreview`
- Full-width layout, scrollable, comfortable reading width (max-w-4xl centered or full bleed — TBD based on styling)
- Empty state: centered message + "Open File Browser" button
- Loading state: spinner
- Error state: red banner with message

### 22.2.5 — Add `ViewerPage` to router
- Register `/viewer` route in `App.tsx` (within `AppShell`)
- Route renders `ViewerPage`

### 22.2.6 — Add doc state to Zustand store
- New store slice: `docSlice` in `frontend/src/store/slices/docSlice.ts`
- State:
  ```typescript
  interface DocSlice {
    docFilePath: string | null;       // Currently loaded file path (shared across viewer/editor)
    docContent: string | null;        // File content as loaded from server
    docIsLoading: boolean;
    docError: string | null;
    loadDocFile: (path: string) => Promise<void>;
    clearDoc: () => void;
  }
  ```
- This centralizes file loading so viewer and editor share the same loaded file

### 22.2.7 — Add vault file API methods
- Extend `vaultApi` in `frontend/src/api/client.ts`:
  - `getFile(path: string): Promise<{ path: string; content: string; updatedAt: string }>` — wraps existing `getContent()` with metadata

---

## Styling

Follow VaultPad's preview surface with DevPlanner's Tailwind approach:

| Element | VaultPad Color | Tailwind Equivalent |
|---------|---------------|---------------------|
| Preview background | `#1A3549` | Custom class or `bg-[#1A3549]` |
| H1 text | `#9cdcfe` | `text-[#9cdcfe]` |
| H2 text | `#dcdcaa` | `text-[#dcdcaa]` |
| H3 text | `#c586c0` | `text-[#c586c0]` |
| Key-value key | Light blue, monospace | `text-cyan-400 font-mono` |
| Key-value value | `#ce9178` | `text-[#ce9178]` |
| Code blocks | Dark bg with border | `bg-gray-900 border border-gray-700` |
| Body text | `#d4d4d4` | `text-gray-300` |
| Links | `#4fc1ff` | `text-cyan-400 underline` |

These colors are used **only within the MarkdownPreview** component, not globally. They will also be available via the theme switcher (Phase 22.7) for broader use.

---

## Notes

- The `marked` library is already in `frontend/package.json` — no new dependency needed
- `highlight.js` is also already available from the Diff Viewer
- VaultPad uses a custom Markdown parser (`renderMarkdown` function). We should use `marked` with a custom renderer instead — it handles more Markdown edge cases (tables, blockquotes, images, nested lists)
- The `MarkdownPreview` component should accept an optional `className` prop for container styling, so the editor pane can style it differently from the viewer
