import type { KeyboardEvent } from 'react';
import { cn } from '../../utils/cn';

interface EditorPaneProps {
  content: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  onSave?: () => void;
  className?: string;
}

export function EditorPane({ content, onChange, readOnly, onSave, className }: EditorPaneProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab key: insert 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = content.slice(0, start) + '  ' + content.slice(end);
      onChange(newValue);
      // Restore cursor position after React re-renders
      requestAnimationFrame(() => {
        textarea.selectionStart = start + 2;
        textarea.selectionEnd = start + 2;
      });
    }

    // Ctrl+S / Cmd+S: save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSave?.();
    }
  };

  return (
    <textarea
      className={cn(
        'flex-1 w-full bg-[#15232D] text-gray-300 font-mono text-sm',
        'p-4 resize-none outline-none overflow-y-auto leading-relaxed',
        'border-r border-gray-700',
        className
      )}
      value={content}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      readOnly={readOnly}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
    />
  );
}
