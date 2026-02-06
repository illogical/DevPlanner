import { cn } from '../../utils/cn';

interface CollapsedLaneTabProps {
  displayName: string;
  color: string;
  cardCount: number;
  onClick: () => void;
}

export function CollapsedLaneTab({
  displayName,
  color,
  cardCount,
  onClick,
}: CollapsedLaneTabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-shrink-0 w-10 h-full min-h-[200px]',
        'bg-gray-900 border border-gray-700 rounded-lg',
        'hover:bg-gray-800 transition-colors duration-150',
        'flex flex-col items-center py-3 gap-2',
        'group'
      )}
    >
      {/* Color indicator */}
      <div
        className="w-1.5 h-6 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Card count */}
      <span className="text-xs text-gray-400 font-medium">{cardCount}</span>

      {/* Vertical text */}
      <div
        className="flex-1 flex items-center justify-center"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
      >
        <span className="text-sm font-medium text-gray-400 group-hover:text-gray-200 transition-colors transform rotate-180">
          {displayName}
        </span>
      </div>
    </button>
  );
}
