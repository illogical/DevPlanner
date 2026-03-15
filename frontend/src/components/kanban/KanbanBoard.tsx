import { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  rectIntersection,
} from '@dnd-kit/core';
import { LayoutGroup } from 'framer-motion';
import { useStore } from '../../store';
import { Lane } from './Lane';
import { CollapsedLaneTab } from './CollapsedLaneTab';
import { Spinner } from '../ui/Spinner';
import { CardPreview } from './CardPreview';
import type { CardSummary } from '../../types';

export function KanbanBoard() {
  const projects = useStore((state) => state.projects);
  const activeProjectSlug = useStore((state) => state.activeProjectSlug);
  const cardsByLane = useStore((state) => state.cardsByLane);
  const laneCollapsedState = useStore((state) => state.laneCollapsedState);
  const focusedLane = useStore((state) => state.focusedLane);
  const isLoadingCards = useStore((state) => state.isLoadingCards);
  const loadCards = useStore((state) => state.loadCards);
  const toggleLaneCollapsed = useStore((state) => state.toggleLaneCollapsed);
  const setFocusedLane = useStore((state) => state.setFocusedLane);
  const moveCard = useStore((state) => state.moveCard);
  const reorderCards = useStore((state) => state.reorderCards);

  const [activeCard, setActiveCard] = useState<CardSummary | null>(null);

  // Disable drag when a lane is focused
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: focusedLane ? Infinity : 8,
      },
    })
  );

  const activeProject = projects.find((p) => p.slug === activeProjectSlug);

  useEffect(() => {
    if (activeProjectSlug) {
      loadCards();
    }
  }, [activeProjectSlug, loadCards]);

  // Escape key exits focus mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusedLane) {
        setFocusedLane(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedLane, setFocusedLane]);

  const handleDragStart = (event: any) => {
    const { active } = event;
    const cardSlug = active.id as string;
    for (const cards of Object.values(cardsByLane)) {
      const card = cards.find((c) => c.slug === cardSlug);
      if (card) {
        setActiveCard(card);
        break;
      }
    }
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    const cardSlug = active.id as string;
    const overId = over.id as string;

    let sourceLane = '';
    for (const [lane, cards] of Object.entries(cardsByLane)) {
      if (cards.some((c) => c.slug === cardSlug)) {
        sourceLane = lane;
        break;
      }
    }

    let targetLane = '';
    let targetPosition: number | undefined;

    if (/^\d+-/.test(overId)) {
      targetLane = overId.replace('-empty', '');
      targetPosition = undefined;
    } else {
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

    if (sourceLane === targetLane) {
      const cards = cardsByLane[sourceLane];
      const oldIndex = cards.findIndex((c) => c.slug === cardSlug);
      const newIndex =
        targetPosition !== undefined
          ? targetPosition
          : cards.findIndex((c) => c.slug === overId);

      if (oldIndex === newIndex) return;

      const reordered = [...cards];
      const [movedCard] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, movedCard);

      const order = reordered.map((c) => c.filename);
      await reorderCards(sourceLane, order);
    } else {
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

  const laneEntries = Object.entries(activeProject.lanes).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const expandedLanes = laneEntries.filter(([slug]) => !laneCollapsedState[slug]);
  const collapsedLanes = laneEntries.filter(([slug]) => laneCollapsedState[slug]);

  const handleFocusToggle = (slug: string) => {
    setFocusedLane(focusedLane === slug ? null : slug);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* overflow-hidden when focused so collapsing lanes don't cause scrollbar flicker */}
      <div className={`h-full flex flex-col md:flex-row gap-3 p-4 overflow-y-auto ${focusedLane ? 'md:overflow-hidden' : 'md:overflow-x-auto'}`}>
        <LayoutGroup id="lanes">
          {/* Expanded lanes */}
          {expandedLanes.map(([slug, config]) => (
            <Lane
              key={slug}
              slug={slug}
              config={config}
              cards={cardsByLane[slug] || []}
              projectSlug={activeProject.slug}
              isCollapsed={false}
              isFocused={focusedLane === slug}
              isHidden={focusedLane !== null && focusedLane !== slug}
              onToggleCollapse={() => toggleLaneCollapsed(slug)}
              onFocusToggle={() => handleFocusToggle(slug)}
            />
          ))}
        </LayoutGroup>

        {/* Collapsed lane tabs — fade out when a lane is focused */}
        {collapsedLanes.length > 0 && (
          <div
            className="flex gap-2 flex-shrink-0"
            style={{
              opacity: focusedLane ? 0 : 1,
              pointerEvents: focusedLane ? 'none' : 'auto',
              transition: 'opacity 0.2s ease',
            }}
          >
            {collapsedLanes.map(([slug, config]) => (
              <CollapsedLaneTab
                key={slug}
                laneSlug={slug}
                displayName={config.displayName}
                color={config.color}
                cardCount={(cardsByLane[slug] || []).length}
                onClick={() => toggleLaneCollapsed(slug)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Drag overlay */}
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
