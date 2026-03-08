import { cn } from '../../utils/cn';
import type { GitState } from '../../api/client';

interface GitStatusDotProps {
  state: GitState | undefined;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

const STATE_COLORS: Record<GitState, string> = {
  clean: 'bg-[#2ea043]',
  modified: 'bg-[#f5a524]',
  staged: 'bg-[#416E47]',
  'modified-staged': 'bg-[#D97757]',
  untracked: 'bg-[#ce9178]',
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

export function GitStatusDot({ state, loading, onClick, className }: GitStatusDotProps) {
  const colorClass = loading
    ? 'animate-pulse bg-gray-600'
    : state
    ? STATE_COLORS[state]
    : 'bg-gray-600';

  const label = state ? STATE_LABELS[state] : 'No git status';

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
