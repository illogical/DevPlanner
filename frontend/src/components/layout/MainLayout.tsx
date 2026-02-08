import { Header } from './Header';
import { ProjectSidebar } from './ProjectSidebar';

interface MainLayoutProps {
  children: React.ReactNode;
  connectionState: 'connected' | 'disconnected' | 'reconnecting';
}

export function MainLayout({ children, connectionState }: MainLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <Header connectionState={connectionState} />
      <div className="flex-1 flex overflow-hidden">
        <ProjectSidebar />
        <main className="flex-1 overflow-hidden transition-all duration-300 ease-out">
          {children}
        </main>
      </div>
    </div>
  );
}
