import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { diffLines } from 'diff';
import { DiffToolbar } from '../components/diff/DiffToolbar';
import { DiffLayout } from '../components/diff/DiffLayout';
import { useSyncScroll } from '../hooks/useSyncScroll';
import { vaultApi, gitApi } from '../api/client';
import type { DiffLineData } from '../components/diff/DiffContent';
import type { LineType } from '../components/diff/DiffLine';

/**
 * Git-aware diff modes.
 * - `manual`:            Load files via drop/paste/URL params (?left= / ?right=)
 * - `working-committed`: Left = HEAD (last commit), Right = working tree
 * - `staged-committed`:  Left = HEAD (last commit), Right = staged (index)
 * - `working-staged`:    Left = staged (index),     Right = working tree
 */
type DiffMode = 'manual' | 'working-committed' | 'staged-committed' | 'working-staged';

interface DiffViewerState {
  leftContent: string;
  leftFilename: string;
  leftLabel?: string;
  rightContent: string;
  rightFilename: string;
  rightLabel?: string;
  language: string;
  wrap: boolean;
  syncScroll: boolean;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: DiffViewerState = {
  leftContent: '',
  leftFilename: '',
  leftLabel: undefined,
  rightContent: '',
  rightFilename: '',
  rightLabel: undefined,
  language: 'auto',
  wrap: false,
  syncScroll: true,
  loading: false,
  error: null,
};

/** Labels shown in pane headers for each git diff mode. */
const MODE_LABELS: Record<Exclude<DiffMode, 'manual'>, { left: string; right: string }> = {
  'working-committed': { left: 'HEAD (committed)', right: 'Working tree' },
  'staged-committed':  { left: 'HEAD (committed)', right: 'Staged (index)' },
  'working-staged':    { left: 'Staged (index)',   right: 'Working tree' },
};

/**
 * Compute per-pane line arrays from a diff result.
 * Left pane omits 'added' lines (they only appear on the right).
 * Right pane omits 'removed' lines (they only appear on the left).
 */
function computePaneLines(
  leftContent: string,
  rightContent: string
): { leftLines: DiffLineData[]; rightLines: DiffLineData[] } {
  if (!leftContent && !rightContent) {
    return { leftLines: [], rightLines: [] };
  }

  const changes = diffLines(leftContent, rightContent, { newlineIsToken: false });

  const leftLines: DiffLineData[] = [];
  const rightLines: DiffLineData[] = [];
  let leftNum = 1;
  let rightNum = 1;

  for (const part of changes) {
    // Split text into lines; trim the trailing empty string that results from
    // a value ending with '\n'.
    const rawLines = part.value.split('\n');
    if (rawLines[rawLines.length - 1] === '') rawLines.pop();

    if (part.added) {
      for (const text of rawLines) {
        rightLines.push({ lineNumber: rightNum++, text, type: 'added' as LineType });
        // Left pane gets a blank placeholder to keep visual alignment
        leftLines.push({ lineNumber: null, text: '', type: 'unchanged' as LineType });
      }
    } else if (part.removed) {
      for (const text of rawLines) {
        leftLines.push({ lineNumber: leftNum++, text, type: 'removed' as LineType });
        // Right pane gets a blank placeholder
        rightLines.push({ lineNumber: null, text: '', type: 'unchanged' as LineType });
      }
    } else {
      for (const text of rawLines) {
        leftLines.push({ lineNumber: leftNum++, text, type: 'unchanged' as LineType });
        rightLines.push({ lineNumber: rightNum++, text, type: 'unchanged' as LineType });
      }
    }
  }

  return { leftLines, rightLines };
}

export function DiffViewerPage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<DiffViewerState>(INITIAL_STATE);

  const { leftRef, rightRef, onScroll } = useSyncScroll(state.syncScroll);

  // Detect git diff mode from URL params.
  // ?path=<file>&mode=<git-mode>  →  git-aware comparison
  // ?left=<file>&right=<file>     →  manual mode (legacy / vault links)
  const gitPathRaw = searchParams.get('path');
  const modeParam = searchParams.get('mode') as DiffMode | null;
  // Basic frontend guard: reject paths with traversal sequences before sending to the backend.
  const gitPath = gitPathRaw && !gitPathRaw.includes('..') ? gitPathRaw : null;
  const isGitMode = !!gitPath && !!modeParam && modeParam !== 'manual';
  const diffMode: DiffMode = isGitMode ? (modeParam as DiffMode) : 'manual';

