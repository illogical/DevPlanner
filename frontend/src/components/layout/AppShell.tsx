import type { ReactNode } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { Header } from './Header';
import { AppNavBar } from './AppNavBar';
import { FileBrowserDrawer } from '../doc/FileBrowserDrawer';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { connectionState } = useWebSocket();

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      <Header connectionState={connectionState} />
      <AppNavBar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
      <FileBrowserDrawer />
    </div>
  );
}
