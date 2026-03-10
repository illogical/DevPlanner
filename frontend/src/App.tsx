import { useEffect } from 'react';
import { Routes, Route, useSearchParams } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { AppShell } from './components/layout/AppShell';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { CardDetailPanel } from './components/card-detail/CardDetailPanel';
import { ActivityPanel } from './components/activity/ActivityPanel';
import { SearchPalette } from './components/search/SearchPalette';
import { DiffViewerPage } from './pages/DiffViewerPage';
import { ViewerPage } from './pages/ViewerPage';
import { EditorPage } from './pages/EditorPage';
import { useStore } from './store';

function KanbanApp() {
  const {
    isActivityPanelOpen, setActivityPanelOpen,
    isPaletteOpen, openPalette, closePalette,
    activeProjectSlug, activeCard, isDetailPanelOpen,
    setActiveProject, openCardDetail, closeCardDetail,
  } = useStore();

  const [searchParams, setSearchParams] = useSearchParams();

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

  // URL → State: restore project + card from URL params (browser back, direct link, page load)
  useEffect(() => {
    const projectInUrl = searchParams.get('project');
    const cardInUrl = searchParams.get('card');

    if (projectInUrl && projectInUrl !== activeProjectSlug) {
      setActiveProject(projectInUrl, true);
    }

    // Only attempt to open/close the card panel after projects have loaded
    // and the project in the URL is already active
    const projectReady = projectInUrl
      ? activeProjectSlug === projectInUrl
      : activeProjectSlug != null;

    if (projectReady) {
      if (cardInUrl && cardInUrl !== activeCard?.slug) {
        openCardDetail(cardInUrl, true);
      } else if (!cardInUrl && isDetailPanelOpen) {
        closeCardDetail(true);
      }
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // State → URL: push a browser history entry when the active project or card changes
  useEffect(() => {
    const projectInUrl = searchParams.get('project') ?? undefined;
    const cardInUrl = searchParams.get('card') ?? undefined;
    const shouldProject = activeProjectSlug ?? undefined;
    const shouldCard = activeCard?.slug;

    if (projectInUrl === shouldProject && cardInUrl === shouldCard) return;

    const params: Record<string, string> = {};
    if (activeProjectSlug) params.project = activeProjectSlug;
    if (activeCard?.slug) params.card = activeCard.slug;
    setSearchParams(params, { replace: false });
  }, [activeProjectSlug, activeCard?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MainLayout>
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

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/diff" element={<DiffViewerPage />} />
        <Route path="/viewer" element={<ViewerPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="*" element={<KanbanApp />} />
      </Routes>
    </AppShell>
  );
}

export default App;
