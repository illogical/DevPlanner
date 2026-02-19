import { Header } from './Header';
import { ProjectSidebar } from './ProjectSidebar';
import { ActivitySidebar } from '../activity/ActivitySidebar';

interface MainLayoutProps {
  children: React.ReactNode;
  connectionState: 'connected' | 'disconnected' | 'reconnecting';
}

export function MainLayout({ children, connectionState }: MainLayoutProps) {
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

        {/* Right sidebar - always-on activity history (desktop only) */}
        <aside className="w-80 border-l border-gray-700 bg-gray-900 overflow-hidden hidden lg:block relative z-50">
          <ActivitySidebar />
        </aside>
      </div>
    </div>
  );
}
