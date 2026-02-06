import { MainLayout } from './components/layout/MainLayout';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { CardDetailPanel } from './components/card-detail/CardDetailPanel';

function App() {
  return (
    <MainLayout>
      <KanbanBoard />
      <CardDetailPanel />
    </MainLayout>
  );
}

export default App;
