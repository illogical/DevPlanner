import { useState, useRef, useEffect } from 'react';
import { cn } from '../../utils/cn';

interface AddTaskInputProps {
  onAdd: (text: string) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
}

export function AddTaskInput({
  onAdd,
  placeholder = 'Add a task...',
  autoFocus = false,
}: AddTaskInputProps) {
  const [text, setText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isAdding) return;

    setIsAdding(true);
    try {
      await onAdd(text.trim());
      setText('');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        disabled={isAdding}
        className={cn(
          'flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5',
          'text-sm text-gray-100 placeholder-gray-500',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'disabled:opacity-50'
        )}
      />
      <button
        type="submit"
        disabled={!text.trim() || isAdding}
        className={cn(
          'p-1.5 rounded-md',
          'text-gray-400 hover:text-gray-100 hover:bg-gray-700',
          'transition-colors duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {isAdding ? (
          <svg
            className="w-4 h-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        )}
      </button>
    </form>
  );
}
