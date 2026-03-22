import { ExpandedCardItem } from './ExpandedCardItem';
import type { CardSummary } from '../../types';

interface ExpandedCardListProps {
  cards: CardSummary[];
  projectSlug: string;
  laneSlug: string;
}

export function ExpandedCardList({ cards, projectSlug }: ExpandedCardListProps) {
  if (cards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-600 italic">No cards yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
      {cards.map((card, index) => (
        <ExpandedCardItem
          key={card.slug}
          card={card}
          projectSlug={projectSlug}
          index={index}
        />
      ))}
    </div>
  );
}
