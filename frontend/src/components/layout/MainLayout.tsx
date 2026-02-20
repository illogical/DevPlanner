import { useStore } from '../../store';
import { cn } from '../../utils/cn';
import { Header } from './Header';
import { ProjectSidebar } from './ProjectSidebar';
import { ActivitySidebar } from '../activity/ActivitySidebar';

interface MainLayoutProps {
  children: React.ReactNode;
  connectionState: 'connected' | 'disconnected' | 'reconnecting';
}

export function MainLayout({ children, connectionState }: MainLayoutProps) {
  const { isActivitySidebarOpen } = useStore();

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <Header connectionState={connectionState} />
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - project list */}
        <ProjectSidebar />

        {/* Main content area - flexes to accommodate panels */}
        <main className="flex-1 overflow-x-auto overflow-y-hidden transition-all duration-300 ease-out">
          {children}
        </main>

        {/* Right sidebar - activity history (desktop only, toggleable) */}
        <aside className={cn(
          'hidden lg:flex flex-col',
          'bg-gray-900 border-l border-gray-700',
          'transition-all duration-300 ease-out overflow-hidden relative z-50',
          isActivitySidebarOpen ? 'w-80' : 'w-0 border-l-0'
        )}>
          <ActivitySidebar />
        </aside>
      </div>
    </div>
  );
}
