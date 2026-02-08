import { useEffect } from 'react';
import { useStore } from '../../store';
import { formatRelativeTime } from '../../utils/time';
import { cn } from '../../utils/cn';
import {
  CheckCircleIcon,
  ArrowRightIcon,
  PlusIcon,
  ArchiveBoxIcon,
  PencilIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import type { HistoryEvent, HistoryActionType } from '../../types';

export function ActivityLog() {
  const { historyEvents, loadHistory, activeProjectSlug, openCardDetail } =
    useStore();

  useEffect(() => {
    if (activeProjectSlug) {
      loadHistory();
    }
  }, [activeProjectSlug, loadHistory]);

  // Group events by time period
  const groupedEvents = groupEventsByTime(historyEvents);

  return (
    <div className="p-4 space-y-6">
      {Object.entries(groupedEvents).map(([timeGroup, events]) => (
        <div key={timeGroup}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">
            {timeGroup}
          </h3>
          <div className="space-y-2">
            {events.map((event) => (
              <ActivityEventCard
                key={event.id}
                event={event}
                onClick={() => {
                  if (event.metadata.cardSlug) {
                    openCardDetail(event.metadata.cardSlug);
                  }
                }}
              />
            ))}
          </div>
        </div>
      ))}

      {historyEvents.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No activity yet
        </div>
      )}
    </div>
  );
}

interface ActivityEventCardProps {
  event: HistoryEvent;
  onClick: () => void;
}

function ActivityEventCard({ event, onClick }: ActivityEventCardProps) {
  const icon = getEventIcon(event.action);
  const colorClass = getEventColor(event.action);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg',
        'bg-gray-800/50 hover:bg-gray-800',
        'border border-gray-700 hover:border-gray-600',
        'transition-all duration-150',
        'group cursor-pointer'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn('flex-shrink-0 mt-0.5', colorClass)}>{icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 group-hover:text-white transition-colors">
            {event.description}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {formatRelativeTime(event.timestamp)}
          </p>
        </div>
      </div>
    </button>
  );
}

function getEventIcon(action: HistoryActionType) {
  switch (action) {
    case 'task:completed':
      return <CheckCircleIcon className="w-5 h-5" />;
    case 'task:uncompleted':
      return <XCircleIcon className="w-5 h-5" />;
    case 'card:moved':
      return <ArrowRightIcon className="w-5 h-5" />;
    case 'card:created':
      return <PlusIcon className="w-5 h-5" />;
    case 'card:archived':
      return <ArchiveBoxIcon className="w-5 h-5" />;
    case 'card:updated':
      return <PencilIcon className="w-5 h-5" />;
    default:
      return <PencilIcon className="w-5 h-5" />;
  }
}

function getEventColor(action: HistoryActionType): string {
  switch (action) {
    case 'task:completed':
      return 'text-green-500';
    case 'task:uncompleted':
      return 'text-gray-500';
    case 'card:moved':
      return 'text-amber-500';
    case 'card:created':
      return 'text-blue-500';
    case 'card:archived':
      return 'text-gray-500';
    case 'card:updated':
      return 'text-violet-500';
    default:
      return 'text-gray-400';
  }
}

function groupEventsByTime(
  events: HistoryEvent[]
): Record<string, HistoryEvent[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const groups: Record<string, HistoryEvent[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    'This Month': [],
    Older: [],
  };

  for (const event of events) {
    const eventDate = new Date(event.timestamp);

    if (eventDate >= today) {
      groups['Today'].push(event);
    } else if (eventDate >= yesterday) {
      groups['Yesterday'].push(event);
    } else if (eventDate >= weekAgo) {
      groups['This Week'].push(event);
    } else if (eventDate >= monthAgo) {
      groups['This Month'].push(event);
    } else {
      groups['Older'].push(event);
    }
  }

  // Remove empty groups
  return Object.fromEntries(
    Object.entries(groups).filter(([, events]) => events.length > 0)
  );
}
