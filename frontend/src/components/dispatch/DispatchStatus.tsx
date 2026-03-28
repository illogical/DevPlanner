import { cn } from '../../utils/cn';
import type { DispatchRecord } from '../../types';

interface DispatchStatusProps {
  dispatch: DispatchRecord | null | undefined;
  className?: string;
  /** If true, shows a compact inline badge instead of the full badge */
  compact?: boolean;
}

const statusConfig = {
  running: {
    dot: 'bg-blue-400 animate-pulse',
    label: 'Dispatched',
    text: 'text-blue-400',
    bg: 'bg-blue-950/40 border-blue-800',
  },
  completed: {
    dot: 'bg-green-400',
    label: 'Completed',
    text: 'text-green-400',
    bg: 'bg-green-950/40 border-green-800',
  },
  failed: {
    dot: 'bg-red-400',
    label: 'Dispatch Failed',
    text: 'text-red-400',
    bg: 'bg-red-950/40 border-red-800',
  },
  review: {
    dot: 'bg-amber-400',
    label: 'Needs Review',
    text: 'text-amber-400',
    bg: 'bg-amber-950/40 border-amber-800',
  },
} as const;

export function DispatchStatus({ dispatch, className, compact = false }: DispatchStatusProps) {
  if (!dispatch) return null;

  const config = statusConfig[dispatch.status] ?? statusConfig.running;

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border',
          config.bg,
          config.text,
          className
        )}
        title={`Dispatch ${dispatch.status} — ${dispatch.adapter} on branch ${dispatch.branch}`}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dot)} />
        {config.label}
      </span>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm',
        config.bg,
        config.text,
        className
      )}
    >
      <span className={cn('w-2 h-2 rounded-full shrink-0', config.dot)} />
      <span className="font-medium">{config.label}</span>
      <span className="text-gray-400 text-xs truncate max-w-[160px]" title={dispatch.branch}>
        {dispatch.branch}
      </span>
    </div>
  );
}
