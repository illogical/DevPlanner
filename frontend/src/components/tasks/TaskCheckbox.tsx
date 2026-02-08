import { useState, useEffect, useRef } from 'react';
import { motion, useAnimate } from 'framer-motion';
import { cn } from '../../utils/cn';
import { useStore } from '../../store';
import type { TaskItem } from '../../types';

interface TaskCheckboxProps {
  task: TaskItem;
  cardSlug: string;
  onToggle: (checked: boolean) => Promise<void>;
  compact?: boolean;
}

export function TaskCheckbox({ task, cardSlug, onToggle, compact }: TaskCheckboxProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [scope, animate] = useAnimate();
  const { getTaskIndicator } = useStore();
  const previousIndicatorRef = useRef<string | null>(null);

  const handleChange = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await onToggle(!task.checked);
    } finally {
      setIsUpdating(false);
    }
  };

  // Check for change indicators and trigger animation
  useEffect(() => {
    const indicator = getTaskIndicator(cardSlug, task.index);
    
    // Only animate if we have a new indicator (not the same one as before)
    if (indicator && indicator.id !== previousIndicatorRef.current) {
      previousIndicatorRef.current = indicator.id;
      
      // Run the flash and pulse animation
      const runAnimation = async () => {
        // Flash effect
        await animate(
          scope.current,
          { 
            backgroundColor: ['rgba(34, 197, 94, 0)', 'rgba(34, 197, 94, 0.2)', 'rgba(34, 197, 94, 0)'],
          },
          { duration: 0.3, ease: 'easeOut' }
        );
        
        // Pulse effect (overlaps with flash)
        animate(
          scope.current,
          { scale: [1, 1.02, 1] },
          { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }
        );
      };
      
      runAnimation();
    } else if (!indicator) {
      // Reset when indicator is removed
      previousIndicatorRef.current = null;
    }
  }, [animate, cardSlug, getTaskIndicator, scope, task.index]);

  return (
    <motion.label
      ref={scope}
      className={cn(
        'flex items-start gap-2 cursor-pointer group rounded px-2 -mx-2',
        compact ? 'py-0.5' : 'py-1',
        isUpdating && 'opacity-50 pointer-events-none'
      )}
    >
      <input
        type="checkbox"
        checked={task.checked}
        onChange={handleChange}
        disabled={isUpdating}
        className="mt-0.5 flex-shrink-0"
      />
      <span
        className={cn(
          'transition-colors duration-150',
          task.checked
            ? 'text-gray-500 line-through'
            : 'text-gray-200 group-hover:text-gray-100',
          compact ? 'text-xs' : 'text-sm'
        )}
      >
        {task.text}
      </span>
    </motion.label>
  );
}
