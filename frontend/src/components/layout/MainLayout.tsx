import { Header } from './Header';
import { ProjectSidebar } from './ProjectSidebar';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <ProjectSidebar />
        <main className="flex-1 overflow-hidden transition-all duration-300 ease-out">
          {children}
        </main>
      </div>
    </div>
  );
}
