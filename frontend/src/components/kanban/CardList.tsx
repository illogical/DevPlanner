import { CardPreview } from './CardPreview';
import type { CardSummary } from '../../types';

interface CardListProps {
  cards: CardSummary[];
  projectSlug: string;
}

export function CardList({ cards, projectSlug }: CardListProps) {
  if (cards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-8">
        <p className="text-sm text-gray-500">No cards yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-2 overflow-y-auto pr-1">
      {cards.map((card) => (
        <CardPreview key={card.slug} card={card} projectSlug={projectSlug} />
      ))}
    </div>
  );
}
