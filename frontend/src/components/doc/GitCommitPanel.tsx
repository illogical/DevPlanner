import { useRef, useEffect, useState } from 'react';
import { useStore } from '../../store';
import type { GitState } from '../../api/client';

export function GitCommitPanel() {
  const {
    gitCurrentState,
    gitCommitMessage,
    gitActionLoading,
    docFilePath,
    setGitCommitMessage,
    stageFile,
    unstageFile,
    discardUnstaged,
    commitFile,
    toggleCommitPanel,
  } = useStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleCommitPanel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleCommitPanel]);

  if (!docFilePath) return null;

  const state = gitCurrentState as GitState | null;

  const handleCommit = async () => {
    if (!gitCommitMessage.trim()) {
      setCommitError('Commit message is required.');
      return;
    }
    setCommitError(null);
    await commitFile(docFilePath, gitCommitMessage.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCommit();
    }
    if (e.key === 'Escape') {
      toggleCommitPanel();
    }
  };

  const canCommit = state === 'staged' || state === 'modified-staged';
  const canStage = state === 'modified' || state === 'untracked' || state === 'modified-staged';
  const canUnstage = state === 'staged' || state === 'modified-staged';
  const canDiscard = state === 'modified' || state === 'modified-staged';

  return (
    <div className="absolute right-0 top-full mt-1 z-50 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-200">Git Actions</span>
        <button
          onClick={toggleCommitPanel}
          className="text-gray-400 hover:text-gray-200 p-0.5 rounded"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {state === 'clean' ? (
        <p className="text-sm text-gray-400">All changes committed.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {canDiscard && (
              <button
                onClick={() => discardUnstaged(docFilePath)}
                disabled={gitActionLoading}
                className="px-2 py-1 text-xs rounded bg-red-900/50 text-red-300 hover:bg-red-900 border border-red-800 disabled:opacity-50"
              >
                Discard
              </button>
            )}
            {canStage && (
              <button
                onClick={() => stageFile(docFilePath)}
                disabled={gitActionLoading}
                className="px-2 py-1 text-xs rounded bg-blue-900/50 text-blue-300 hover:bg-blue-900 border border-blue-800 disabled:opacity-50"
              >
                Stage
              </button>
            )}
            {canUnstage && (
              <button
                onClick={() => unstageFile(docFilePath)}
                disabled={gitActionLoading}
                className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 disabled:opacity-50"
              >
                Unstage
              </button>
            )}
          </div>

          {canCommit && (
            <>
              <textarea
                ref={textareaRef}
                className="w-full bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 p-2 resize-none outline-none focus:border-blue-500"
                rows={3}
                placeholder="Commit message (Enter to commit, Shift+Enter for new line)"
                value={gitCommitMessage}
                onChange={(e) => { setGitCommitMessage(e.target.value); setCommitError(null); }}
                onKeyDown={handleKeyDown}
              />
              {commitError && (
                <p className="text-xs text-red-400 mt-1">{commitError}</p>
              )}
              <button
                onClick={handleCommit}
                disabled={gitActionLoading || !gitCommitMessage.trim()}
                className="mt-2 w-full px-3 py-1.5 text-sm rounded bg-green-800 text-green-100 hover:bg-green-700 disabled:opacity-50"
              >
                Commit
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
