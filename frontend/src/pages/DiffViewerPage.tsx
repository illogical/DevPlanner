import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { diffLines, diffWords } from 'diff';
import { DiffToolbar } from '../components/diff/DiffToolbar';
import { DiffLayout } from '../components/diff/DiffLayout';
import { DiffGitModeBar, getAvailableModes, getModeFromRefs } from '../components/diff/DiffGitModeBar';
import type { DiffMode } from '../components/diff/DiffGitModeBar';
import { useSyncScroll } from '../hooks/useSyncScroll';
import { vaultApi, gitApi } from '../api/client';
import type { GitState } from '../api/client';
import type { DiffLineData } from '../components/diff/DiffContent';
import { useStore } from '../store';

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

/**
 * Split a diff `value` string into individual lines, dropping the trailing
 * empty entry that results when the value ends with '\n'.
 */
function splitDiffValue(value: string): string[] {
  const lines = value.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Compute character-range highlights for a single line pair using word diff.
 * Returns undefined for both sides when the entire content changed (no shared
 * words) to avoid redundant highlighting on a full-replacement line.
 */
function computeWordHighlights(
  removedText: string,
  addedText: string
): {
  removedHighlights: Array<{ start: number; end: number }>;
  addedHighlights: Array<{ start: number; end: number }>;
} | null {
  const wordDiff = diffWords(removedText, addedText);
  const removedHighlights: Array<{ start: number; end: number }> = [];
  const addedHighlights: Array<{ start: number; end: number }> = [];
  let rPos = 0;
  let aPos = 0;

  for (const wp of wordDiff) {
    if (wp.removed) {
      removedHighlights.push({ start: rPos, end: rPos + wp.value.length });
      rPos += wp.value.length;
    } else if (wp.added) {
      addedHighlights.push({ start: aPos, end: aPos + wp.value.length });
      aPos += wp.value.length;
    } else {
      rPos += wp.value.length;
      aPos += wp.value.length;
    }
  }

  // If the entire removed text is one big highlight, the line is a full
  // replacement — inline highlights add no information, so skip them.
  const isFullReplacement =
    removedHighlights.length === 1 &&
    removedHighlights[0].start === 0 &&
    removedHighlights[0].end === removedText.length;

  if (isFullReplacement) return null;
  return { removedHighlights, addedHighlights };
}

/**
 * Compute per-pane line arrays from a diff result.
 *
 * Consecutive removed+added parts are treated as a "replacement" and their
 * lines are paired row-for-row so they appear side-by-side in the viewer.
 * For 1:1 line pairs a word-level diff is computed to highlight the exact
 * words that changed, not just the whole line.
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

  for (let i = 0; i < changes.length; i++) {
    const part = changes[i];
    const next = changes[i + 1];

    if (part.removed && next?.added) {
      // Replacement block: pair removed ↔ added lines for horizontal alignment
      const removedLines = splitDiffValue(part.value);
      const addedLines = splitDiffValue(next.value);
      const maxLen = Math.max(removedLines.length, addedLines.length);

      for (let j = 0; j < maxLen; j++) {
        const removedText = j < removedLines.length ? removedLines[j] : null;
        const addedText = j < addedLines.length ? addedLines[j] : null;

        // Compute inline word highlights for 1:1 line pairs
        let removedHighlights: Array<{ start: number; end: number }> | undefined;
        let addedHighlights: Array<{ start: number; end: number }> | undefined;
        if (removedText !== null && addedText !== null) {
          const hl = computeWordHighlights(removedText, addedText);
          if (hl) {
            removedHighlights = hl.removedHighlights;
            addedHighlights = hl.addedHighlights;
          }
        }

        if (removedText !== null) {
          leftLines.push({ lineNumber: leftNum++, text: removedText, type: 'removed', highlights: removedHighlights });
        } else {
          leftLines.push({ lineNumber: null, text: '', type: 'unchanged' });
        }

        if (addedText !== null) {
          rightLines.push({ lineNumber: rightNum++, text: addedText, type: 'added', highlights: addedHighlights });
        } else {
          rightLines.push({ lineNumber: null, text: '', type: 'unchanged' });
        }
      }
      i++; // consumed next (added) part
    } else if (part.added) {
      for (const text of splitDiffValue(part.value)) {
        rightLines.push({ lineNumber: rightNum++, text, type: 'added' });
        leftLines.push({ lineNumber: null, text: '', type: 'unchanged' });
      }
    } else if (part.removed) {
      for (const text of splitDiffValue(part.value)) {
        leftLines.push({ lineNumber: leftNum++, text, type: 'removed' });
        rightLines.push({ lineNumber: null, text: '', type: 'unchanged' });
      }
    } else {
      for (const text of splitDiffValue(part.value)) {
        leftLines.push({ lineNumber: leftNum++, text, type: 'unchanged' });
        rightLines.push({ lineNumber: rightNum++, text, type: 'unchanged' });
      }
    }
  }

  return { leftLines, rightLines };
}

export function DiffViewerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<DiffViewerState>(INITIAL_STATE);
  const [gitFileState, setGitFileState] = useState<GitState | null>(null);
  const [hasHead, setHasHead] = useState<boolean>(true);

  const { leftRef, rightRef, onScroll } = useSyncScroll(state.syncScroll);
  const { refreshGitStatus } = useStore();
  
  // Load left pane from ?left= URL param (manual mode)
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
  }, [searchParams]);

  // Fetch git status when gitPath is present (drives available mode tabs)
  useEffect(() => {
    const gitPath = searchParams.get('gitPath');
    if (!gitPath) { setGitFileState(null); setHasHead(true); return; }
    gitApi.getStatus(gitPath).then((r) => {
      setGitFileState(r.state);
      refreshGitStatus(gitPath); // sync into Zustand store so BottomBar + GitCommitPanel see fresh state
    }).catch(() => setGitFileState(null));
    // Probe whether a HEAD version exists — false for files never committed (staged-new origin)
    gitApi.getFileAtRef(gitPath, 'HEAD').then((content) => setHasHead(content.length > 0)).catch(() => setHasHead(false));
  }, [searchParams]);

  // Load both panes from git refs (?gitPath=, ?leftRef=, ?rightRef=)
  useEffect(() => {
    const gitPath = searchParams.get('gitPath');
    const leftRef = searchParams.get('leftRef') as 'staged' | 'HEAD' | 'working' | null;
    const rightRef = searchParams.get('rightRef') as 'staged' | 'HEAD' | 'working' | null;
    if (!gitPath || !leftRef || !rightRef) return;

    setState((s) => ({ ...s, loading: true, error: null }));

    const loadSide = (ref: 'staged' | 'HEAD' | 'working'): Promise<string> =>
      ref === 'working' ? vaultApi.getContent(gitPath) : gitApi.getFileAtRef(gitPath, ref === 'staged' ? ':0' : ref);

    // Use mode labels for pane headers (old on left, new on right)
    const activeMode = getModeFromRefs(leftRef, rightRef);
    const filename = gitPath.split('/').pop() ?? gitPath;
    const leftLabel = activeMode?.leftLabel ?? `${filename} (${leftRef})`;
    const rightLabel = activeMode?.rightLabel ?? `${filename} (${rightRef})`;

    Promise.all([loadSide(leftRef), loadSide(rightRef)])
      .then(([left, right]) => {
        setState((s) => ({
          ...s,
          leftContent: left,
          leftFilename: leftLabel,
          rightContent: right,
          rightFilename: rightLabel,
          loading: false,
        }));
      })
      .catch((err: Error) => setState((s) => ({ ...s, loading: false, error: err.message })));
  }, [searchParams]);

  // Load right pane from optional ?right= URL param (manual mode)
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
          rightLabel: undefined,
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

  // Switch git comparison mode by updating URL params (old on left, new on right is enforced by mode definitions)
  const handleModeSelect = useCallback((mode: DiffMode) => {
    const gitPath = searchParams.get('gitPath');
    if (!gitPath) return;
    setSearchParams({ gitPath, leftRef: mode.leftRef, rightRef: mode.rightRef });
  }, [searchParams, setSearchParams]);

  // Derived git mode state
  const gitPath = searchParams.get('gitPath');
  const availableModes = getAvailableModes(gitFileState, hasHead);
  const activeMode = getModeFromRefs(searchParams.get('leftRef'), searchParams.get('rightRef'));
  const showNoHeadBanner = !!gitPath && !hasHead && gitFileState !== null;

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

      {/* Git mode switcher — only shown when a git file is loaded with available comparisons */}
      {gitPath && gitFileState && availableModes.length > 0 && (
        <DiffGitModeBar
          filename={gitPath.split('/').pop() ?? gitPath}
          gitState={gitFileState}
          modes={availableModes}
          activeMode={activeMode}
          onSelect={handleModeSelect}
        />
      )}

      {/* No-HEAD banner — shown when a git file has never been committed */}
      {showNoHeadBanner && (
        <div className="px-4 py-2 bg-blue-900/20 border-b border-blue-800/50 text-xs text-blue-300">
          New file — no previous commit exists. Showing staged vs working tree only.
        </div>
      )}

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
