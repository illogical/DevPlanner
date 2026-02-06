import { useStore } from '../../store';
import { cn } from '../../utils/cn';
import { Badge, AssigneeBadge, PriorityBadge } from '../ui/Badge';
import { Collapsible } from '../ui/Collapsible';
import { TaskProgressBar } from '../tasks/TaskProgressBar';
import { CardPreviewTasks } from './CardPreviewTasks';
import type { CardSummary } from '../../types';

interface CardPreviewProps {
  card: CardSummary;
  projectSlug: string;
  isDragging?: boolean;
}

export function CardPreview({
  card,
  projectSlug,
  isDragging,
}: CardPreviewProps) {
  const { expandedCardTasks, toggleCardTaskExpansion, openCardDetail } =
    useStore();
  const isExpanded = expandedCardTasks.has(card.slug);
  const hasTasks = card.taskProgress.total > 0;

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't open detail if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('label')
    ) {
      return;
    }
    openCardDetail(card.slug);
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleCardTaskExpansion(card.slug);
  };

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'group relative rounded-lg border border-gray-700 p-3 cursor-pointer',
        'bg-gray-800 hover:bg-gray-750 card-hover',
        isDragging && 'shadow-xl shadow-blue-500/20 rotate-2 scale-105 opacity-90 border-blue-500'
      )}
    >
      {/* Card Title */}
      <h3 className="text-sm font-medium text-gray-100 mb-2 line-clamp-2 pr-2">
        {card.frontmatter.title}
      </h3>

      {/* Task Progress Row */}
      {hasTasks && (
        <div className="flex items-center gap-2 mb-2">
          <TaskProgressBar
            checked={card.taskProgress.checked}
            total={card.taskProgress.total}
          />
          <span className="text-xs text-gray-400">
            {card.taskProgress.checked}/{card.taskProgress.total}
          </span>

          {/* Expand/Collapse Button */}
          <button
            onClick={handleChevronClick}
            className={cn(
              'ml-auto p-1 rounded hover:bg-gray-700 transition-colors',
              'text-gray-400 hover:text-gray-200'
            )}
            aria-label={isExpanded ? 'Collapse tasks' : 'Expand tasks'}
          >
            <svg
              className={cn(
                'w-4 h-4 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Collapsible Task Area */}
      {hasTasks && (
        <Collapsible isOpen={isExpanded}>
          <div className="border-t border-gray-700/50 pt-2 -mx-3 px-3">
            <CardPreviewTasks cardSlug={card.slug} projectSlug={projectSlug} />
          </div>
        </Collapsible>
      )}

      {/* Footer: Priority, Tags, Assignee */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50 gap-2">
        {/* Left side: Priority and Tags */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {card.frontmatter.priority && (
            <PriorityBadge priority={card.frontmatter.priority} />
          )}
          {card.frontmatter.tags?.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" size="sm">
              {tag}
            </Badge>
          ))}
          {card.frontmatter.tags && card.frontmatter.tags.length > 2 && (
            <span className="text-xs text-gray-500">
              +{card.frontmatter.tags.length - 2}
            </span>
          )}
        </div>

        {/* Right side: Assignee */}
        {card.frontmatter.assignee && (
          <AssigneeBadge assignee={card.frontmatter.assignee} />
        )}
      </div>
    </div>
  );
}
