import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { MarkdownPreview } from '../components/doc/MarkdownPreview';
import { DocEmptyState } from '../components/doc/DocEmptyState';

export function ViewerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const filePath = searchParams.get('path');

  const {
    docFilePath,
    docContent,
    docIsLoading,
    docError,
    gitRefreshInterval,
    navigateToFile,
    openFileBrowser,
    refreshGitStatus,
  } = useStore();

  // Load file when path changes (driven by URL — file browser, direct link, tab switch)
  useEffect(() => {
    if (filePath && filePath !== docFilePath) {
      navigateToFile(filePath, 'push');
    }
  }, [filePath, docFilePath, navigateToFile]);

  // Sync URL to reflect store's docFilePath after back/forward navigation
  useEffect(() => {
    if (docFilePath && docFilePath !== filePath) {
      setSearchParams({ path: docFilePath }, { replace: true });
    }
  }, [docFilePath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh git status
  useEffect(() => {
    if (!filePath) return;
    refreshGitStatus(filePath);

    const interval = setInterval(() => {
      if (!document.hidden) {
        refreshGitStatus(filePath);
      }
    }, gitRefreshInterval * 1000);

    return () => clearInterval(interval);
  }, [filePath, gitRefreshInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!filePath) {
    return <DocEmptyState onOpenFileBrowser={openFileBrowser} label="No file open" />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Error banner */}
      {docError && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800 text-sm text-red-400 shrink-0">
          {docError}
        </div>
      )}

      {/* Loading */}
      {docIsLoading && (
        <div className="flex-1 flex items-center justify-center bg-[#1A3549]">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Content */}
      {!docIsLoading && docContent !== null && (
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={() => navigate(`/editor?path=${encodeURIComponent(filePath)}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all"
              style={{
                background: 'rgba(155, 220, 254, 0.08)',
                border: '1px solid rgba(155, 220, 254, 0.2)',
                color: '#9cdcfe',
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
          </div>
          <MarkdownPreview content={docContent} className="flex-1" />
        </div>
      )}

      {!docIsLoading && docContent === null && !docError && (
        <div className="flex-1 flex items-center justify-center bg-[#1A3549] text-gray-500">
          File not loaded
        </div>
      )}
    </div>
  );
}
