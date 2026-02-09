import { useDroppable } from '@dnd-kit/core';
import { cn } from '../../utils/cn';

interface CollapsedLaneTabProps {
  laneSlug: string;
  displayName: string;
  color: string;
  cardCount: number;
  onClick: () => void;
}

export function CollapsedLaneTab({
  laneSlug,
  displayName,
  color,
  cardCount,
  onClick,
}: CollapsedLaneTabProps) {
  // Make collapsed lane tab droppable
  const { setNodeRef, isOver } = useDroppable({
    id: laneSlug,
  });

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'flex-shrink-0 w-10 h-full min-h-[200px]',
        'bg-gray-900 border rounded-lg transition-all duration-150',
        isOver 
          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20' 
          : 'border-gray-700 hover:bg-gray-800',
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
