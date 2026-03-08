import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { MarkdownPreview } from '../components/doc/MarkdownPreview';

export function ViewerPage() {
  const [searchParams] = useSearchParams();
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

  // Load file when path changes
  useEffect(() => {
    if (filePath && filePath !== docFilePath) {
      navigateToFile(filePath, 'push');
    }
  }, [filePath, docFilePath, navigateToFile]);

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
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#1A3549] text-gray-400">
        <p className="mb-4 text-lg">No file selected</p>
        <button
          onClick={openFileBrowser}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
        >
          Open File Browser
        </button>
      </div>
    );
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
              className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-300 transition-colors"
            >
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
