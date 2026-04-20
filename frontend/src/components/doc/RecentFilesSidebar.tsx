import { useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../../store';
import { GitStatusDot } from './GitStatusDot';
import { cn } from '../../utils/cn';

// ─── Relative time formatting ────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  const date = new Date(isoString);
  const month = date.toLocaleString('en', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}`;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      className={cn('w-3.5 h-3.5', spinning && 'animate-spin')}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RecentFilesSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    fbFolders,
    fbIsLoading,
    docFilePath,
    gitStatuses,
    toggleRecentFiles,
    loadFileTree,
    refreshGitStatuses,
  } = useStore();

  // Derive top 10 most recently modified files
  const recentFiles = useMemo(() => {
    const allFiles = fbFolders.flatMap((f) => f.files);
    return allFiles
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10);
  }, [fbFolders]);

  // Batch-refresh git statuses for all recent files when the list changes
  useEffect(() => {
    if (recentFiles.length === 0) return;
    const paths = recentFiles.map((f) => f.path);
    refreshGitStatuses(paths);
  }, [recentFiles, refreshGitStatuses]);

  // Navigate to file in the current mode (viewer or editor)
  const openFile = useCallback((filePath: string) => {
    if (filePath === docFilePath) return; // already open — no-op
    const mode = location.pathname.startsWith('/editor') ? 'editor' : 'viewer';
    navigate(`/${mode}?path=${encodeURIComponent(filePath)}`);
  }, [docFilePath, location.pathname, navigate]);

  // Refresh handler: reload file tree + git statuses
  const handleRefresh = useCallback(() => {
    loadFileTree().then(() => {
      const paths = useStore.getState().fbFolders.flatMap((f) => f.files).map((f) => f.path).slice(0, 10);
      if (paths.length > 0) refreshGitStatuses(paths);
    });
  }, [loadFileTree, refreshGitStatuses]);

  return (
    <aside className="w-60 bg-gray-900 border-l border-gray-700 flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Recent Files
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh recent files"
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <RefreshIcon spinning={fbIsLoading} />
          </button>
          <button
            type="button"
            onClick={toggleRecentFiles}
            title="Close recent files"
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {recentFiles.length === 0 && (
          <div className="px-3 py-4 text-xs text-gray-500">No files yet</div>
        )}

        {recentFiles.map((file) => {
          const isActive = file.path === docFilePath;
          const folderPath = file.path.includes('/')
            ? file.path.substring(0, file.path.lastIndexOf('/'))
            : '';
          const gitState = gitStatuses[file.path];

          return (
            <div
              key={file.path}
              className={cn(
                'px-3 py-2 cursor-pointer transition-colors border-b border-gray-800/50',
                isActive
                  ? 'bg-gray-800'
                  : 'hover:bg-gray-800/60'
              )}
              onClick={() => openFile(file.path)}
              title={file.path}
            >
              {/* File name row — most visual weight */}
              <div className="flex items-center gap-1.5">
                <GitStatusDot state={gitState} className="shrink-0" />
                <a
                  href={`/viewer?path=${encodeURIComponent(file.path)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    openFile(file.path);
                  }}
                  className={cn(
                    'text-sm truncate font-medium',
                    isActive ? 'text-blue-400' : 'text-gray-200 hover:text-blue-300'
                  )}
                  title={file.name}
                >
                  {file.name}
                </a>
              </div>

              {/* Folder path + relative time — less visual weight */}
              <div className="flex items-center justify-between mt-0.5 pl-3.5">
                <span className="text-xs text-gray-500 truncate mr-2" title={folderPath}>
                  {folderPath}
                </span>
                <span className="text-xs text-gray-500 shrink-0">
                  {formatRelativeTime(file.updatedAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
