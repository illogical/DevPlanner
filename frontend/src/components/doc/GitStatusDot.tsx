import { cn } from '../../utils/cn';
import type { GitState } from '../../api/client';

interface GitStatusDotProps {
  state: GitState | undefined;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  showLabel?: boolean;
}

const STATE_COLORS: Record<GitState, string> = {
  clean: 'bg-emerald-500',
  modified: 'bg-orange-500',
  staged: 'bg-blue-500',
  'modified-staged': 'bg-yellow-500',
  untracked: 'bg-red-500',
  ignored: 'bg-gray-500',
  'outside-repo': 'bg-gray-500',
  unknown: 'bg-gray-500',
};

const STATE_LABELS: Record<GitState, string> = {
  clean: 'Clean',
  modified: 'Modified (unstaged)',
  staged: 'Staged',
  'modified-staged': 'Modified & staged',
  untracked: 'Untracked',
  ignored: 'Ignored',
  'outside-repo': 'Outside git repo',
  unknown: 'Unknown status',
};

const STATE_SHORT_LABELS: Record<GitState, string> = {
  clean: 'Clean',
  modified: 'Modified',
  staged: 'Staged',
  'modified-staged': 'Staged*',
  untracked: 'Untracked',
  ignored: 'Ignored',
  'outside-repo': 'Outside',
  unknown: 'Unknown',
};

export function GitStatusDot({ state, loading, onClick, className, showLabel }: GitStatusDotProps) {
  const colorClass = loading
    ? 'animate-pulse bg-gray-600'
    : state
      ? STATE_COLORS[state]
      : 'bg-gray-600';

  const label = state ? STATE_LABELS[state] : 'No git status';
  const shortLabel = state ? STATE_SHORT_LABELS[state] : '';

  if (!showLabel || !state) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        className={cn(
          'w-2 h-2 rounded-full inline-block shrink-0',
          colorClass,
          onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 pl-2.5 pr-2 py-1 rounded-full border transition-colors outline-none",
        onClick ? "cursor-pointer bg-gray-800/80 border-gray-700/60 hover:bg-gray-700 hover:border-gray-600/80" : "border-transparent bg-transparent"
      )}
      onClick={onClick}
      title={label}
    >
      <span className="text-xs text-gray-400 select-none">
        {shortLabel}
      </span>
      <span
        aria-label={label}
        className={cn(
          'w-2 h-2 rounded-full inline-block shrink-0',
          colorClass,
          className
        )}
      />
    </button>
  );
}
