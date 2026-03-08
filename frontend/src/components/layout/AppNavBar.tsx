import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../../store';
import { cn } from '../../utils/cn';

function ProjectsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function ViewIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
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

interface NavTab { label: string; to: string; icon: React.ReactNode; exact?: boolean; }

const NAV_TABS: NavTab[] = [
  { label: 'Projects', to: '/', icon: <ProjectsIcon />, exact: true },
  { label: 'View', to: '/viewer', icon: <ViewIcon /> },
  { label: 'Edit', to: '/editor', icon: <EditIcon /> },
  { label: 'Compare', to: '/diff', icon: <CompareIcon /> },
];

function tabClass(isActive: boolean) {
  return cn(
    'flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2',
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
        {NAV_TABS.map(({ label, to, icon, exact }) => {
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
              aria-label={label}
            >
              {icon}
              <span>{label}</span>
            </NavLink>
          );
        })}
      </div>

      {/* Doc view: back/forward buttons */}
      {isDocView && (
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={goBack}
            disabled={docBackHistory.length === 0}
            title="Go back"
            aria-label="Go back"
            className="p-1.5 rounded text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeftIcon />
          </button>
          <button
            onClick={goForward}
            disabled={docForwardHistory.length === 0}
            title="Go forward"
            aria-label="Go forward"
            className="p-1.5 rounded text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowRightIcon />
          </button>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* File browser toggle */}
      <button
        onClick={toggleFileBrowser}
        title="Toggle file browser"
        aria-label="Toggle file browser"
        className="p-1.5 m-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
      >
        <FolderIcon />
      </button>
    </nav>
  );
}
