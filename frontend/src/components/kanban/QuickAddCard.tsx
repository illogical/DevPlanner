import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { cn } from '../../utils/cn';

interface QuickAddCardProps {
  lane: string;
  onClose: () => void;
}

export function QuickAddCard({ lane, onClose }: QuickAddCardProps) {
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { createCard } = useStore();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isCreating) return;

    setIsCreating(true);
    try {
      await createCard(title.trim(), lane);
      setTitle('');
      onClose();
    } catch (error) {
      console.error('Failed to create card:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'rounded-lg border border-gray-700 border-dashed p-3',
        'bg-gray-800/50'
      )}
    >
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter card title..."
        disabled={isCreating}
        className={cn(
          'w-full bg-transparent border-none',
          'text-sm text-gray-100 placeholder-gray-500',
          'focus:outline-none',
          'disabled:opacity-50'
        )}
      />
      <div className="flex items-center justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isCreating}
          className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || isCreating}
          className={cn(
            'text-xs px-3 py-1 rounded',
            'bg-blue-600 text-white hover:bg-blue-500',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors duration-150'
          )}
        >
          {isCreating ? 'Adding...' : 'Add'}
        </button>
      </div>
    </form>
  );
}
