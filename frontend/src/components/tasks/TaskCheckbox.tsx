import { useState } from 'react';
import { cn } from '../../utils/cn';
import type { TaskItem } from '../../types';

interface TaskCheckboxProps {
  task: TaskItem;
  onToggle: (checked: boolean) => Promise<void>;
  compact?: boolean;
}

export function TaskCheckbox({ task, onToggle, compact }: TaskCheckboxProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleChange = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await onToggle(!task.checked);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <label
      className={cn(
        'flex items-start gap-2 cursor-pointer group',
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
    </label>
  );
}
