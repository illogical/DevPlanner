import { useEffect } from 'react';
import { useStore } from '../../store';
import { ActivityLog } from './ActivityLog';

/**
 * Always-visible activity sidebar (desktop only).
 * Shows real-time activity history for the active project.
 */
export function ActivitySidebar() {
  const { activeProjectSlug, loadHistory } = useStore();

  useEffect(() => {
    if (activeProjectSlug) {
      loadHistory();
    }
  }, [activeProjectSlug, loadHistory]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-gray-100 uppercase tracking-wide">
          Activity History
        </h2>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto">
        <ActivityLog />
      </div>
    </div>
  );
}
