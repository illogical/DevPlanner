import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { EditorLayout } from '../components/doc/EditorLayout';

export function EditorPage() {
  const [searchParams] = useSearchParams();
  const filePath = searchParams.get('path');

  const {
    docFilePath,
    docEditContent,
    docIsLoading,
    docError,
    docIsDirty,
    gitRefreshInterval,
    navigateToFile,
    setDocEditContent,
    saveDocFile,
    openFileBrowser,
    refreshGitStatus,
  } = useStore();

  // Load file when path changes
  useEffect(() => {
    if (filePath && filePath !== docFilePath) {
      navigateToFile(filePath, 'push');
    }
  }, [filePath, docFilePath, navigateToFile]);

  // Warn on dirty unload
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (docIsDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [docIsDirty]);

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
      <div className="flex-1 flex flex-col items-center justify-center bg-[#15232D] text-gray-400">
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
        <div className="flex-1 flex items-center justify-center bg-[#15232D]">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Editor */}
      {!docIsLoading && docEditContent !== null && (
        <EditorLayout
          content={docEditContent}
          onChange={setDocEditContent}
          onSave={saveDocFile}
          className="flex-1"
        />
      )}

      {!docIsLoading && docEditContent === null && !docError && (
        <div className="flex-1 flex items-center justify-center bg-[#15232D] text-gray-500">
          File not loaded
        </div>
      )}
    </div>
  );
}
