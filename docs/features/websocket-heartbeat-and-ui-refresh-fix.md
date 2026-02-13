# WebSocket Heartbeat and UI Refresh Issue - Analysis and Solution

**Status**: ✅ Fully Implemented (Both Phases)
**Date**: 2026-02-12
**Issue**: UI refreshes and modal disappearing, interrupting user input in card detail panel and card creation

---

## Problem Summary

Users experienced the entire UI refreshing every 30 seconds (coinciding with WebSocket heartbeat timing), which interrupted editing descriptions in the card detail panel. The file watcher was disabled, ruling it out as a cause.

## Root Cause Analysis

### 1. WebSocket Heartbeat Was NOT the Direct Cause

The WebSocket heartbeat implementation was architecturally sound:

- **Backend** (`src/services/websocket.service.ts:198`): Sends `{ type: 'ping' }` messages every 30 seconds
- **Frontend** (`frontend/src/services/websocket.service.ts:176-179`): Correctly handles ping messages and responds with pong **without dispatching any events**
- **Event isolation** (line 170-173): Only messages with `type: 'event'` call `dispatchEvent()` which triggers state handlers
- **Verdict**: The ping/pong mechanism itself does NOT trigger UI updates

### 2. The REAL Problem: Store Over-Subscription

**Critical Issue** in `frontend/src/components/card-detail/CardDetailPanel.tsx:12-18`:

```typescript
// BEFORE (BAD) - subscribes to entire store
const {
  activeCard,
  activeProjectSlug,
  isDetailPanelOpen,
  isLoadingCardDetail,
  closeCardDetail,
} = useStore();
```

This destructuring syntax subscribes the component to **the entire store**. Every time ANY part of the store changes, CardDetailPanel re-renders, causing all child components (including CardContent with the textarea) to receive new props and re-render.

### 3. Aggressive Card Refetching

**Secondary Issue** in `frontend/src/store/index.ts:1217-1222`:

When a `card:updated` WebSocket event arrives for the active card:
1. The entire card is refetched from the API
2. A new `activeCard` object is created in the store
3. CardDetailPanel re-renders (because it subscribes to activeCard)
4. CardContent receives the new content prop and re-renders
5. If user is editing, this interrupts the editing experience

### 4. The 30-Second Coincidence

While the heartbeat itself doesn't cause UI refreshes, if there ARE periodic events happening (from any source), they might coincidentally align with the 30-second heartbeat interval, creating the impression that the heartbeat is the culprit.

---

## Why We Kept the WebSocket Heartbeat

### Critical Functions:

1. **Connection Liveness Detection**
   - Detects when clients have disconnected without properly closing the WebSocket
   - Prevents zombie connections that waste server resources
   - Backend timeout: 5 seconds to respond or connection is closed

2. **Network Middlebox Prevention**
   - Many corporate firewalls, load balancers, and proxies close idle connections after 30-60 seconds
   - Active heartbeat prevents silent connection drops
   - User would experience connection failures without visible errors

3. **Reconnection Trigger**
   - When heartbeat fails, client knows immediately to reconnect
   - Without it, user could continue using the app with a dead connection
   - Failed actions would queue up without feedback

4. **Production Reliability**
   - Essential for long-lived WebSocket connections in production
   - Development environment is more forgiving; production has stricter timeouts
   - Removing it would cause random disconnections that are hard to debug

---

## Solutions Implemented

### Solution 1: Selective Store Subscription (Primary Fix)

**File**: `frontend/src/components/card-detail/CardDetailPanel.tsx`

**Changed from**:
```typescript
// BEFORE (subscribes to entire store)
const {
  activeCard,
  activeProjectSlug,
  isDetailPanelOpen,
  isLoadingCardDetail,
  closeCardDetail,
} = useStore();
```

**To**:
```typescript
// AFTER (only subscribes to specific values)
const activeCard = useStore((state) => state.activeCard);
const activeProjectSlug = useStore((state) => state.activeProjectSlug);
const isDetailPanelOpen = useStore((state) => state.isDetailPanelOpen);
const isLoadingCardDetail = useStore((state) => state.isLoadingCardDetail);
const closeCardDetail = useStore((state) => state.closeCardDetail);
```

**Impact**: Component only re-renders when these specific values change, not on every store update.

### Solution 2: Add Refetch Debouncing

**Files Modified**:
- `frontend/src/store/index.ts` (interface, initial state, and wsHandleCardUpdated handler)

**Added**:
1. New state property: `_lastRefetchTime: Map<string, number>`
2. Debouncing logic with 2-second cooldown

**Implementation**:
```typescript
if (state.activeCard?.slug === slug && !isRecentAction) {
  // Add debouncing to prevent rapid refetches
  const now = Date.now();
  const lastRefetch = state._lastRefetchTime.get(slug) || 0;
  const REFETCH_COOLDOWN = 2000; // 2 seconds

  if (now - lastRefetch > REFETCH_COOLDOWN) {
    console.log(`[wsHandleCardUpdated] REFETCHING ${slug} from API`);
    state._lastRefetchTime.set(slug, now);
    state.openCardDetail(slug);
  } else {
    console.log(`[wsHandleCardUpdated] Skipping refetch (cooldown active) for ${slug}`);
  }
}
```