  // Load git-aware content when ?path= and ?mode= are both provided.
  useEffect(() => {
    if (!isGitMode || !gitPath) return;

    const filename = gitPath.split('/').pop() ?? gitPath;
    const labels = MODE_LABELS[diffMode as Exclude<DiffMode, 'manual'>];

    setState((s) => ({ ...s, loading: true, error: null }));

    const loadLeft = (): Promise<string> => {
      if (diffMode === 'working-staged') {
        // Left = staged (index)
        return gitApi.getFileAtRef(gitPath, ':0');
      }
      // Left = HEAD (committed) for both working-committed and staged-committed
      return gitApi.getFileAtRef(gitPath, 'HEAD');
    };

    const loadRight = (): Promise<string> => {
      if (diffMode === 'staged-committed') {
        // Right = staged (index)
        return gitApi.getFileAtRef(gitPath, ':0');
      }
      // Right = working tree for working-committed and working-staged
      return vaultApi.getContent(gitPath);
    };

    Promise.all([loadLeft(), loadRight()])
      .then(([leftContent, rightContent]) => {
        setState((s) => ({
          ...s,
          leftContent,
          leftFilename: filename,
          leftLabel: labels.left,
          rightContent,
          rightFilename: filename,
          rightLabel: labels.right,
          loading: false,
          error: null,
        }));
      })
      .catch((err: Error) => {
        setState((s) => ({
          ...s,
          loading: false,
          error: err.message || 'Failed to load git diff.',
        }));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitPath, diffMode, isGitMode]);

  // Load left pane from ?left= URL param (manual mode)
  useEffect(() => {
    const leftPath = searchParams.get('left');
    if (!leftPath || isGitMode) return;

    setState((s) => ({ ...s, loading: true, error: null }));
    vaultApi
      .getContent(leftPath)
      .then((content) => {
        const filename = leftPath.split('/').pop() ?? leftPath;
        setState((s) => ({
          ...s,
          leftContent: content,
          leftFilename: filename,
          leftLabel: undefined,
          loading: false,
        }));
      })
      .catch((err: Error) => {
        setState((s) => ({
          ...s,
          loading: false,
          error: err.message || 'Failed to load left pane file.',
        }));
      });
  }, [searchParams, isGitMode]);

  // Load right pane from optional ?right= URL param (manual mode)
  useEffect(() => {
    const rightPath = searchParams.get('right');
    if (!rightPath || isGitMode) return;

    vaultApi
      .getContent(rightPath)
      .then((content) => {
        const filename = rightPath.split('/').pop() ?? rightPath;
        setState((s) => ({
          ...s,
          rightContent: content,
          rightFilename: filename,
          rightLabel: undefined,
        }));
      })
      .catch(() => {
        // Right pane is optional; silently ignore load failures
      });
  }, [searchParams, isGitMode]);

  // Compute diff lines whenever content changes
  const { leftLines, rightLines } = useMemo(
    () => computePaneLines(state.leftContent, state.rightContent),
    [state.leftContent, state.rightContent]
  );

  const handleLeftFileLoad = useCallback((content: string, filename: string) => {
    setState((s) => ({ ...s, leftContent: content, leftFilename: filename, leftLabel: undefined }));
  }, []);

  const handleRightFileLoad = useCallback((content: string, filename: string) => {
    setState((s) => ({ ...s, rightContent: content, rightFilename: filename, rightLabel: undefined }));
  }, []);

  const handleSwap = useCallback(() => {
    setState((s) => ({
      ...s,
      leftContent: s.rightContent,
      leftFilename: s.rightFilename,
      leftLabel: s.rightLabel,
      rightContent: s.leftContent,
      rightFilename: s.leftFilename,
      rightLabel: s.leftLabel,
    }));
  }, []);

  const handleClear = useCallback(() => {
    setState((s) => ({
      ...s,
      leftContent: '',
      leftFilename: '',
      leftLabel: undefined,
      rightContent: '',
      rightFilename: '',
      rightLabel: undefined,
      error: null,
    }));
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      <DiffToolbar
        language={state.language}
        onLanguageChange={(lang) => setState((s) => ({ ...s, language: lang }))}
        wrap={state.wrap}
        onWrapToggle={() => setState((s) => ({ ...s, wrap: !s.wrap }))}
        syncScroll={state.syncScroll}
        onSyncScrollToggle={() => setState((s) => ({ ...s, syncScroll: !s.syncScroll }))}
        onSwap={handleSwap}
        onClear={handleClear}
      />

      {/* Error banner */}
      {state.error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800 text-sm text-red-400">
          {state.error}
        </div>
      )}

      {/* Loading indicator */}
      {state.loading && (
        <div className="px-4 py-2 bg-gray-900 border-b border-gray-700 text-sm text-gray-400">
          Loading file…
        </div>
      )}

      <DiffLayout
        leftContent={state.leftContent}
        leftFilename={state.leftFilename}
        leftLabel={state.leftLabel}
        leftLines={leftLines}
        rightContent={state.rightContent}
        rightFilename={state.rightFilename}
        rightLabel={state.rightLabel}
        rightLines={rightLines}
        language={state.language}
        wrap={state.wrap}
        leftScrollRef={leftRef}
        rightScrollRef={rightRef}
        onLeftScroll={onScroll('left')}
        onRightScroll={onScroll('right')}
        onLeftFileLoad={handleLeftFileLoad}
        onRightFileLoad={handleRightFileLoad}
      />
    </div>
  );
}
