import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { LaneHeader } from './LaneHeader';
import { CardList } from './CardList';
import { QuickAddCard } from './QuickAddCard';
import { cn } from '../../utils/cn';
import type { CardSummary, LaneConfig } from '../../types';

interface LaneProps {
  slug: string;
  config: LaneConfig;
  cards: CardSummary[];
  projectSlug: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Lane({
  slug,
  config,
  cards,
  projectSlug,
  isCollapsed,
  onToggleCollapse,
}: LaneProps) {
  const [isAddingCard, setIsAddingCard] = useState(false);

  // Make lane droppable - uses slug as the ID so we can identify which lane
  const { setNodeRef, isOver } = useDroppable({
    id: slug,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col h-full',
        'bg-gray-900/50 rounded-lg border transition-all duration-300 ease-out',
        isOver ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20' : 'border-gray-800',
        isCollapsed ? 'w-0 opacity-0 overflow-hidden p-0 border-0' : 'w-full md:w-80 md:min-w-[320px] p-3'
      )}
    >
      <LaneHeader
        displayName={config.displayName}
        color={config.color}
        cardCount={cards.length}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onAddCard={() => setIsAddingCard(true)}
      />

      {/* Quick add card form */}
      {isAddingCard && (
        <div className="mb-2">
          <QuickAddCard lane={slug} onClose={() => setIsAddingCard(false)} />
        </div>
      )}

      {/* Card list */}
      <CardList cards={cards} projectSlug={projectSlug} laneSlug={slug} />
    </div>
  );
}
