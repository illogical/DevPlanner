/**
 * Format a timestamp as relative time (e.g., "2 minutes ago", "Yesterday")
 */
export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  }

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  }

  if (diffDays === 1) {
    return 'yesterday';
  }

  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  // Format as date for older items
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: now.getFullYear() !== date.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Format a timestamp as absolute date/time (e.g., "2:45 PM", "Yesterday 2:45 PM", "Feb 17, 2:45 PM")
 * This format remains accurate even when the page sits idle, unlike relative time.
 */
export function formatAbsoluteTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const eventDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Today - show just time
  if (eventDate.getTime() === today.getTime()) {
    return timeStr;
  }

  // Yesterday - show "Yesterday" + time
  if (eventDate.getTime() === yesterday.getTime()) {
    return `Yesterday ${timeStr}`;
  }

  // This year - show "Mon DD, HH:MM AM/PM"
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }) + `, ${timeStr}`;
  }

  // Different year - show "Mon DD, YYYY, HH:MM AM/PM"
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + `, ${timeStr}`;
}
