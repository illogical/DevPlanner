import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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

function DocumentIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
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

function ChevronLeftIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

interface NavTab { label: string; to?: string; icon: React.ReactNode; exact?: boolean; isDocToggle?: boolean; onClick?: () => void; }

const NAV_TABS_BASE: NavTab[] = [
  { label: 'Projects', icon: <ProjectsIcon />, exact: true },
  { label: 'Review', icon: <DocumentIcon />, isDocToggle: true },
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
  const navigate = useNavigate();
  const {
    docFilePath,
    lastDocMode, setLastDocMode, toggleSidebar, isSidebarOpen,
    navBackStack, navForwardStack,
    consumeNavBack, consumeNavForward,
    openCardDetail, closeCardDetail,
    navigateToFile,
  } = useStore();

  const getDocPath = () => {
    return new URLSearchParams(location.search).get('path') || docFilePath;
  };

  const isDocView =
    location.pathname.startsWith('/viewer') ||
    location.pathname.startsWith('/editor') ||
    location.pathname.startsWith('/diff');

  const isKanban = !isDocView;

  const handleNavBack = () => {
    const entry = consumeNavBack();
    if (!entry) return;
    if (entry.type === 'kanban') {
      navigate('/');
      if (entry.cardSlug) {
        openCardDetail(entry.cardSlug);
      } else {
        closeCardDetail();
      }
    } else {
      navigate(`/${lastDocMode}?path=${encodeURIComponent(entry.filePath)}`);
      navigateToFile(entry.filePath, 'replace');
    }
  };

  const handleNavForward = () => {
    const entry = consumeNavForward();
    if (!entry) return;
    if (entry.type === 'kanban') {
      navigate('/');
      if (entry.cardSlug) {
        openCardDetail(entry.cardSlug);
      } else {
        closeCardDetail();
      }
    } else {
      navigate(`/${lastDocMode}?path=${encodeURIComponent(entry.filePath)}`);
      navigateToFile(entry.filePath, 'replace');
    }
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-700 flex items-center px-2">
      {/* Universal back/forward pill — always visible, left of all tabs */}
      <div className="flex items-center rounded-full border border-gray-700 overflow-hidden mr-3 my-1.5">
        <button
          onClick={handleNavBack}
          disabled={navBackStack.length === 0}
          title="Go back"
          aria-label="Go back"
          className="px-2.5 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeftIcon />
        </button>
        <div className="w-px h-4 bg-gray-700" />
        <button
          onClick={handleNavForward}
          disabled={navForwardStack.length === 0}
          title="Go forward"
          aria-label="Go forward"
          className="px-2.5 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Navigation tabs */}
      <div className="flex items-center">
        {NAV_TABS_BASE.map(({ label, to, icon, exact, isDocToggle }) => {
          let isActive = false;
          let targetPath = to;
          let handleClick: React.MouseEventHandler<HTMLAnchorElement> | undefined;

          if (exact && label === 'Projects') {
            isActive = isKanban;
            targetPath = '/';
            handleClick = (e) => {
              if (isActive) {
                e.preventDefault();
                toggleSidebar();
              }
            };
          } else if (isDocToggle) {
            isActive = location.pathname.startsWith('/viewer') || location.pathname.startsWith('/editor');
            const currentPath = getDocPath();
            const queryPath = currentPath ? `?path=${encodeURIComponent(currentPath)}` : '';

            // If already active, clicking toggles the mode
            if (isActive) {
              const currentMode = location.pathname.startsWith('/editor') ? 'editor' : 'viewer';
              const nextMode = currentMode === 'viewer' ? 'editor' : 'viewer';
              targetPath = `/${nextMode}${queryPath}`;
              handleClick = () => {
                setLastDocMode(nextMode);
              };
            } else {
              // Not active, navigate to lastDocMode
              targetPath = `/${lastDocMode}${queryPath}`;
              handleClick = () => {
                // don't change mode here, just navigate
              };
            }
          } else if (to) {
            isActive = location.pathname.startsWith(to);
            if (label === 'Compare') {
              const currentPath = getDocPath();
              targetPath = currentPath ? `${to}?left=${encodeURIComponent(currentPath)}` : to;
            }
          }

          // Dynamic icon for "Document" and "Projects"
          let displayIcon = icon;
          if (label === 'Projects') {
            displayIcon = (
              <svg
                className={cn('w-4 h-4 transition-transform duration-200', !isSidebarOpen && isActive && 'rotate-180')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V5" />
              </svg>
            );
          } else if (isDocToggle && isActive) {
            const currentMode = location.pathname.startsWith('/editor') ? 'editor' : 'viewer';
            displayIcon = currentMode === 'editor' ? <EditIcon /> : <ViewIcon />;
          }

          return (
            <NavLink
              key={label}
              to={targetPath as string}
              onClick={handleClick}
              className={tabClass(isActive)}
              end={exact}
              aria-label={label}
            >
              <div className="flex items-center gap-1.5 transition-transform duration-150">
                {displayIcon}
              </div>
              <span>{label}</span>
            </NavLink>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />
    </nav>
  );
}
