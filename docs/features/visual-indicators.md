# Visual Indicators for Background Changes

## Context

Currently, when background changes occur (such as an AI agent marking a task as complete or adding a card via the API), users have no visual feedback indicating that changes have happened. This is particularly important for:

1. **Task Completion**: When an external process marks a task as done
2. **Card Creation**: When a new card is added to a lane
3. **Card Movement**: When a card is moved between lanes
4. **General Updates**: Any change that happens outside of direct user interaction

This feature adds **visual indicator animations** to provide clear, non-interrupting feedback when background changes occur. These animations will work in conjunction with the future activity history log to provide both immediate visual feedback and a historical record of changes.

## Design Goals

1. **Non-intrusive**: Animations should draw attention without disrupting workflow
2. **Contextual**: Different types of changes should have appropriate visual treatments
3. **Performant**: Animations should be smooth and not impact application responsiveness
4. **Accessible**: Visual indicators should work with keyboard navigation and screen readers
5. **Consistent**: Use existing Framer Motion infrastructure for unified animation approach

## Visual Indicator Types

### 1. Task Toggle Animation (Enhanced)

**Scenario**: A task is marked complete or incomplete by an external process

**Animation Behavior**:
- **Flash Effect**: Brief highlight flash on the task item (300ms duration)
- **Scale Pulse**: Subtle scale animation (1.0 → 1.02 → 1.0)
- **Color Transition**: Smooth transition to checked/unchecked state
- **Checkbox Animation**: Spring-based check/uncheck animation

**Implementation**:
- Enhance existing TaskList.tsx animations
- Add `data-changed` attribute to track background changes
- Use Framer Motion's `animate` function for programmatic animations

### 2. Card Addition Animation (New)

**Scenario**: A new card appears in a lane

**Animation Behavior**:
- **Slide In**: Card slides in from the top of the lane
- **Glow Effect**: Temporary glow/highlight around card border (2s duration)
- **Fade In**: Opacity transition from 0 to 1
- **Scale**: Slight scale animation (0.95 → 1.0)

**Implementation**:
- Add `isNew` flag to card state (expires after animation)
- Use CSS animation for glow effect
- Framer Motion variants for slide/fade/scale

### 3. Card Movement Animation (New)

**Scenario**: A card moves from one lane to another

**Animation Behavior**:
- **Position Transition**: Smooth transition to new position
- **Lane Highlight**: Brief highlight on both source and destination lanes
- **Card Highlight**: Glow effect on the moved card (1.5s duration)

**Implementation**:
- Track card lane changes in Zustand store
- Use layout animations with AnimatePresence
- Coordinate animations across lanes

### 4. Card Update Animation (New)

**Scenario**: Card content or metadata is updated

**Animation Behavior**:
- **Border Pulse**: Subtle pulse animation on card border
- **Icon Indicator**: Small badge/icon showing "updated" (fades after 3s)
- **Highlight**: Brief background color change

**Implementation**:
- Track update timestamps in card state
- Add visual indicator badge component
- Use CSS transitions for border and background

## Technical Architecture

### Store Enhancements

Add change tracking to Zustand store (`frontend/src/store/index.ts`):

```typescript
interface ChangeIndicator {
  type: 'task:toggled' | 'card:created' | 'card:moved' | 'card:updated';
  timestamp: number;
  cardSlug: string;
  lane?: string;
  taskIndex?: number;
  expiresAt: number; // timestamp when indicator should be removed
}

interface StoreState {
  // ... existing state ...
  changeIndicators: Map<string, ChangeIndicator>; // keyed by unique ID
  
  // Actions
  addChangeIndicator: (indicator: Omit<ChangeIndicator, 'timestamp' | 'expiresAt'>) => string;
  removeChangeIndicator: (id: string) => void;
  clearExpiredIndicators: () => void;
}
```

### Animation Components

**1. `AnimatedTaskItem.tsx`** (Enhanced):
- Wrap existing task item with animation controller
- React to `changeIndicators` for this task
- Apply flash/pulse animations programmatically

**2. `AnimatedCardWrapper.tsx`** (New):
- Wrapper component for CardPreview
- Handles card-level animations (new, moved, updated)
- Manages glow effects and badges

**3. `AnimationProvider.tsx`** (New):
- Context provider for animation settings
- Global animation controls (enable/disable, speed)
- Coordination between related animations

### WebSocket Integration

When WebSocket messages arrive (future Phase 14), automatically trigger visual indicators:

```typescript
// In WebSocket message handler
case 'task:toggled':
  store.toggleTask(data.cardSlug, data.taskIndex, data.checked);
  store.addChangeIndicator({
    type: 'task:toggled',
    cardSlug: data.cardSlug,
    taskIndex: data.taskIndex,
  });
  break;

case 'card:created':
  store.addCard(data.lane, data.card);
  store.addChangeIndicator({
    type: 'card:created',
    cardSlug: data.slug,
    lane: data.lane,
  });
  break;
```

## Animation Specifications

### Timing & Easing

| Animation Type | Duration | Easing | Delay |
|---|---|---|---|
| Task Flash | 300ms | ease-out | 0ms |
| Task Scale Pulse | 400ms | spring (damping: 25, stiffness: 300) | 0ms |
| Card Slide In | 500ms | spring (damping: 30, stiffness: 200) | 0ms |
| Card Glow | 2000ms | ease-in-out | 0ms |
| Update Badge Fade | 3000ms | ease-in | 2500ms |
| Border Pulse | 600ms | ease-in-out | 0ms |

### Color Scheme (Dark Mode)

