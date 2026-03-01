import { useEffect } from 'react';
import { useStore } from '../store';
import type { DetailScrollTarget } from '../types';

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

    const el = document.getElementById(`card-section-${section}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('highlight-pulse');
      const timer = setTimeout(() => {
        el.classList.remove('highlight-pulse');
        setDetailScrollTarget(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [target, section, setDetailScrollTarget]);
}