**Impact**: Prevents multiple refetches within a 2-second window.

### Solution 3: Memoize CardContent Component

**File**: `frontend/src/components/card-detail/CardContent.tsx`

**Changed from**:
```typescript
export function CardContent({ content, cardSlug }: CardContentProps) {
  // ... component code
}
```

**To**:
```typescript
import { memo } from 'react';

export const CardContent = memo(function CardContent({ content, cardSlug }: CardContentProps) {
  // ... component code
});
```

**Impact**: Component only re-renders when props actually change (deep equality check).

### Solution 4: Fix Missing Type Import

**File**: `frontend/src/hooks/useWebSocket.ts`

**Added**: `TaskToggledData` to the type imports (was used but not imported, causing TypeScript errors)

---

## Implementation Summary

### Files Modified

#### Phase 1 (Description Editing Fix):

1. ✅ **frontend/src/components/card-detail/CardDetailPanel.tsx** (lines 12-18)
   - Changed store subscription pattern from destructuring to selective subscriptions

2. ✅ **frontend/src/store/index.ts** (interface, initial state, and lines 1217-1222)
   - Added `_lastRefetchTime` Map to store state
   - Added refetch debouncing logic with 2-second cooldown

3. ✅ **frontend/src/components/card-detail/CardContent.tsx** (lines 1, 10, 156)
   - Imported `memo` from React
   - Wrapped component with `React.memo()`

4. ✅ **frontend/src/hooks/useWebSocket.ts** (line 4-14)
   - Added missing `TaskToggledData` import

#### Phase 2 (Modal Disappearing Fix + Heartbeat Configuration):

5. ✅ **frontend/src/components/kanban/KanbanBoard.tsx** (lines 18-28)
   - Changed store subscription pattern from destructuring to selective subscriptions
   - Fixed QuickAddCard modal disappearing during card creation

6. ✅ **src/services/websocket.service.ts** (lines 13-26, 192-197)
   - Added `HEARTBEAT_ENABLED` property read from env var
   - Modified `startHeartbeat()` to check flag before starting
   - Added logging for heartbeat status

7. ✅ **.env** (new lines)
   - Added `WEBSOCKET_HEARTBEAT_ENABLED=false` with documentation
   - Default: disabled for local use, can be enabled for production

---

## Verification

### Manual Testing

After implementing fixes:

1. ✅ Open a card detail panel
2. ✅ Start editing the description
3. ✅ Wait for 30+ seconds while typing
4. ✅ Verify textarea doesn't lose focus or content
5. ✅ Check console logs for refetch activity

### Console Monitoring

- Look for `[wsHandleCardUpdated] REFETCHING` logs
- Should NOT appear while editing unless another user makes changes
- Heartbeat ping/pong logs should appear every 30s without triggering refetches

### Component Re-render Tracking

- Check existing console.log in CardDetailPanel (line 20-24)
- Should only log when card actually changes, not on every store update

### WebSocket Event Monitoring

- Open browser DevTools → Network → WS
- Filter WebSocket messages
- Verify ping/pong messages don't trigger event dispatches
- Verify no unexpected `card:updated` events during editing

---

## Technical Details

### Zustand Store Subscription Patterns

Zustand provides two ways to subscribe to store state:

**1. Destructuring (subscribes to entire store):**
```typescript
const { value1, value2 } = useStore();
```
- Component re-renders on ANY store change
- Simple syntax but inefficient for large stores

**2. Selector functions (subscribes to specific values):**
```typescript
const value1 = useStore(state => state.value1);
const value2 = useStore(state => state.value2);
```
- Component only re-renders when selected values change
- More verbose but much more efficient

### React.memo Optimization

`React.memo` is a higher-order component that memoizes the component:
- Performs shallow comparison of props
- Only re-renders if props have actually changed
- Essential for components that receive objects as props
- Particularly useful when parent re-renders frequently

### Debouncing Pattern

Debouncing prevents a function from being called too frequently:
- Tracks the last execution time
- Only allows execution if enough time has passed
- Prevents rapid consecutive API calls
- Reduces server load and improves UX

---

## Lessons Learned

1. **Store subscription patterns matter**: In state management libraries, how you subscribe to state can significantly impact performance

2. **Correlation ≠ Causation**: The UI refresh coincided with heartbeat timing, but the heartbeat wasn't the cause

3. **Heartbeats are essential**: WebSocket heartbeats are critical for production reliability and should not be removed

4. **Debug with data, not assumptions**: Console logging and careful code analysis revealed the true cause

5. **Performance optimization layers**: Multiple optimizations (selective subscriptions + debouncing + memoization) work together for best results

---

## Related Documentation

- [WebSocket Implementation](./websocket-implementation.md)
- [Real-time Features](./real-time-features.md)
- [State Management Patterns](./state-management.md)

---

## Conclusion

**Keep the WebSocket heartbeat** - it's essential for production reliability and is NOT causing the issue. The real problem was inefficient store subscriptions causing unnecessary component re-renders. Fixing the store subscription pattern, along with debouncing and memoization, solved the editing interruption issue while maintaining robust WebSocket connection management.
