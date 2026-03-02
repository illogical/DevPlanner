import { useEffect } from 'react';
import { useStore } from '../store';
import type { DetailScrollTarget } from '../types';

/**
 * Duration (ms) the highlight-pulse animation runs.
 * Must match the `animation` duration in the `.highlight-pulse` CSS rule.
 */
const HIGHLIGHT_DURATION_MS = 2000;

/**
 * Delay before scrolling/highlighting, to let the Framer Motion panel
 * animation complete before we try to scroll elements into view.
 */
const SCROLL_DELAY_MS = 150;

function pulseElement(el: HTMLElement, duration = HIGHLIGHT_DURATION_MS) {
  el.classList.add('highlight-pulse');
  setTimeout(() => el.classList.remove('highlight-pulse'), duration);
}

/**
 * Hook that scrolls to and pulse-highlights a card-detail section when
 * `detailScrollTarget` in the store matches the given section.
 * Call once per section component with the appropriate section name.
 */
export function useDetailScroll(section: DetailScrollTarget['section']) {
  const target = useStore((s) => s.detailScrollTarget);
  const setDetailScrollTarget = useStore((s) => s.setDetailScrollTarget);

  useEffect(() => {
    if (!target || target.section !== section) return;

    const outerTimer = setTimeout(() => {
      // Scroll to + pulse the section container
      const sectionEl = document.getElementById(`card-section-${section}`);
      if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        pulseElement(sectionEl);
      }

      // For tasks: additionally scroll to and highlight the specific task row
      if (section === 'tasks' && target.taskIndex != null) {
        const taskEl = document.getElementById(`task-item-${target.taskIndex}`);
        if (taskEl) {
          taskEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          pulseElement(taskEl);
        }
      }

      const clearTimer = setTimeout(() => {
        setDetailScrollTarget(null);
      }, HIGHLIGHT_DURATION_MS);

      return () => clearTimeout(clearTimer);
    }, SCROLL_DELAY_MS);

    return () => clearTimeout(outerTimer);
  }, [target, section, setDetailScrollTarget]);
}
