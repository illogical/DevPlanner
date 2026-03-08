import { useRef, useCallback } from 'react';

/**
 * Provides synchronized scrolling between two scroll containers.
 * Returns refs for left and right panes and a handler factory.
 *
 * Usage:
 *   const { leftRef, rightRef, onScroll } = useSyncScroll(syncEnabled);
 *   <div ref={leftRef} onScroll={onScroll('left')}>...</div>
 *   <div ref={rightRef} onScroll={onScroll('right')}>...</div>
 */
export function useSyncScroll(enabled: boolean) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  const onScroll = useCallback(
    (side: 'left' | 'right') => () => {
      if (!enabled || isSyncing.current) return;

      const source = side === 'left' ? leftRef.current : rightRef.current;
      const target = side === 'left' ? rightRef.current : leftRef.current;

      if (!source || !target) return;

      isSyncing.current = true;
      target.scrollTop = source.scrollTop;
      target.scrollLeft = source.scrollLeft;
      // Release the lock on the next animation frame so the target's own
      // scroll event (triggered above) can fire and clear without looping.
      requestAnimationFrame(() => {
        isSyncing.current = false;
      });
    },
    [enabled]
  );

  return { leftRef, rightRef, onScroll };
}
