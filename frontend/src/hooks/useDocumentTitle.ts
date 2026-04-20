import { useEffect } from 'react';

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `DevPlanner | ${title}` : 'DevPlanner';
    return () => { document.title = 'DevPlanner'; };
  }, [title]);
}
