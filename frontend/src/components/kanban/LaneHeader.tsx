import { IconButton } from '../ui/IconButton';
import { cn } from '../../utils/cn';

interface LaneHeaderProps {
  displayName: string;
  color: string;
  cardCount: number;
  isCollapsed?: boolean;
  isFocused?: boolean;
  onToggleCollapse?: () => void;
  onFocusToggle?: () => void;
  onAddCard?: () => void;
}

export function LaneHeader({
  displayName,
  color,
  cardCount,
  isCollapsed,
  isFocused,
  onToggleCollapse,
  onFocusToggle,
  onAddCard,
}: LaneHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 mb-3 select-none',
        onFocusToggle && 'cursor-pointer'
      )}
      onDoubleClick={onFocusToggle}
      title={isFocused ? 'Double-click to exit focus mode' : 'Double-click to focus this lane'}
    >
      {/* Color bar */}
      <div
        className="w-1 h-6 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Lane name and count */}
      <div className="flex-1 min-w-0">
        <h3 className={cn(
          'font-semibold truncate transition-colors duration-200',
          isFocused ? 'text-white' : 'text-gray-100'
        )}>
          {displayName}
        </h3>
      </div>
      <span className="text-sm text-gray-500 flex-shrink-0">{cardCount}</span>

      {/* Focus exit button — shown only in focus mode */}
      {isFocused && onFocusToggle && (
        <IconButton
          label="Exit focus mode"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onFocusToggle(); }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 9l6 6m0-6l-6 6" />
          </svg>
        </IconButton>
      )}

      {/* Collapse button — hidden in focus mode */}
      {!isFocused && onToggleCollapse && (
        <IconButton
          label={isCollapsed ? 'Expand lane' : 'Collapse lane'}
          size="sm"
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
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
        <IconButton label="Add card" size="sm" onClick={(e) => { e.stopPropagation(); onAddCard(); }}>
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
