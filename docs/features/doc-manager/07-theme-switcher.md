# 07 — Theme Switcher (Low Priority)

**Status:** Planning (Low Priority — Future)  
**Depends on:** 02-Markdown Viewer (VaultPad styles defined)  
**Phase:** 22.7

---

## Goal

Add a theme switcher that lets users toggle between DevPlanner's current Tailwind dark theme and a "VaultPad" theme that uses the VaultPad color palette. The VaultPad theme uses deeper blue/teal tones and VS Code-inspired accent colors.

---

## VaultPad Color Palette

```css
/* Background */
--bg: #15232D               /* Very dark navy blue */
--surface-editor: #15232D   /* Editor background */
--surface-preview: #1A3549  /* Preview background — slightly lighter blue */
--surface-drawer: #15232D   /* File selector background */

/* Text */
--text: #d4d4d4             /* Off-white */
--muted: #9da3ad            /* Dimmed text */

/* Accents */
--accent: #4fc1ff           /* Bright cyan — primary */
--accent-2: #c586c0         /* Pink */
--accent-3: #dcdcaa         /* Yellow */
--accent-4: #9cdcfe         /* Light blue */
--accent-5: #ce9178         /* Brown/orange */

/* Semantic */
--ok: #2ea043               /* Green — success */
--border: #2d2d30           /* Dark gray */
```

---

## Design

### Theme Toggle

- Small toggle button in the `Header` (e.g., a paintbrush or palette icon)
- Two states: "DevPlanner" (default) and "VaultPad"
- Persisted to user preferences (localStorage or backend `_preferences.json`)
- Applies immediately without page reload

### Scope

**Phase 1 (initial):** Theme only affects the Doc Manager views (Viewer, Editor, Diff). The Kanban board keeps its existing Tailwind theme.

**Phase 2 (future):** Full app theme support — Kanban board, sidebar, header all adopt VaultPad colors.

### Implementation Approach

Use CSS custom properties (variables) at the `:root` level, switchable by a `data-theme` attribute on `<html>`:

```css
html[data-theme="devplanner"] {
  --dm-bg: /* current Tailwind gray-950 */;
  --dm-surface: /* current Tailwind gray-900 */;
  --dm-text: /* current Tailwind gray-200 */;
  --dm-accent: /* current blue-500 */;
  /* ... */
}

html[data-theme="vaultpad"] {
  --dm-bg: #15232D;
  --dm-surface: #1A3549;
  --dm-text: #d4d4d4;
  --dm-accent: #4fc1ff;
  /* ... */
}
```

Doc Manager components reference these variables in their Tailwind classes (via `theme.extend`), so switching the data attribute switches the palette.

---

## Implementation Tasks

### 22.7.1 — Define CSS custom properties for both themes
- Add theme variables to `frontend/src/index.css`
- Map both DevPlanner and VaultPad palettes to shared variable names

### 22.7.2 — Create `useTheme` hook
- `frontend/src/hooks/useTheme.ts`
- Reads theme from localStorage, applies `data-theme` attribute to `<html>`
- Returns `{ theme, setTheme, toggleTheme }`
- Persists choice to localStorage

### 22.7.3 — Create `ThemeToggle` component
- `frontend/src/components/ui/ThemeToggle.tsx`
- Small button/icon in the header
- Tooltip explains the current theme

### 22.7.4 — Update Doc Manager components to use theme variables
- `MarkdownPreview`, `EditorPane`, `FileBrowserDrawer`, diff components
- Replace hardcoded color classes with theme-aware alternatives

---

## Notes

- This is explicitly low priority. It should be one of the last things implemented.
- The VaultPad palette is designed for VS Code-style dark themes. It may not work well as a "light mode" option. If light mode is ever needed, it would be a separate theme.
- Consider allowing users to customize individual accent colors in the future (fully custom themes).
