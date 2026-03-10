import type { GitState } from '../../api/client';

export type DiffModeId = 'head-working' | 'head-staged' | 'staged-working';

export interface DiffMode {
  id: DiffModeId;
  label: string;
  description: string;
  leftRef: 'HEAD' | 'staged';
  rightRef: 'working' | 'staged';
  leftLabel: string;
  rightLabel: string;
}

export const ALL_DIFF_MODES: DiffMode[] = [
  {
    id: 'head-working',
    label: 'All changes',
    description: 'Last commit → working tree — all uncommitted changes (staged + unstaged)',
    leftRef: 'HEAD',
    rightRef: 'working',
    leftLabel: 'Last commit (HEAD)',
    rightLabel: 'Working tree',
  },
  {
    id: 'head-staged',
    label: 'Staged diff',
    description: 'Last commit → staged index — exactly what will be committed',
    leftRef: 'HEAD',
    rightRef: 'staged',
    leftLabel: 'Last commit (HEAD)',
    rightLabel: 'Staged (index)',
  },
  {
    id: 'staged-working',
    label: 'Unstaged changes',
    description: 'Staged index → working tree — changes not yet staged for commit',
    leftRef: 'staged',
    rightRef: 'working',
    leftLabel: 'Staged (index)',
    rightLabel: 'Working tree',
  },
];

export function getAvailableModes(state: GitState | null): DiffMode[] {
  if (state === 'modified') return [ALL_DIFF_MODES[0]];
  if (state === 'staged') return [ALL_DIFF_MODES[0], ALL_DIFF_MODES[1]];
  if (state === 'modified-staged') return ALL_DIFF_MODES;
  // staged-new: no HEAD version exists — no HEAD-based comparisons available
  return [];
}

export function getModeFromRefs(leftRef: string | null, rightRef: string | null): DiffMode | null {
  if (!leftRef || !rightRef) return null;
  return ALL_DIFF_MODES.find((m) => m.leftRef === leftRef && m.rightRef === rightRef) ?? null;
}

interface DiffGitModeBarProps {
  filename: string;
  gitState: GitState;
  modes: DiffMode[];
  activeMode: DiffMode | null;
  onSelect: (mode: DiffMode) => void;
}

export function DiffGitModeBar({ filename, gitState, modes, activeMode, onSelect }: DiffGitModeBarProps) {
  if (modes.length === 0) return null;

  const stateColors: Partial<Record<GitState, string>> = {
    modified: 'bg-red-500',
    staged: 'bg-blue-500',
    'staged-new': 'bg-blue-500',
    'modified-staged': 'bg-yellow-500',
  };
  const dotColor = stateColors[gitState] ?? 'bg-gray-500';

  return (
    <div className="flex items-center gap-0 border-b border-gray-800 bg-gray-950 shrink-0">
      {/* File context */}
      <div className="flex items-center gap-2 px-4 py-2 border-r border-gray-800 shrink-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <span className="text-xs text-gray-400 font-mono truncate max-w-48" title={filename}>
          {filename}
        </span>
      </div>

      {/* Mode tabs */}
      <div className="flex items-stretch">
        {modes.map((mode) => {
          const isActive = activeMode?.id === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => onSelect(mode)}
              title={mode.description}
              className={`px-4 py-2 text-xs transition-colors border-r border-gray-800 ${
                isActive
                  ? 'bg-gray-800 text-white border-b-2 border-b-blue-500 -mb-px'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
              }`}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      {/* Direction hint */}
      {activeMode && (
        <div className="ml-auto px-4 py-2 flex items-center gap-2 text-xs text-gray-600 shrink-0">
          <span>{activeMode.leftLabel}</span>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>{activeMode.rightLabel}</span>
        </div>
      )}
    </div>
  );
}
