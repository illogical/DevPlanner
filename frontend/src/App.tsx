import { MainLayout } from './components/layout/MainLayout';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { CardDetailPanel } from './components/card-detail/CardDetailPanel';
import { ActivityPanel } from './components/activity/ActivityPanel';
import { useStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';

function App() {
  const { isActivityPanelOpen, setActivityPanelOpen } = useStore();
  const { connectionState } = useWebSocket();

  return (
    <MainLayout connectionState={connectionState}>
      <KanbanBoard />
      <CardDetailPanel />
      <ActivityPanel
        isOpen={isActivityPanelOpen}
        onClose={() => setActivityPanelOpen(false)}
      />
    </MainLayout>
  );
}

export default App;
