import { useState } from 'react';
import { motion } from 'framer-motion';
import { useDroppable } from '@dnd-kit/core';
import { LaneHeader } from './LaneHeader';
import { CardList } from './CardList';
import { ExpandedCardList } from './ExpandedCardList';
import { QuickAddCard } from './QuickAddCard';
import { cn } from '../../utils/cn';
import type { CardSummary, LaneConfig } from '../../types';

const LANE_WIDTH = 320;

const LAYOUT_SPRING = {
  type: 'spring' as const,
  damping: 32,
  stiffness: 160,
  restDelta: 0.5,
};

interface LaneProps {
  slug: string;
  config: LaneConfig;
  cards: CardSummary[];
  projectSlug: string;
  isCollapsed: boolean;
  isFocused: boolean;
  isHidden: boolean;
  onToggleCollapse: () => void;
  onFocusToggle: () => void;
}

export function Lane({
  slug,
  config,
  cards,
  projectSlug,
  isCollapsed,
  isFocused,
  isHidden,
  onToggleCollapse,
  onFocusToggle,
}: LaneProps) {
  const [isAddingCard, setIsAddingCard] = useState(false);

  const { setNodeRef, isOver } = useDroppable({ id: slug });

  const gone = isCollapsed || isHidden;

  // Width/flex driven via style so Framer Motion `layout` can animate between states.
  // Hidden/collapsed → width: 0 (collapses out of flow)
  // Focused → flex: 1 (grows to fill remaining space as siblings collapse)
  // Normal → fixed 320px
  const motionStyle: React.CSSProperties = gone
    ? { width: 0, minWidth: 0, flexShrink: 0, overflow: 'hidden' }
    : isFocused
    ? { flex: 1, minWidth: 0, overflow: 'hidden' }
    : { width: LANE_WIDTH, minWidth: LANE_WIDTH, flexShrink: 0, overflow: 'hidden' };

  return (
    <motion.div
      layout
      initial={false}
      animate={{ opacity: gone ? 0 : 1 }}
      transition={{
        layout: LAYOUT_SPRING,
        opacity: { duration: 0.18, ease: 'easeInOut' },
      }}
      style={motionStyle}
    >
      {/* Inner panel — full height, padding, border */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-col h-full p-3 rounded-lg border',
          isOver && !isFocused
            ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20'
            : isFocused
            ? 'border-gray-700/60 bg-gray-900/50'
            : 'border-gray-800 bg-gray-900/50',
        )}
        // Keep inner width stable so content doesn't reflow during animation
        style={{ width: isFocused ? '100%' : LANE_WIDTH }}
      >
        <LaneHeader
          displayName={config.displayName}
          color={config.color}
          cardCount={cards.length}
          isCollapsed={isCollapsed}
          isFocused={isFocused}
          onToggleCollapse={onToggleCollapse}
          onFocusToggle={onFocusToggle}
          onAddCard={() => setIsAddingCard(true)}
        />

        {isAddingCard && (
          <div className="mb-2">
            <QuickAddCard lane={slug} onClose={() => setIsAddingCard(false)} />
          </div>
        )}

        {isFocused ? (
          <ExpandedCardList cards={cards} projectSlug={projectSlug} laneSlug={slug} />
        ) : (
          <CardList cards={cards} projectSlug={projectSlug} laneSlug={slug} />
        )}
      </div>
    </motion.div>
  );
}
