import { useState, useEffect, useRef } from 'react';
import { motion, useAnimate } from 'framer-motion';
import { cn } from '../../utils/cn';
import { highlightText } from '../../utils/highlight';
import { useStore } from '../../store';
import type { TaskItem } from '../../types';

interface TaskCheckboxProps {
  task: TaskItem;
  cardSlug: string;
  onToggle: (checked: boolean) => Promise<void>;
  onEdit?: (text: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  compact?: boolean;
  searchQuery?: string;
  isSearchMatch?: boolean;
}

export function TaskCheckbox({ task, cardSlug, onToggle, onEdit, onDelete, compact, searchQuery, isSearchMatch }: TaskCheckboxProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [scope, animate] = useAnimate();
  const { getTaskIndicator } = useStore();
  const previousIndicatorRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  // Reset edit text if task changes externally (e.g. WebSocket)
  useEffect(() => {
    if (!isEditing) {
      setEditText(task.text);
    }
  }, [task.text, isEditing]);

  const handleToggle = async () => {
    if (isUpdating || isEditing) return;
    setIsUpdating(true);
    try {
      await onToggle(!task.checked);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSave = async () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    if (trimmed === task.text) {
      setIsEditing(false);
      return;
    }
    if (!onEdit) return;
    setIsSaving(true);
    try {
      await onEdit(trimmed);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditText(task.text);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsSaving(true);
    try {
      await onDelete();
    } finally {
      setIsSaving(false);
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  // Flash animation on remote updates
  useEffect(() => {
    const indicator = getTaskIndicator(cardSlug, task.index);

    if (indicator && indicator.id !== previousIndicatorRef.current) {
      previousIndicatorRef.current = indicator.id;

      const runAnimation = async () => {
        await animate(
          scope.current,
          {
            backgroundColor: ['rgba(34, 197, 94, 0)', 'rgba(34, 197, 94, 0.2)', 'rgba(34, 197, 94, 0)'],
          },
          { duration: 0.3, ease: 'easeOut' }
        );
        animate(
          scope.current,
          { scale: [1, 1.02, 1] },
          { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }
        );
      };

      runAnimation();
    } else if (!indicator) {
      previousIndicatorRef.current = null;
    }
  }, [animate, cardSlug, getTaskIndicator, scope, task.index]);

  return (
    <motion.div
      ref={scope}
      className={cn(
        'flex items-start gap-2 rounded px-2 -mx-2',
        compact ? 'py-0.5' : 'py-1',
        (isUpdating || isSaving) && 'opacity-60',
        !isEditing && 'group'
      )}
    >
      <input
        type="checkbox"
        checked={task.checked}
        onChange={handleToggle}
        disabled={isUpdating || isEditing || isSaving}
        className={cn('mt-0.5 flex-shrink-0', isEditing && 'opacity-40')}
      />

      {isEditing ? (
        <div className="flex-1 flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          />
          <div className="flex items-center gap-2">
            {onDelete && (
              <button
                onClick={handleDelete}
                disabled={isSaving}
                title="Delete task"
                className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded disabled:opacity-40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !editText.trim()}
              className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-40 transition-colors"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <span
          onClick={onEdit ? () => { setEditText(task.text); setIsEditing(true); } : undefined}
          title={onEdit ? 'Click to edit' : undefined}
          className={cn(
            'flex-1 transition-colors duration-150 rounded',
            onEdit ? 'cursor-text' : 'cursor-default',
            task.checked
              ? 'text-gray-500 line-through'
              : 'text-gray-200 group-hover:text-gray-100',
            compact ? 'text-xs' : 'text-sm',
            isSearchMatch && 'font-medium',
            !task.checked && 'hover:text-white',
          )}
        >
          {searchQuery ? highlightText(task.text, searchQuery) : task.text}
        </span>
      )}
    </motion.div>
  );
}
