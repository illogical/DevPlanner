import { useStore } from '../../store';
import { IconButton } from '../ui/IconButton';
import { cn } from '../../utils/cn';

export function Header() {
  const { isSidebarOpen, toggleSidebar } = useStore();

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4">
      {/* Sidebar toggle */}
      <IconButton
        label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        onClick={toggleSidebar}
        className="lg:hidden"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isSidebarOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </IconButton>

      {/* Desktop sidebar toggle */}
      <IconButton
        label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        onClick={toggleSidebar}
        className="hidden lg:flex"
      >
        <svg
          className={cn(
            'w-5 h-5 transition-transform duration-200',
            !isSidebarOpen && 'rotate-180'
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
          />
        </svg>
      </IconButton>

      {/* Logo and title */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-100">DevPlanner</h1>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Future: Search, notifications, etc. */}
    </header>
  );
}
