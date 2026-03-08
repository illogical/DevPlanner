import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../../store';
import { cn } from '../../utils/cn';

function FolderIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

interface NavTab { label: string; to: string; exact?: boolean; }

const NAV_TABS: NavTab[] = [
  { label: 'Kanban', to: '/', exact: true },
  { label: 'Viewer', to: '/viewer' },
  { label: 'Editor', to: '/editor' },
  { label: 'Diff', to: '/diff' },
];

function tabClass(isActive: boolean) {
  return cn(
    'px-4 py-3 text-sm font-medium transition-colors border-b-2',
    isActive
      ? 'border-blue-500 text-gray-100'
      : 'border-transparent text-gray-400 hover:text-gray-200'
  );
}

export function AppNavBar() {
  const location = useLocation();
  const { toggleFileBrowser, docBackHistory, docForwardHistory, goBack, goForward } = useStore();
  const getTabTo = (to: string) => {
    const currentPath = new URLSearchParams(location.search).get('path');
    if (currentPath && (to === '/viewer' || to === '/editor')) {
      return `${to}?path=${encodeURIComponent(currentPath)}`;
    }
    return to;
  };

  const isDocView =
    location.pathname.startsWith('/viewer') ||
    location.pathname.startsWith('/editor') ||
    location.pathname.startsWith('/diff');

  const isKanban =
    !location.pathname.startsWith('/viewer') &&
    !location.pathname.startsWith('/editor') &&
    !location.pathname.startsWith('/diff');

  return (
    <nav className="bg-gray-900 border-b border-gray-700 flex items-center px-2">
      {/* Navigation tabs */}
      <div className="flex items-center">
        {NAV_TABS.map(({ label, to, exact }) => {
          let isActive: boolean;
          if (exact) {
            isActive = isKanban;
          } else {
            isActive = location.pathname.startsWith(to);
          }

          return (
            <NavLink
              key={to}
              to={getTabTo(to)}
              className={tabClass(isActive)}
              end={exact}
            >
              {label}
            </NavLink>
          );
        })}
      </div>

      {/* Doc view: back/forward + file browser */}
      {isDocView && (
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={goBack}
            disabled={docBackHistory.length === 0}
            title="Go back"
            className="p-1.5 rounded text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeftIcon />
          </button>
          <button
            onClick={goForward}
            disabled={docForwardHistory.length === 0}
            title="Go forward"
            className="p-1.5 rounded text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowRightIcon />
          </button>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* File browser toggle (always visible) */}
      <button
        onClick={toggleFileBrowser}
        title="Toggle file browser"
        className="p-1.5 m-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        aria-label="Toggle file browser"
      >
        <FolderIcon />
      </button>
    </nav>
  );
}
