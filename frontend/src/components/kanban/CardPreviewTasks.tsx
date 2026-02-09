import { useState, useEffect } from 'react';
import { cardsApi } from '../../api/client';
import { useStore } from '../../store';
import { TaskCheckbox } from '../tasks/TaskCheckbox';
import { Spinner } from '../ui/Spinner';
import type { TaskItem, TaskProgress } from '../../types';

interface CardPreviewTasksProps {
  cardSlug: string;
  projectSlug: string;
  taskProgress: TaskProgress;
}

export function CardPreviewTasks({
  cardSlug,
  projectSlug,
  taskProgress,
}: CardPreviewTasksProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toggleTask } = useStore();

  useEffect(() => {
    let mounted = true;

    cardsApi
      .get(projectSlug, cardSlug)
      .then((card) => {
        if (mounted) {
          // Show all tasks (checked and unchecked)
          setTasks(card.tasks);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error('Failed to load card tasks:', error);
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [projectSlug, cardSlug, JSON.stringify(taskProgress)]);

  if (isLoading) {
    return (
      <div className="py-2 flex justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (taskProgress.total === 0) {
    return (
      <p className="text-xs text-gray-500 py-2 italic">
        No tasks yet
      </p>
    );
  }

  if (taskProgress.total === taskProgress.checked && taskProgress.total > 0) {
    return (
      <p className="text-xs text-green-500 py-2 flex items-center gap-1">
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        All tasks complete!
      </p>
    );
  }

  const handleToggle = async (task: TaskItem, checked: boolean) => {
    await toggleTask(cardSlug, task.index, checked);
    // Store update + WebSocket will trigger refetch via taskProgress change
  };

  return (
    <div className="space-y-0.5 py-1">
      {tasks.slice(0, 5).map((task) => (
        <TaskCheckbox
          key={task.index}
          task={task}
          cardSlug={cardSlug}
          onToggle={(checked) => handleToggle(task, checked)}
          compact
        />
      ))}
      {tasks.length > 5 && (
        <p className="text-xs text-gray-500 mt-1 pl-6">
          +{tasks.length - 5} more tasks...
        </p>
      )}
    </div>
  );
}
