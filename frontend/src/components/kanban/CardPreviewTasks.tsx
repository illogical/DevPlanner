import { useState, useEffect, useMemo } from 'react';
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
  const toggleTask = useStore(state => state.toggleTask);

  // Search state
  const searchQuery = useStore(state => state.searchQuery);
  const searchResults = useStore(state => state.searchResults);
  const matchedTaskIndices = useMemo(() => {
    const result = searchResults.find(r => r.slug === cardSlug);
    return result?.matchedTaskIndices ?? [];
  }, [searchResults, cardSlug]);
  const hasSearchMatches = matchedTaskIndices.length > 0;

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

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
  }, [projectSlug, cardSlug, taskProgress]);

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

  // Show "All tasks complete!" ONLY if no search matches on this card's tasks
  if (
    taskProgress.total === taskProgress.checked &&
    taskProgress.total > 0 &&
    !hasSearchMatches
  ) {
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
    setTasks((prev) =>
      prev.map((item) =>
        item.index === task.index ? { ...item, checked } : item
      )
    );
  };

  // When search is active with matches, show all tasks (no 5-task limit)
  const displayTasks = hasSearchMatches ? tasks : tasks.slice(0, 5);
  const remainingCount = hasSearchMatches ? 0 : Math.max(0, tasks.length - 5);

  return (
    <div className="space-y-0.5 py-1">
      {displayTasks.map((task) => (
        <TaskCheckbox
          key={task.index}
          task={task}
          cardSlug={cardSlug}
          onToggle={(checked) => handleToggle(task, checked)}
          compact
          searchQuery={searchQuery}
          isSearchMatch={matchedTaskIndices.includes(task.index)}
        />
      ))}
      {remainingCount > 0 && (
        <p className="text-xs text-gray-500 mt-1 pl-6">
          +{remainingCount} more tasks...
        </p>
      )}
    </div>
  );
}
