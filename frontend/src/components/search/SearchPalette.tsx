import { useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import type { PaletteResultType, PaletteFilterTab, PaletteSearchResult } from '../../types';
import { highlightText } from '../../utils/highlight';
import { cn } from '../../utils/cn';

// ─── Constants ────────────────────────────────────────────────────────────────

const TAB_TYPES: Record<PaletteFilterTab, PaletteResultType[]> = {
  all: ['card', 'task', 'description', 'tag', 'assignee', 'file', 'file-description', 'link', 'link-label', 'link-description'],
  cards: ['card', 'description', 'tag', 'assignee'],
  tasks: ['task'],
  files: ['file', 'file-description'],
  links: ['link', 'link-label', 'link-description'],
};

const GROUP_ORDER: PaletteResultType[] = [
  'card', 'task', 'description', 'tag', 'assignee',
  'file', 'file-description', 'link', 'link-label', 'link-description',
];

const TYPE_LABELS: Record<PaletteResultType, string> = {
  card: 'Card',
  task: 'Task',
  description: 'Description',
  tag: 'Tag',
  assignee: 'Assignee',
  file: 'File',
  'file-description': 'File Desc',
  link: 'Link',
  'link-label': 'Link Label',
  'link-description': 'Link Desc',
};

// Tailwind classes for each type chip
const TYPE_CHIP_CLASSES: Record<PaletteResultType, string> = {
  card: 'bg-blue-900/60 text-blue-300',
  task: 'bg-purple-900/60 text-purple-300',
  description: 'bg-teal-900/60 text-teal-300',
  tag: 'bg-green-900/60 text-green-300',
  assignee: 'bg-orange-900/60 text-orange-300',
  file: 'bg-yellow-900/60 text-yellow-300',
  'file-description': 'bg-amber-900/60 text-amber-300',
  link: 'bg-sky-900/60 text-sky-300',
  'link-label': 'bg-indigo-900/60 text-indigo-300',
  'link-description': 'bg-violet-900/60 text-violet-300',
};

const FILTER_TABS: { key: PaletteFilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'cards', label: 'Cards' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'files', label: 'Files' },
  { key: 'links', label: 'Links' },
];

