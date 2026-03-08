import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { EditorLayout } from '../components/doc/EditorLayout';
import { DocEmptyState } from '../components/doc/DocEmptyState';

export function EditorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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
