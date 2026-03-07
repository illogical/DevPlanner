import { useEffect } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { CardDetailPanel } from './components/card-detail/CardDetailPanel';
import { ActivityPanel } from './components/activity/ActivityPanel';
import { SearchPalette } from './components/search/SearchPalette';
import { useStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';

function App() {
  const {
    isActivityPanelOpen, setActivityPanelOpen,
    isPaletteOpen, openPalette, closePalette,
  } = useStore();
  const { connectionState } = useWebSocket();

  // Global Ctrl+K / Cmd+K shortcut to open/close the search palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isPaletteOpen) closePalette();
        else openPalette();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isPaletteOpen, openPalette, closePalette]);

  return (
    <MainLayout connectionState={connectionState}>
      <KanbanBoard />
      <CardDetailPanel />
      <ActivityPanel
        isOpen={isActivityPanelOpen}
        onClose={() => setActivityPanelOpen(false)}
      />
      <SearchPalette />
    </MainLayout>
  );
}

export default App;
