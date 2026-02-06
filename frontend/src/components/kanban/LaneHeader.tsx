import { IconButton } from '../ui/IconButton';
import { cn } from '../../utils/cn';

interface LaneHeaderProps {
  displayName: string;
  color: string;
  cardCount: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onAddCard?: () => void;
}

export function LaneHeader({
  displayName,
  color,
  cardCount,
  isCollapsed,
  onToggleCollapse,
  onAddCard,
}: LaneHeaderProps) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {/* Color bar */}
      <div
        className="w-1 h-6 rounded-full"
        style={{ backgroundColor: color }}
      />

      {/* Lane name and count */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-100 truncate">{displayName}</h3>
      </div>
      <span className="text-sm text-gray-500">{cardCount}</span>

      {/* Collapse button */}
      {onToggleCollapse && (
        <IconButton
          label={isCollapsed ? 'Expand lane' : 'Collapse lane'}
          size="sm"
          onClick={onToggleCollapse}
        >
          <svg
            className={cn(
              'w-4 h-4 transition-transform duration-200',
              isCollapsed ? 'rotate-90' : '-rotate-90'
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </IconButton>
      )}

      {/* Add card button */}
      {onAddCard && (
        <IconButton label="Add card" size="sm" onClick={onAddCard}>
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </IconButton>
      )}
    </div>
  );
}
