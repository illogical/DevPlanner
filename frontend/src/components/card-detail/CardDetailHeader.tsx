import { IconButton } from '../ui/IconButton';
import { useStore } from '../../store';
import type { Card } from '../../types';

interface CardDetailHeaderProps {
  card: Card;
  onClose: () => void;
}

// Map lane slugs to display-friendly names
const laneDisplayNames: Record<string, string> = {
  '01-upcoming': 'Upcoming',
  '02-in-progress': 'In Progress',
  '03-complete': 'Complete',
  '04-archive': 'Archive',
};

export function CardDetailHeader({ card, onClose }: CardDetailHeaderProps) {
  const activeProjectSlug = useStore(state => state.activeProjectSlug);
  const projectPrefix = useStore(
    state => state.projects.find(p => p.slug === activeProjectSlug)?.prefix
  );

  const cardId = (projectPrefix && card.frontmatter.cardNumber)
    ? `${projectPrefix}-${card.frontmatter.cardNumber}`
    : null;

  return (
    <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 z-10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {cardId && (
            <span className="text-sm text-gray-500 font-mono">{cardId}</span>
          )}
          <h2 className="text-xl font-semibold text-gray-100 mb-1">
            {card.frontmatter.title}
          </h2>
          <p className="text-sm text-gray-500">
            {laneDisplayNames[card.lane] || card.lane}
          </p>
        </div>
        <IconButton label="Close panel" onClick={onClose}>
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </IconButton>
      </div>
    </div>
  );
}
