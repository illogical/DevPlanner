import { cn } from '../../utils/cn';

interface TaskProgressBarProps {
  checked: number;
  total: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function TaskProgressBar({
  checked,
  total,
  size = 'sm',
  className,
}: TaskProgressBarProps) {
  const percentage = total > 0 ? (checked / total) * 100 : 0;
  const isComplete = checked === total && total > 0;

  return (
    <div
      className={cn(
        'bg-gray-700 rounded-full overflow-hidden',
        size === 'sm' ? 'h-1.5 w-16' : 'h-2 w-24',
        className
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all duration-300 ease-out',
          isComplete ? 'bg-green-500' : 'bg-blue-500'
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
