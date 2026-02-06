import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { TaskCheckbox } from '../tasks/TaskCheckbox';
import { AddTaskInput } from '../tasks/AddTaskInput';
import { TaskProgressBar } from '../tasks/TaskProgressBar';
import type { TaskItem } from '../../types';

interface TaskListProps {
  tasks: TaskItem[];
  cardSlug: string;
}

const taskVariants = {
  initial: { opacity: 0, height: 0, x: -10 },
  animate: { opacity: 1, height: 'auto', x: 0 },
  exit: { opacity: 0, height: 0, x: -20 },
};

export function TaskList({ tasks, cardSlug }: TaskListProps) {
  const { toggleTask, addTask } = useStore();

  const checkedCount = tasks.filter((t) => t.checked).length;
  const totalCount = tasks.length;

  const handleToggle = async (task: TaskItem, checked: boolean) => {
    await toggleTask(cardSlug, task.index, checked);
  };

  const handleAddTask = async (text: string) => {
    await addTask(cardSlug, text);
  };

  return (
    <div className="border-t border-gray-700 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-400">Tasks</h3>
        {totalCount > 0 && (
          <div className="flex items-center gap-2">
            <TaskProgressBar checked={checkedCount} total={totalCount} size="md" />
            <span className="text-sm text-gray-400">
              {checkedCount}/{totalCount}
            </span>
          </div>
        )}
      </div>

      {/* Task list with animations */}
      <div className="space-y-1 mb-4">
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => (
            <motion.div
              key={task.index}
              variants={taskVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2 }}
              layout
            >
              <TaskCheckbox
                task={task}
                onToggle={(checked) => handleToggle(task, checked)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add task input */}
      <AddTaskInput onAdd={handleAddTask} placeholder="Add a new task..." />

      {/* Empty state */}
      {tasks.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          No tasks yet. Add one above!
        </p>
      )}
    </div>
  );
}
