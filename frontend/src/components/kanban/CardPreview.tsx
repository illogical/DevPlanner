import { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '../../store';
import { cn } from '../../utils/cn';
import { Badge, AssigneeBadge } from '../ui/Badge';
import { Collapsible } from '../ui/Collapsible';
import { TaskProgressBar } from '../tasks/TaskProgressBar';
import { CardPreviewTasks } from './CardPreviewTasks';
import { AnimatedCardWrapper } from '../animations/AnimatedCardWrapper';
import type { CardSummary } from '../../types';

function getPriorityBorderClass(priority?: 'low' | 'medium' | 'high'): string {
  switch (priority) {
    case 'high':   return 'border-l-[3px] border-l-red-500';
    case 'medium': return 'border-l-[3px] border-l-amber-500';
    case 'low':    return 'border-l-[3px] border-l-green-500';
    default:       return '';
  }
}

interface CardPreviewProps {
  card: CardSummary;
  projectSlug: string;
  laneSlug?: string;
  isDragging?: boolean;
}

export function CardPreview({
  card,
  projectSlug,
  isDragging: isDraggingOverlay,
}: CardPreviewProps) {
  const { expandedCardTasks, toggleCardTaskExpansion, openCardDetail, projects } =
    useStore();
  const isExpanded = expandedCardTasks.has(card.slug);
  const hasTasks = card.taskProgress.total > 0;

  // Get project prefix for card identifier
  const projectPrefix = projects.find(p => p.slug === projectSlug)?.prefix;
  const cardId = (projectPrefix && card.frontmatter.cardNumber)
    ? `${projectPrefix}-${card.frontmatter.cardNumber}`
    : null;

  // Auto-expand tasks when card is in the In Progress lane
  const hasAutoExpandedRef = useRef(false);
  useEffect(() => {
    if (card.lane === '02-in-progress' && hasTasks && !isExpanded && !hasAutoExpandedRef.current) {
      toggleCardTaskExpansion(card.slug);
      hasAutoExpandedRef.current = true;
    }
    // Reset when card leaves in-progress lane
    if (card.lane !== '02-in-progress') {
      hasAutoExpandedRef.current = false;
    }
  }, [card.lane, card.slug, hasTasks, isExpanded, toggleCardTaskExpansion]);

  // 
  // Set up sortable functionality (only if not in drag overlay)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.slug,
    disabled: isDraggingOverlay, // Disable sorting for the overlay instance
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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
    <AnimatedCardWrapper cardSlug={card.slug}>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={handleCardClick}
        className={cn(
          'group relative rounded-lg border border-gray-700 p-3 cursor-pointer',
          'bg-gray-800',
          'hover:bg-gray-750 card-hover',
          !isDragging && !isDraggingOverlay && getPriorityBorderClass(card.frontmatter.priority),
          (isDragging || isDraggingOverlay) && 'shadow-xl shadow-blue-500/20 rotate-2 scale-105 opacity-90 border-blue-500',
          isDragging && 'opacity-50' // Reduce opacity of the original card while dragging
        )}
      >
        {/* Header: Title + Task Count */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-sm font-medium text-gray-100 line-clamp-2 leading-snug min-w-0">
            {cardId && (
              <span className="text-gray-500 font-mono text-xs mr-1.5">{cardId}</span>
            )}
            {card.frontmatter.title}
          </h3>

          {hasTasks && (
            <span
              className={cn(
                'flex-shrink-0 inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-bold border shadow-sm transition-colors',
                card.taskProgress.checked > 0
                  ? 'bg-gray-900 border-gray-600 text-gray-100' // In progress: popping slightly
                  : 'bg-gray-950 border-gray-800 text-gray-500' // Not started: recessed/dim
              )}
            >
              {card.taskProgress.checked}/{card.taskProgress.total}
            </span>
          )}
        </div>

        {/* Progress Bar + Expand Toggle */}
        {hasTasks && (
          <div className="flex items-center gap-2 mb-3">
            <TaskProgressBar
              checked={card.taskProgress.checked}
              total={card.taskProgress.total}
              size="md"
              className="flex-1"
            />

            <button
              onClick={handleChevronClick}
              className={cn(
                'p-1 rounded hover:bg-gray-700 transition-colors',
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
              <CardPreviewTasks 
                cardSlug={card.slug} 
                projectSlug={projectSlug}
                taskProgress={card.taskProgress}
              />
            </div>
          </Collapsible>
        )}

        {/* Footer: Tags, Assignee */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50 gap-2">
          {/* Left side: Tags */}
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
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
    </AnimatedCardWrapper>
  );
}
