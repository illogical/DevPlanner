import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { formatAbsoluteTime } from '../../utils/time';
import { cn } from '../../utils/cn';
import type { HistoryEvent, HistoryActionType } from '../../types';

export function ActivityLog() {
  const { historyEvents, loadHistory, activeProjectSlug, openCardDetail } =
    useStore();

  const prevEventIdsRef = useRef<Set<string>>(new Set());
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeProjectSlug) {
      loadHistory();
    }
  }, [activeProjectSlug, loadHistory]);

  // Track new events and highlight them temporarily
  useEffect(() => {
    const currentEventIds = new Set(historyEvents.map(e => e.id));
    const previousEventIds = prevEventIdsRef.current;

    // Find newly added events (present in current but not in previous)
    const newIds = new Set<string>();
    currentEventIds.forEach(id => {
      if (!previousEventIds.has(id)) {
        newIds.add(id);
      }
    });

    // Only highlight if we had previous events (skip initial load)
    if (newIds.size > 0 && previousEventIds.size > 0) {
      setNewEventIds(newIds);

      // Remove highlight after 5 seconds
      const timer = setTimeout(() => {
        setNewEventIds(new Set());
      }, 5000);

      // Update ref for next comparison
      prevEventIdsRef.current = currentEventIds;

      return () => clearTimeout(timer);
    }

    // Update ref for next comparison (including initial load)
    prevEventIdsRef.current = currentEventIds;
  }, [historyEvents]);

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
            <AnimatePresence initial={false}>
              {events.map((event) => (
                <ActivityEventCard
                  key={event.id}
                  event={event}
                  isNew={newEventIds.has(event.id)}
                  onClick={() => {
                    if (event.metadata.cardSlug) {
                      openCardDetail(event.metadata.cardSlug);
                    }
                  }}
                />
              ))}
            </AnimatePresence>
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
  isNew: boolean;
  onClick: () => void;
}

function ActivityEventCard({ event, isNew, onClick }: ActivityEventCardProps) {
  const icon = getEventIcon(event.action);
  const colorClass = getEventColor(event.action);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        type: 'spring',
        stiffness: 500,
        damping: 30,
      }}
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg',
        'bg-gray-800/50 hover:bg-gray-800',
        'border transition-all duration-300',
        'group cursor-pointer',
        isNew
          ? 'border-blue-500/60 shadow-lg shadow-blue-500/20 bg-blue-900/20'
          : 'border-gray-700 hover:border-gray-600'
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
            {formatAbsoluteTime(event.timestamp)}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

function getEventIcon(action: HistoryActionType) {
  const baseClassName = "w-5 h-5";
  
  switch (action) {
    case 'task:completed':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'task:uncompleted':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'card:moved':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      );
    case 'card:created':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      );
    case 'card:archived':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    case 'card:updated':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    case 'card:deleted':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      );
    case 'task:added':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'project:created':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
      );
    case 'project:updated':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    case 'project:archived':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    case 'file:uploaded':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      );
    case 'file:deleted':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      );
    case 'file:associated':
    case 'file:disassociated':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      );
    case 'file:updated':
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    default:
      return (
        <svg className={baseClassName} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

function getEventColor(action: HistoryActionType): string {
  switch (action) {
    // Task events
    case 'task:completed':
      return 'text-green-500';
    case 'task:uncompleted':
      return 'text-amber-500';
    case 'task:added':
      return 'text-green-500';

    // Card events
    case 'card:created':
      return 'text-green-500';
    case 'card:moved':
      return 'text-blue-500';
    case 'card:updated':
      return 'text-blue-500';
    case 'card:archived':
      return 'text-gray-500';
    case 'card:deleted':
      return 'text-red-500';

    // Project events
    case 'project:created':
      return 'text-green-500';
    case 'project:updated':
      return 'text-blue-500';
    case 'project:archived':
      return 'text-gray-500';

    // File events
    case 'file:uploaded':
      return 'text-green-500';
    case 'file:deleted':
      return 'text-red-500';
    case 'file:updated':
      return 'text-blue-500';
    case 'file:associated':
      return 'text-blue-500';
    case 'file:disassociated':
      return 'text-gray-500';

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