const MAX_PER_GROUP = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupResults(results: PaletteSearchResult[], tab: PaletteFilterTab) {
  const allowed = TAB_TYPES[tab];
  const filtered = results.filter((r) => allowed.includes(r.type));

  const byType = new Map<PaletteResultType, PaletteSearchResult[]>();
  for (const r of filtered) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type)!.push(r);
  }

  // Sort each group by score desc
  for (const [, arr] of byType) {
    arr.sort((a, b) => b.score - a.score);
  }

  return GROUP_ORDER
    .filter((t) => byType.has(t))
    .map((t) => ({ type: t, items: byType.get(t)! }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ResultRowProps {
  result: PaletteSearchResult;
  query: string;
  isSelected: boolean;
  flatIndex: number;
  isGlobal: boolean;
  onActivate: () => void;
  onHover: () => void;
}

function ResultRow({ result, query, isSelected, onActivate, onHover, isGlobal }: ResultRowProps) {
  const rowRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll selected row into view
  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isSelected]);

  return (
    <button
      ref={rowRef}
      onClick={onActivate}
      onMouseEnter={onHover}
      className={cn(
        'w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors rounded-lg',
        isSelected ? 'bg-gray-700' : 'hover:bg-gray-800'
      )}
    >
      {/* Type chip */}
      <span
        className={cn(
          'shrink-0 mt-0.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
          TYPE_CHIP_CLASSES[result.type]
        )}
      >
        {TYPE_LABELS[result.type]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-100 truncate">
          {highlightText(result.primaryText, query)}
        </div>
        {result.snippet && (
          <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">
            {highlightText(result.snippet, query)}
          </div>
        )}
      </div>

      {/* Context: card ID + project (if global) */}
      <div className="shrink-0 text-right text-xs text-gray-500 flex flex-col items-end gap-0.5">
        {result.cardId && (
          <span className="font-mono bg-gray-800 px-1 rounded">{result.cardId}</span>
        )}
        {isGlobal && (
          <span className="text-gray-600">{result.projectSlug}</span>
        )}
        {!result.cardId && result.cardTitle !== result.primaryText && (
          <span className="text-gray-600 truncate max-w-[100px]">{result.cardTitle}</span>
        )}
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SearchPalette() {
  const inputRef = useRef<HTMLInputElement>(null);

  const isPaletteOpen = useStore((s) => s.isPaletteOpen);
  const paletteQuery = useStore((s) => s.paletteQuery);
  const paletteResults = useStore((s) => s.paletteResults);
  const isPaletteSearching = useStore((s) => s.isPaletteSearching);
  const isPaletteGlobal = useStore((s) => s.isPaletteGlobal);
  const paletteTab = useStore((s) => s.paletteTab);
  const selectedPaletteIndex = useStore((s) => s.selectedPaletteIndex);

  const closePalette = useStore((s) => s.closePalette);
  const setPaletteQuery = useStore((s) => s.setPaletteQuery);
  const setPaletteTab = useStore((s) => s.setPaletteTab);
  const togglePaletteGlobal = useStore((s) => s.togglePaletteGlobal);
  const setSelectedPaletteIndex = useStore((s) => s.setSelectedPaletteIndex);
  const activatePaletteResult = useStore((s) => s.activatePaletteResult);

  // Grouped results for the current tab
  const groups = useMemo(() => groupResults(paletteResults, paletteTab), [paletteResults, paletteTab]);

  // Flat list of all visible results for keyboard navigation
  const flatResults = useMemo(
    () => groups.flatMap((g) => g.items.slice(0, MAX_PER_GROUP)),
    [groups]
  );

  // Tab cycling
  const advanceTab = useCallback(
    (backwards: boolean) => {
      const idx = FILTER_TABS.findIndex((t) => t.key === paletteTab);
      const next = backwards
        ? (idx - 1 + FILTER_TABS.length) % FILTER_TABS.length
        : (idx + 1) % FILTER_TABS.length;
      setPaletteTab(FILTER_TABS[next].key);
    },
    [paletteTab, setPaletteTab]
  );

  // Keyboard handler
  useEffect(() => {
    if (!isPaletteOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePalette();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedPaletteIndex(Math.min(flatResults.length - 1, selectedPaletteIndex + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedPaletteIndex(Math.max(0, selectedPaletteIndex - 1));
        return;
      }
      if (e.key === 'Enter') {
        const selected = flatResults[selectedPaletteIndex];
        if (selected) activatePaletteResult(selected);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        advanceTab(e.shiftKey);
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isPaletteOpen, selectedPaletteIndex, flatResults, closePalette, setSelectedPaletteIndex, activatePaletteResult, advanceTab]);

  // Auto-focus input when palette opens
  useEffect(() => {
    if (isPaletteOpen) {
      // Defer focus by one tick so the AnimatePresence animation doesn't block it
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isPaletteOpen]);

  const showEmpty = !isPaletteSearching && paletteQuery.trim().length >= 2 && flatResults.length === 0;
  const showMinChars = paletteQuery.trim().length > 0 && paletteQuery.trim().length < 2;

  // Flat index counter for each result row
  let flatIdx = 0;

  return (
    <AnimatePresence>
      {isPaletteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
          onClick={closePalette}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-[640px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input Row */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700">
              {/* Search icon */}
              <svg className="w-5 h-5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>

              {/* Query input */}
              <input
                ref={inputRef}
                type="text"
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Search DevPlanner…"
                className="flex-1 bg-transparent text-gray-100 text-sm placeholder-gray-500 focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />

              {/* Searching spinner */}
              {isPaletteSearching && (
                <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin shrink-0" />
              )}

              {/* Scope toggle */}
              <button
                onClick={togglePaletteGlobal}
                className={cn(
                  'shrink-0 text-xs px-2 py-1 rounded border transition-colors',
                  isPaletteGlobal
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                    : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                )}
              >
                {isPaletteGlobal ? 'All projects' : 'This project'}
              </button>

              {/* Esc hint */}
              <kbd className="shrink-0 text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded font-mono border border-gray-700">
                Esc
              </kbd>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-700/60">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setPaletteTab(tab.key)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded transition-colors',
                    paletteTab === tab.key
                      ? 'bg-blue-600/20 text-blue-300 font-medium'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Result List */}
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {showMinChars && (
                <div className="text-center text-sm text-gray-500 py-8">
                  Type at least 2 characters to search…
                </div>
              )}

              {!paletteQuery.trim() && !isPaletteSearching && (
                <div className="text-center text-sm text-gray-500 py-8">
                  Start typing to search cards, tasks, files, and links
                </div>
              )}

              {showEmpty && (
                <div className="text-center text-sm text-gray-500 py-8">
                  No results for <span className="text-gray-300">"{paletteQuery}"</span>
                </div>
              )}

              {groups.map((group) => {
                const visibleItems = group.items.slice(0, MAX_PER_GROUP);
                const hiddenCount = group.items.length - visibleItems.length;

                return (
                  <div key={group.type} className="mb-2">
                    {/* Group header */}
                    <div className="flex items-center gap-2 px-3 py-1 mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        {TYPE_LABELS[group.type]}
                      </span>
                      <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 rounded-full">
                        {group.items.length}
                      </span>
                    </div>

                    {/* Result rows */}
                    {visibleItems.map((result) => {
                      const currentIdx = flatIdx++;
                      return (
                        <ResultRow
                          key={`${result.type}-${result.cardSlug}-${result.taskIndex ?? result.fileFilename ?? result.linkId ?? ''}`}
                          result={result}
                          query={paletteQuery}
                          isSelected={selectedPaletteIndex === currentIdx}
                          flatIndex={currentIdx}
                          isGlobal={isPaletteGlobal}
                          onActivate={() => activatePaletteResult(result)}
                          onHover={() => setSelectedPaletteIndex(currentIdx)}
                        />
                      );
                    })}

                    {hiddenCount > 0 && (
                      <p className="text-xs text-gray-600 px-3 py-1">
                        + {hiddenCount} more…
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer hints */}
            <div className="flex items-center justify-end gap-4 px-4 py-2 border-t border-gray-700/60 text-[10px] text-gray-600">
              <span><kbd className="font-mono bg-gray-800 px-1 rounded">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono bg-gray-800 px-1 rounded">↵</kbd> open</span>
              <span><kbd className="font-mono bg-gray-800 px-1 rounded">Tab</kbd> filter</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
