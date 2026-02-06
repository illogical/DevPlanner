import type { LaneConfig } from './types';

/**
 * Lane folder names - these match the directory structure in the workspace
 */
export const LANE_NAMES = {
  UPCOMING: '01-upcoming',
  IN_PROGRESS: '02-in-progress',
  COMPLETE: '03-complete',
  ARCHIVE: '04-archive',
} as const;

/**
 * Ordered array of all lane names for iteration
 */
export const ALL_LANES = [
  LANE_NAMES.UPCOMING,
  LANE_NAMES.IN_PROGRESS,
  LANE_NAMES.COMPLETE,
  LANE_NAMES.ARCHIVE,
] as const;

/**
 * Default lane configuration for new projects
 */
export const DEFAULT_LANE_CONFIG: Record<string, LaneConfig> = {
  [LANE_NAMES.UPCOMING]: {
    displayName: 'Upcoming',
    color: '#6b7280',
    collapsed: false,
  },
  [LANE_NAMES.IN_PROGRESS]: {
    displayName: 'In Progress',
    color: '#3b82f6',
    collapsed: false,
  },
  [LANE_NAMES.COMPLETE]: {
    displayName: 'Complete',
    color: '#22c55e',
    collapsed: true,
  },
  [LANE_NAMES.ARCHIVE]: {
    displayName: 'Archive',
    color: '#9ca3af',
    collapsed: true,
  },
};