| Indicator | Color | Opacity |
|---|---|---|
| Task Flash | `#22c55e` (green-500) | 0.2 → 0 |
| Card Glow (New) | `#3b82f6` (blue-500) | 0.4 → 0 |
| Card Glow (Moved) | `#f59e0b` (amber-500) | 0.3 → 0 |
| Card Glow (Updated) | `#8b5cf6` (violet-500) | 0.3 → 0 |
| Update Badge | `#3b82f6` (blue-500) | 1.0 → 0 |

### Accessibility Considerations

1. **Reduced Motion**: Respect `prefers-reduced-motion` CSS media query
2. **Screen Readers**: Announce changes via ARIA live regions
3. **Focus Management**: Don't disrupt keyboard focus during animations
4. **Color Contrast**: Ensure indicator colors meet WCAG AA standards

## Implementation Phases

### Phase 1: Store Infrastructure ✓
- [x] Add `changeIndicators` map to Zustand store
- [x] Implement `addChangeIndicator` action
- [x] Implement `removeChangeIndicator` action
- [x] Add automatic cleanup timer for expired indicators

### Phase 2: Task Toggle Animation
- [ ] Enhance TaskList.tsx with programmatic animations
- [ ] Add flash effect on task toggle
- [ ] Add scale pulse animation
- [ ] Integrate with store change indicators
- [ ] Test with manual task toggles and simulated background changes

### Phase 3: Card Addition Animation
- [ ] Create AnimatedCardWrapper component
- [ ] Implement slide-in animation for new cards
- [ ] Add glow effect with auto-expire
- [ ] Update CardList to use wrapper
- [ ] Test with QuickAddCard and API-created cards

### Phase 4: Card Movement Animation
- [ ] Add lane change detection in store
- [ ] Implement cross-lane animation coordination
- [ ] Add glow effect for moved cards
- [ ] Test with drag-and-drop and API moves

### Phase 5: Card Update Animation
- [ ] Create UpdateBadge component
- [ ] Implement border pulse animation
- [ ] Add badge positioning logic
- [ ] Test with card edits via detail panel and API

### Phase 6: Polish & Accessibility
- [ ] Add AnimationProvider with user preferences
- [ ] Implement reduced-motion support
- [ ] Add ARIA live regions for screen readers
- [ ] Performance testing with multiple animations
- [ ] Cross-browser testing

## Files to Create

### New Files

| File | Purpose |
|---|---|
| `frontend/src/components/animations/AnimatedCardWrapper.tsx` | Card-level animation controller |
| `frontend/src/components/animations/UpdateBadge.tsx` | Visual indicator badge for updates |
| `frontend/src/components/animations/AnimationProvider.tsx` | Global animation context and settings |
| `frontend/src/hooks/useChangeIndicator.ts` | Hook for managing change indicators |
| `frontend/src/utils/animation-helpers.ts` | Shared animation utilities and variants |

### Files to Modify

| File | Changes |
|---|---|
| `frontend/src/store/index.ts` | Add change indicator state and actions |
| `frontend/src/components/kanban/TaskList.tsx` | Enhance with programmatic animations |
| `frontend/src/components/kanban/CardList.tsx` | Wrap cards with AnimatedCardWrapper |
| `frontend/src/components/kanban/CardPreview.tsx` | Add animation props and data attributes |
| `frontend/src/App.tsx` | Add AnimationProvider wrapper |
| `frontend/src/index.css` | Add keyframe animations for glow effects |

## Testing Strategy

### Manual Testing

1. **Task Toggle**:
   - Open card detail panel
   - Toggle a task
   - Verify flash and pulse animations
   - Simulate API toggle via browser console

2. **Card Addition**:
   - Use QuickAddCard to create a card
   - Verify slide-in and glow animations
   - Simulate API card creation

3. **Card Movement**:
   - Drag card between lanes
   - Verify smooth transition and glow
   - Simulate API move

4. **Multiple Changes**:
   - Trigger multiple animations simultaneously
   - Verify no animation conflicts or jank

### Automated Testing (Future)

- Unit tests for store actions
- Component tests for animation variants
- Integration tests for coordinated animations
- Visual regression tests

## Performance Considerations

1. **Animation Throttling**: Limit simultaneous animations to 3-5
2. **GPU Acceleration**: Use `transform` and `opacity` for animations
3. **Debouncing**: Group rapid changes (e.g., multiple task toggles)
4. **Memory Management**: Auto-cleanup expired indicators every 5s
5. **Conditional Rendering**: Only render animation components when needed

## Future Enhancements (Out of Scope)

- User-configurable animation preferences (speed, style, disable)
- Sound effects for changes (optional, accessibility concern)
- More granular animations (priority changes, assignee changes, etc.)
- Animation replay/history (show recent changes on demand)
- Collaborative cursor/presence indicators
- Custom animation themes

## Integration with Activity History

Visual indicators provide **immediate feedback**, while the activity history log (Phase 16) provides a **persistent record**. The two systems work together:

1. **Visual Indicator**: Fires immediately on change (0-2s duration)
2. **History Log Entry**: Records change with timestamp and details
3. **User Experience**: Quick visual feedback + ability to review history later

Example flow:
1. Agent marks task complete → Task flash animation + history entry created
2. Agent adds card → Card slide-in animation + history entry created
3. User opens activity log → Sees "Task 'Setup database' completed at 2:34 PM"

## Success Metrics

- Animations complete within specified durations
- No animation jank (60fps target)
- Reduced-motion preferences respected
- Zero accessibility violations
- User feedback indicates animations are helpful (not annoying)

## Notes

- All animations use Framer Motion for consistency
- Color scheme follows existing dark mode design
- Animations are opt-out via reduced-motion preference
- Change indicators auto-expire to prevent memory leaks
- Implementation prioritizes perceived performance over absolute speed
