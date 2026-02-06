import { cn } from '../../utils/cn';

type BadgeVariant = 'default' | 'secondary' | 'priority-high' | 'priority-medium' | 'priority-low' | 'user' | 'agent';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  secondary: 'bg-gray-700 text-gray-300 border-gray-600',
  'priority-high': 'bg-red-500/20 text-red-400 border-red-500/30',
  'priority-medium': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'priority-low': 'bg-green-500/20 text-green-400 border-green-500/30',
  user: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  agent: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-sm',
};

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border font-medium',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
}

// Convenience component for priority badges
interface PriorityBadgeProps {
  priority: 'low' | 'medium' | 'high';
  size?: BadgeSize;
}

export function PriorityBadge({ priority, size = 'sm' }: PriorityBadgeProps) {
  const labels = {
    low: 'Low',
    medium: 'Med',
    high: 'High',
  };

  return (
    <Badge variant={`priority-${priority}`} size={size}>
      {labels[priority]}
    </Badge>
  );
}

// Convenience component for assignee badges
interface AssigneeBadgeProps {
  assignee: 'user' | 'agent';
  size?: BadgeSize;
}

export function AssigneeBadge({ assignee, size = 'sm' }: AssigneeBadgeProps) {
  const icons = {
    user: '👤',
    agent: '🤖',
  };

  return (
    <Badge variant={assignee} size={size}>
      {icons[assignee]}
    </Badge>
  );
}
