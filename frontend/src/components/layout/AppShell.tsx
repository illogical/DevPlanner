import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useStore } from '../../store';
import { Header } from './Header';
import { AppNavBar } from './AppNavBar';
import { FileBrowserDrawer } from '../doc/FileBrowserDrawer';
import { BottomBar } from './BottomBar';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { connectionState } = useWebSocket();
  const location = useLocation();
  const { fbIsOpen, closeFileBrowser } = useStore();

  const isKanban =
    !location.pathname.startsWith('/viewer') &&
    !location.pathname.startsWith('/editor') &&
    !location.pathname.startsWith('/diff');

  useEffect(() => {
    if (isKanban && fbIsOpen) {
      closeFileBrowser();
    }
  }, [isKanban, fbIsOpen, closeFileBrowser]);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      <Header connectionState={connectionState} />
      <AppNavBar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
      {!isKanban && <BottomBar />}
      {!isKanban && <FileBrowserDrawer />}
    </div>
  );
}
