import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { diffLines } from 'diff';
import { DiffToolbar } from '../components/diff/DiffToolbar';
import { DiffLayout } from '../components/diff/DiffLayout';
import { useSyncScroll } from '../hooks/useSyncScroll';
import { vaultApi } from '../api/client';
import type { DiffLineData } from '../components/diff/DiffContent';
import type { LineType } from '../components/diff/DiffLine';

interface DiffViewerState {
  leftContent: string;
  leftFilename: string;
  rightContent: string;
  rightFilename: string;
  language: string;
  wrap: boolean;
  syncScroll: boolean;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: DiffViewerState = {
  leftContent: '',
  leftFilename: '',
  rightContent: '',
  rightFilename: '',
  language: 'auto',
  wrap: false,
  syncScroll: true,
  loading: false,
  error: null,
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

  // Load left pane from ?left= URL param on mount
  useEffect(() => {
    const leftPath = searchParams.get('left');
    if (!leftPath) return;

    setState((s) => ({ ...s, loading: true, error: null }));
    vaultApi
      .getContent(leftPath)
      .then((content) => {
        const filename = leftPath.split('/').pop() ?? leftPath;
        setState((s) => ({
          ...s,
          leftContent: content,
          leftFilename: filename,
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
  }, [searchParams]);

  // Load right pane from optional ?right= URL param on mount
  useEffect(() => {
    const rightPath = searchParams.get('right');
    if (!rightPath) return;

    vaultApi
      .getContent(rightPath)
      .then((content) => {
        const filename = rightPath.split('/').pop() ?? rightPath;
        setState((s) => ({
          ...s,
          rightContent: content,
          rightFilename: filename,
        }));
      })
      .catch(() => {
        // Right pane is optional; silently ignore load failures
      });
  }, [searchParams]);

  // Compute diff lines whenever content changes
  const { leftLines, rightLines } = useMemo(
    () => computePaneLines(state.leftContent, state.rightContent),
    [state.leftContent, state.rightContent]
  );

  const handleLeftFileLoad = useCallback((content: string, filename: string) => {
    setState((s) => ({ ...s, leftContent: content, leftFilename: filename }));
  }, []);

  const handleRightFileLoad = useCallback((content: string, filename: string) => {
    setState((s) => ({ ...s, rightContent: content, rightFilename: filename }));
  }, []);

  const handleSwap = useCallback(() => {
    setState((s) => ({
      ...s,
      leftContent: s.rightContent,
      leftFilename: s.rightFilename,
      rightContent: s.leftContent,
      rightFilename: s.leftFilename,
    }));
  }, []);

  const handleClear = useCallback(() => {
    setState((s) => ({
      ...s,
      leftContent: '',
      leftFilename: '',
      rightContent: '',
      rightFilename: '',
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
        leftLines={leftLines}
        rightContent={state.rightContent}
        rightFilename={state.rightFilename}
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
