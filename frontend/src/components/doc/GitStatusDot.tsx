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
  modified: 'bg-red-500',
  staged: 'bg-blue-500',
  'modified-staged': 'bg-yellow-500', // used only for small single-dot (FileColumn)
  untracked: 'bg-red-500',
  ignored: 'bg-gray-500',
  'outside-repo': 'bg-gray-500',
  unknown: 'bg-gray-500',
};

const STATE_LABELS: Record<GitState, string> = {
  clean: 'Clean — all changes committed',
  modified: 'Modified — unstaged changes',
  staged: 'Staged — ready to commit',
  'modified-staged': 'Staged + unstaged changes',
  untracked: 'Untracked — not yet added to git',
  ignored: 'Ignored by .gitignore',
  'outside-repo': 'Not inside a git repository',
  unknown: 'Git status unknown',
};

const STATE_SHORT_LABELS: Record<GitState, string> = {
  clean: 'Clean',
  modified: 'Unstaged',
  staged: 'Staged',
  'modified-staged': 'Partial staged',
  untracked: 'Untracked',
  ignored: 'Ignored',
  'outside-repo': 'Outside repo',
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
    const dotCls = cn(
      'w-2 h-2 rounded-full inline-block shrink-0',
      colorClass,
      onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
      className
    );
    return onClick ? (
      <button type="button" onClick={onClick} title={label} aria-label={label} className={dotCls} />
    ) : (
      <span title={label} aria-label={label} className={dotCls} />
    );
  }

  const dots = (
    <span
      aria-label={label}
      className={cn('w-2 h-2 rounded-full inline-block shrink-0', colorClass, className)}
    />
  );

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
      {dots}
    </button>
  );
}
