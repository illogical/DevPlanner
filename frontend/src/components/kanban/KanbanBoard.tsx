import { useEffect } from 'react';
import { useStore } from '../../store';
import { Lane } from './Lane';
import { CollapsedLaneTab } from './CollapsedLaneTab';
import { Spinner } from '../ui/Spinner';

export function KanbanBoard() {
  const {
    projects,
    activeProjectSlug,
    cardsByLane,
    laneCollapsedState,
    isLoadingCards,
    loadCards,
    toggleLaneCollapsed,
  } = useStore();

  const activeProject = projects.find((p) => p.slug === activeProjectSlug);

  useEffect(() => {
    if (activeProjectSlug) {
      loadCards();
    }
  }, [activeProjectSlug, loadCards]);

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
  );
}
