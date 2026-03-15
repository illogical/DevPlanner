# Lane Focus Mode

## Overview

Double-clicking a lane's header area expands that lane to fill all available horizontal space, pushing the other lanes off-screen to the right. This "focus mode" reveals richer card details by using a wider 3-column card layout. Double-clicking the header again animates the lane back to its standard width.

## Motivation

The standard lane card (320px) is space-constrained: tasks are collapsible, descriptions are hidden, and links are not visible at all. Focus mode unlocks the full width of the board for a single lane, surfacing the information you need to plan and act without opening individual card detail panels.

## UX Behaviour

| Trigger | Result |
|---|---|
| Double-click lane header (normal mode) | Lane expands to fill remaining board width; other lanes slide off-screen right |
| Double-click lane header (focus mode) | Lane animates back to standard width; other lanes slide back in |
| Single-click cards | Card detail panel still opens as normal |
| Drag-and-drop | Disabled while a lane is in focus mode (simplifies layout) |
| Keyboard: `Escape` | Exit focus mode |

The focused lane takes all available horizontal space after accounting for the sidebar and activity panel. All other lanes are translated off-screen to the right with a short spring animation and reduced opacity during the transition.

## Visual Design

### Normal → Focus Transition

- Duration: `400ms` spring (`damping: 30, stiffness: 120`)
- Focused lane: `flex-1 min-w-0` (fills remaining space)
- Other lanes: `translate-x-full opacity-0 pointer-events-none` (hidden, not removed from DOM so their state is preserved)
- Lane header: adds a subtle "exit focus" icon (✕ or collapse arrows) on the right side of the title bar while in focus mode

### Expanded Card Layout

Each card in focus mode switches from the narrow vertical layout to a **horizontal 3-panel card**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Priority bar]  HE-28  Card Title (larger)              [Status] [Assignee] │
│                  ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ─── │
│  [████████░░░░] 2/4 tasks        │  ☑ Task one completed              Links  │
│                                  │  ☑ Task two completed              ──────  │
│  Description text (2–3 lines,    │  ☐ Task three to do                🔗 Doc  │
│  muted, smaller weight, italic   │  ☐ Task four to do                 🔗 Spec │
│  or lighter color)               │                                            │
│  ─────────────────────────────── │                                            │
│  [tag1] [tag2]  Created Mar 5    │                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Column breakdown (inside the wider card):**

| Column | Width | Content |
|---|---|---|
| **Left — Identity** | `~36%` | Card ID, title (1.5× size), priority left-border accent, description (muted italic, 3-line clamp), tags row, created date |
| **Center — Tasks** | `~36%` | All tasks rendered as checkboxes (interactive), no collapse — full list visible; if >8 tasks shows scroll |
| **Right — Context** | `~28%` | Task progress mini-bar at top, then links list (icon + label), then status badge + assignee at bottom |

**Visual weight hierarchy:**
- **Title**: `text-base font-semibold text-gray-100` (highest)
- **Card ID**: `font-mono text-xs text-gray-500` (low, easily skipped)
- **Tasks**: `text-sm text-gray-300` checked items get `line-through text-gray-600`
- **Description**: `text-xs italic text-gray-500` (deliberately muted — background context)
- **Links**: icon-first, `text-xs text-blue-400 hover:text-blue-300`
- **Tags**: existing `Badge` component, unchanged
- **Dates**: `text-xs text-gray-600` (lowest weight)

### Lane Header in Focus Mode

The lane header gains a **collapse indicator** on the right side — a pair of inward-pointing arrows icon (`⇤ ⇥` or similar). A tooltip reads "Exit focus mode (double-click)". The collapse toggle button (the normal `^` chevron) is hidden while focused because collapse is meaningless when already expanded.

## State

Add `focusedLane: string | null` to `uiSlice`.

```ts
// uiSlice additions
focusedLane: null as string | null,
setFocusedLane: (slug: string | null) => void,
```

`KanbanBoard` passes `isFocused` and `onFocusToggle` to each `Lane`. The board's outer container changes its layout:

```
// Normal: flex gap-3 overflow-x-auto
// Focus:  flex overflow-hidden  (no gap needed, single lane fills all)
```

## Component Changes

### `uiSlice.ts`
- Add `focusedLane: string | null` field (default `null`)
- Add `setFocusedLane(slug: string | null)` action
- `toggleLaneCollapsed` should be a no-op if that lane is focused

### `KanbanBoard.tsx`
- Subscribe to `focusedLane` from store
- Pass `isFocused` and `isHidden` props to each `Lane`
- Disable DnD sensors when `focusedLane !== null`
- Add `useEffect` for `Escape` key to clear `focusedLane`

### `Lane.tsx`
- Accept `isFocused: boolean` and `isHidden: boolean` props
- Wrap root `div` in `motion.div` from Framer Motion
- Animate width: `isFocused ? 'flex-1' : 'w-80'`; hidden lanes: `translateX(100%) opacity 0`
- Double-click on `LaneHeader` area calls `onFocusToggle()`
- When `isFocused`, render `ExpandedCardList` instead of `CardList`

### `LaneHeader.tsx`
- Accept `isFocused: boolean` and `onFocusToggle: () => void` props
- Attach `onDoubleClick={onFocusToggle}` to the header container
- Show collapse arrows icon (exit focus) when `isFocused`, hide normal collapse toggle

### `ExpandedCardList.tsx` *(new)*
- Renders cards using `ExpandedCardItem` instead of `CardPreview`
- Still uses `SortableContext` for ordering (drag-to-reorder disabled during focus)
- Simple `flex flex-col gap-2` list

### `ExpandedCardItem.tsx` *(new)*
- Accepts `card: CardSummary`, `projectSlug: string`, `laneSlug: string`
- Fetches full card data (`activeCard`) when needed for description/links — or fetches on mount per card using a local fetch
- Renders 3-column horizontal layout described above
- Tasks are rendered using a slimmer version of `TaskCheckbox` (interactive)
- Links rendered with kind icon + label text, each is a clickable `<a target="_blank">`
- Click on card title or ID opens `CardDetailPanel` as usual

**Note on data fetching for expanded cards:** `CardSummary` already contains `frontmatter.description` and `frontmatter.links`, so no additional API call is needed for the left and right columns. Tasks come from `frontmatter` task progress only in `CardSummary` — full task text requires fetching the full `Card`. We fetch the full card for each visible card lazily on first expand using a local React state/effect within `ExpandedCardItem`, caching results in a module-level map to avoid re-fetching during the same session.

## Files to Create/Modify

| File | Action |
|---|---|
| `frontend/src/store/slices/uiSlice.ts` | Add `focusedLane`, `setFocusedLane` |
| `frontend/src/components/kanban/KanbanBoard.tsx` | Pass focus props, disable DnD in focus, Escape key handler |
| `frontend/src/components/kanban/Lane.tsx` | `isFocused`/`isHidden` props, double-click, motion.div |
| `frontend/src/components/kanban/LaneHeader.tsx` | Double-click handler, focus exit icon |
| `frontend/src/components/kanban/ExpandedCardList.tsx` | New component |
| `frontend/src/components/kanban/ExpandedCardItem.tsx` | New component — the rich wide card |

## Implementation Order

1. `uiSlice.ts` — add state
2. `LaneHeader.tsx` — add double-click + focus UI
3. `Lane.tsx` — add Framer Motion, focus layout
4. `KanbanBoard.tsx` — wire focus state, Escape key, disable DnD
5. `ExpandedCardItem.tsx` — build the wide card layout
6. `ExpandedCardList.tsx` — container for expanded cards
