import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../../store';
import { IconButton } from '../ui/IconButton';
import { ConnectionIndicator } from '../ui/ConnectionIndicator';
import { cn } from '../../utils/cn';
import { getWebSocketClient } from '../../services/websocket.service';
import { GitStatusDot } from '../doc/GitStatusDot';
import { GitCommitPanel } from '../doc/GitCommitPanel';
import { GitSettingsPanel } from '../doc/GitSettingsPanel';

interface HeaderProps {
  connectionState: 'connected' | 'disconnected' | 'reconnecting';
}

export function Header({ connectionState }: HeaderProps) {
  const location = useLocation();

  const [showGitSettings, setShowGitSettings] = useState(false);

  // Determine current view from route
  const view = location.pathname.startsWith('/viewer') ? 'viewer'
    : location.pathname.startsWith('/editor') ? 'editor'
    : location.pathname.startsWith('/diff') ? 'diff'
    : 'kanban';

  const isKanban = view === 'kanban';
  const isDocView = view === 'viewer' || view === 'editor';

  const {
    isSidebarOpen, toggleSidebar,
    isActivityPanelOpen, toggleActivityPanel,
    isActivitySidebarOpen, toggleActivitySidebar,
    openPalette,
    docFilePath,
    docContent,
    docIsDirty,
    docSaveState,
    gitCurrentState,
    gitCommitPanelOpen,
    gitIsLoading,
    saveDocFile,
    toggleCommitPanel,
  } = useStore();
  const searchQuery = useStore((s) => s.searchQuery);
  const clearSearch = useStore((s) => s.clearSearch);

  const handleRetry = () => {
    const client = getWebSocketClient();
    client.disconnect();
    setTimeout(() => client.connect(), 100);
  };

  const handleDownload = () => {
    if (!docFilePath) return;
    const filename = docFilePath.split('/').pop() ?? 'file.md';
    if (!docContent) return;
    const blob = new Blob([docContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Detect Mac for shortcut hint
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform);
  const shortcutHint = isMac ? '⌘K' : 'Ctrl+K';

  const saveLabel = docSaveState === 'saving' ? 'Saving…'
    : docSaveState === 'saved' ? 'Saved ✓'
    : docSaveState === 'error' ? 'Save failed'
    : docIsDirty ? 'Save*' : 'Save';

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-700 flex items-center px-4">
      {/* Left group */}
      <div className="flex items-center gap-3">
        {isKanban && (
          <>
            {/* Mobile sidebar toggle */}
            <IconButton
              label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              onClick={toggleSidebar}
              className="lg:hidden"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isSidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
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
                className={cn('w-5 h-5 transition-transform duration-200', !isSidebarOpen && 'rotate-180')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </IconButton>
          </>
        )}

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* Doc view: file path + git dot */}
        {isDocView && docFilePath && (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-sm text-gray-400 truncate max-w-xs" title={docFilePath}>
              {docFilePath.split('/').pop()}
            </span>
            <div className="relative flex items-center gap-1">
              <GitStatusDot
                state={gitCurrentState ?? undefined}
                loading={gitIsLoading}
                onClick={toggleCommitPanel}
              />
              {/* Gear icon for git settings */}
              <button
                onClick={() => setShowGitSettings((v) => !v)}
                title="Git settings"
                className="text-gray-600 hover:text-gray-400 transition-colors"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 15.5A3.5 3.5 0 018.5 12 3.5 3.5 0 0112 8.5a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5m7.43-2.92c.04-.32.07-.64.07-.98s-.03-.66-.07-1l2.16-1.63c.19-.15.24-.42.12-.64l-2.05-3.55c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22L2.74 8.87c-.12.21-.08.49.12.64l2.15 1.63c-.05.34-.07.67-.07 1s.02.67.07 1l-2.15 1.63c-.19.15-.24.42-.12.64l2.05 3.55c.12.22.38.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2.05-3.55c.12-.22.07-.49-.12-.64l-2.15-1.63z" />
                </svg>
              </button>
              {gitCommitPanelOpen && <GitCommitPanel />}
              {showGitSettings && <GitSettingsPanel onClose={() => setShowGitSettings(false)} />}
            </div>
          </div>
        )}
      </div>

      {/* Center: search (kanban only) or spacer */}
      <div className="flex-1 flex justify-center px-6">
        {isKanban && (
          <div className="flex items-center gap-1 w-full max-w-xs">
            <button
              onClick={openPalette}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 bg-gray-800 border rounded-lg text-sm transition-colors flex-1 min-w-0',
                searchQuery
                  ? 'border-yellow-500/50 text-yellow-300 hover:border-yellow-400'
                  : 'border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600'
              )}
              aria-label="Open search palette"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="flex-1 text-left truncate">{searchQuery || 'Search…'}</span>
              {!searchQuery && (
                <kbd className="hidden sm:inline text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded font-mono border border-gray-600 shrink-0">
                  {shortcutHint}
                </kbd>
              )}
            </button>
            {searchQuery && (
              <button
                onClick={clearSearch}
                title="Clear search"
                aria-label="Clear search"
                className="shrink-0 p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right group */}
      <div className="flex items-center gap-2">
        {/* Editor actions */}
        {view === 'editor' && (
          <>
            <button
              onClick={saveDocFile}
              className={cn(
                'px-3 py-1 text-sm rounded border transition-colors',
                docSaveState === 'saved'
                  ? 'border-green-700 bg-green-900/30 text-green-400'
                  : docSaveState === 'error'
                  ? 'border-red-700 bg-red-900/30 text-red-400'
                  : docIsDirty
                  ? 'border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-900/50'
                  : 'border-gray-700 text-gray-400 hover:bg-gray-800'
              )}
            >
              {saveLabel}
            </button>
            <button
              onClick={handleDownload}
              title="Download file"
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </>
        )}

        <ConnectionIndicator connectionState={connectionState} onRetry={handleRetry} />

        {isKanban && (
          <>
            <IconButton
              label="Activity history"
              onClick={toggleActivityPanel}
              className={cn('transition-colors lg:hidden', isActivityPanelOpen && 'bg-blue-500/20 text-blue-400')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </IconButton>

            <IconButton
              label={isActivitySidebarOpen ? 'Collapse activity sidebar' : 'Expand activity sidebar'}
              onClick={toggleActivitySidebar}
              className="hidden lg:flex"
            >
              <svg
                className={cn('w-5 h-5 transition-transform duration-200', !isActivitySidebarOpen && 'rotate-180')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </IconButton>
          </>
        )}
      </div>
    </header>
  );
}
