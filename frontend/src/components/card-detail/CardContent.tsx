import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { marked } from 'marked';
import { useStore } from '../../store';

interface CardContentProps {
  content: string;
  cardSlug: string;
}

export const CardContent = memo(function CardContent({ content, cardSlug }: CardContentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { updateCard } = useStore();

  // Extract description (without ## Tasks section) for both display and editing
  const tasksMatch = content.match(/(## Tasks[\s\S]*$)/);
  const tasksSection = tasksMatch ? tasksMatch[1] : '';
  const descriptionOnly = content
    .replace(/## Tasks[\s\S]*?(?=##|$)/g, '')
    .replace(/^\s*-\s*\[[\sx]\]\s+.*/gm, '')
    .trim();

  const html = useMemo(() => {
    marked.setOptions({ breaks: true, gfm: true });
    if (!descriptionOnly) return '';
    return marked.parse(descriptionOnly);
  }, [descriptionOnly]);

  const handleStartEditing = () => {
    setEditContent(descriptionOnly);
    setIsEditing(true);
  };

  // Auto-focus and auto-resize textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [isEditing]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Re-combine description with tasks section
      const newContent = editContent.trim() + (tasksSection ? '\n\n' + tasksSection : '');
      await updateCard(cardSlug, { content: newContent });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save description:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleTextareaInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  return (
    <div className="border-t border-gray-700 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-400">Description</h3>
        {!isEditing && (
          <button
            onClick={handleStartEditing}
            className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Edit description"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleTextareaInput}
            placeholder="Enter description (markdown supported)..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none min-h-[100px] font-mono"
            disabled={isSaving}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Markdown supported</span>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : html ? (
        <div
          className="prose prose-invert prose-sm max-w-none
            prose-headings:text-gray-100 prose-headings:font-semibold
            prose-p:text-gray-300 prose-p:leading-relaxed
            prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
            prose-code:text-blue-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700
            prose-ul:text-gray-300 prose-ol:text-gray-300
            prose-li:marker:text-gray-500
            prose-blockquote:border-gray-600 prose-blockquote:text-gray-400
            prose-hr:border-gray-700"
          dangerouslySetInnerHTML={{ __html: html as string }}
        />
      ) : (
        <button
          onClick={handleStartEditing}
          className="text-sm text-gray-600 italic hover:text-gray-400 transition-colors cursor-pointer"
        >
          Click to add a description...
        </button>
      )}
    </div>
  );
});
