import { useStore } from '../../store';
import { IconButton } from '../ui/IconButton';
import { ConnectionIndicator } from '../ui/ConnectionIndicator';
import { cn } from '../../utils/cn';
import { getWebSocketClient } from '../../services/websocket.service';

interface HeaderProps {
  connectionState: 'connected' | 'disconnected' | 'reconnecting';
}

export function Header({ connectionState }: HeaderProps) {
  const {
    isSidebarOpen, toggleSidebar,
    isActivityPanelOpen, toggleActivityPanel,
    isFilesPanelOpen, toggleFilesPanel,
    searchQuery, setSearchQuery, clearSearch, isSearching,
  } = useStore();

  const handleRetry = () => {
    const client = getWebSocketClient();
    client.disconnect();
    setTimeout(() => client.connect(), 100);
  };

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

      {/* Search box */}
      <div className="flex-1 max-w-md mx-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search cards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-8 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {searchQuery && !isSearching && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {isSearching && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Connection Indicator */}
      <ConnectionIndicator connectionState={connectionState} onRetry={handleRetry} />

      {/* Project Files Toggle */}
      <IconButton
        label="Project files"
        onClick={toggleFilesPanel}
        className={cn(
          'transition-colors',
          isFilesPanelOpen && 'bg-blue-500/20 text-blue-400'
        )}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
          />
        </svg>
      </IconButton>

      {/* Activity History Toggle */}
      <IconButton
        label="Activity history"
        onClick={toggleActivityPanel}
        className={cn(
          'transition-colors',
          isActivityPanelOpen && 'bg-blue-500/20 text-blue-400'
        )}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </IconButton>
    </header>
  );
}
