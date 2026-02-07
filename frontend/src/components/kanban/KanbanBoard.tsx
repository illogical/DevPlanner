import { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { useStore } from '../../store';
import { Lane } from './Lane';
import { CollapsedLaneTab } from './CollapsedLaneTab';
import { Spinner } from '../ui/Spinner';
import { CardPreview } from './CardPreview';
import type { CardSummary } from '../../types';

export function KanbanBoard() {
  const {
    projects,
    activeProjectSlug,
    cardsByLane,
    laneCollapsedState,
    isLoadingCards,
    loadCards,
    toggleLaneCollapsed,
    moveCard,
    reorderCards,
  } = useStore();

  const [activeCard, setActiveCard] = useState<CardSummary | null>(null);

  // Configure sensors for drag interaction
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts (prevents accidental drags)
      },
    })
  );

  const activeProject = projects.find((p) => p.slug === activeProjectSlug);

  useEffect(() => {
    if (activeProjectSlug) {
      loadCards();
    }
  }, [activeProjectSlug, loadCards]);

  // Handle drag start - store the active card for overlay rendering
  const handleDragStart = (event: any) => {
    const { active } = event;
    const cardSlug = active.id as string;

    // Find the card across all lanes
    for (const cards of Object.values(cardsByLane)) {
      const card = cards.find((c) => c.slug === cardSlug);
      if (card) {
        setActiveCard(card);
        break;
      }
    }
  };

  // Handle drag end - determine if it's a reorder or move
  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return; // Dropped outside droppable area

    const cardSlug = active.id as string;
    const overId = over.id as string;

    // Find source lane
    let sourceLane = '';
    for (const [lane, cards] of Object.entries(cardsByLane)) {
      if (cards.some((c) => c.slug === cardSlug)) {
        sourceLane = lane;
        break;
      }
    }

    // Determine if we're hovering over a card or a lane
    let targetLane = '';
    let targetPosition: number | undefined;

    // Check if overId is a lane (starts with numbers like "01-", "02-")
    if (/^\d+-/.test(overId)) {
      // Dropped on a lane container
      targetLane = overId;
      targetPosition = undefined; // Append to end
    } else {
      // Dropped on another card - find which lane it belongs to
      for (const [lane, cards] of Object.entries(cardsByLane)) {
        const overCardIndex = cards.findIndex((c) => c.slug === overId);
        if (overCardIndex !== -1) {
          targetLane = lane;
          targetPosition = overCardIndex;
          break;
        }
      }
    }

    if (!targetLane) return;

    // Same lane: reorder
    if (sourceLane === targetLane) {
      const cards = cardsByLane[sourceLane];
      const oldIndex = cards.findIndex((c) => c.slug === cardSlug);
      const newIndex =
        targetPosition !== undefined
          ? targetPosition
          : cards.findIndex((c) => c.slug === overId);

      if (oldIndex === newIndex) return; // No change

      // Create new order
      const reordered = [...cards];
      const [movedCard] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, movedCard);

      const order = reordered.map((c) => c.filename);
      await reorderCards(sourceLane, order);
    } else {
      // Different lane: move
      await moveCard(cardSlug, targetLane, targetPosition);
    }
  };

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-300 mb-2">
            No project selected
          </h2>
          <p className="text-gray-500">
            Select a project from the sidebar to get started
          </p>
        </div>
      </div>
    );
  }

  if (isLoadingCards) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Get lanes in order (01-upcoming, 02-in-progress, etc.)
  const laneEntries = Object.entries(activeProject.lanes).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  // Separate expanded and collapsed lanes
  const expandedLanes = laneEntries.filter(
    ([slug]) => !laneCollapsedState[slug]
  );
  const collapsedLanes = laneEntries.filter(
    ([slug]) => laneCollapsedState[slug]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex gap-3 p-4 overflow-x-auto">
        {/* Expanded lanes */}
        {expandedLanes.map(([slug, config]) => (
          <Lane
            key={slug}
            slug={slug}
            config={config}
            cards={cardsByLane[slug] || []}
            projectSlug={activeProject.slug}
            isCollapsed={false}
            onToggleCollapse={() => toggleLaneCollapsed(slug)}
          />
        ))}

        {/* Collapsed lane tabs */}
        {collapsedLanes.length > 0 && (
          <div className="flex gap-2 flex-shrink-0">
            {collapsedLanes.map(([slug, config]) => (
              <CollapsedLaneTab
                key={slug}
                displayName={config.displayName}
                color={config.color}
                cardCount={(cardsByLane[slug] || []).length}
                onClick={() => toggleLaneCollapsed(slug)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Drag overlay - shows the card being dragged */}
      <DragOverlay>
        {activeCard ? (
          <CardPreview
            card={activeCard}
            projectSlug={activeProject.slug}
            isDragging={true}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
