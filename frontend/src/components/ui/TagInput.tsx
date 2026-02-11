import { useState, useRef, useEffect } from 'react';
import { Badge } from './Badge';

interface TagInputProps {
  tags: string[];
  availableTags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}

export function TagInput({ tags, availableTags, onAddTag, onRemoveTag }: TagInputProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter available tags: exclude already-applied tags, match search text
  const filteredTags = availableTags
    .filter(tag => !tags.includes(tag))
    .filter(tag => tag.toLowerCase().includes(searchText.toLowerCase()));

  const showCreateOption = searchText.trim().length > 0
    && !availableTags.some(t => t.toLowerCase() === searchText.toLowerCase());

  // Focus input when entering add mode
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsAdding(false);
        setSearchText('');
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectTag = (tag: string) => {
    onAddTag(tag);
    setSearchText('');
    setIsDropdownOpen(false);
    // Keep the input open for adding more tags
    inputRef.current?.focus();
  };

  const handleCreateTag = () => {
    const newTag = searchText.trim().toLowerCase();
    if (newTag) {
      onAddTag(newTag);
      setSearchText('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchText.trim()) {
      e.preventDefault();
      if (filteredTags.length > 0) {
        handleSelectTag(filteredTags[0]);
      } else if (showCreateOption) {
        handleCreateTag();
      }
    }
    if (e.key === 'Escape') {
      setIsAdding(false);
      setSearchText('');
      setIsDropdownOpen(false);
    }
  };

  return (
    <div ref={containerRef}>
      {/* Existing tags */}
      <div className="flex flex-wrap gap-1.5 mb-1">
        {tags.map(tag => (
          <Badge key={tag} variant="secondary" size="md">
            <span className="flex items-center gap-1">
              {tag}
              <button
                onClick={() => onRemoveTag(tag)}
                className="ml-0.5 hover:text-red-400 transition-colors"
                aria-label={`Remove tag ${tag}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          </Badge>
        ))}

        {/* Add tag button */}
        {!isAdding && (
          <button
            onClick={() => {
              setIsAdding(true);
              setIsDropdownOpen(true);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 border border-dashed border-gray-700 hover:border-gray-500 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add tag
          </button>
        )}
      </div>

      {/* Search input + dropdown */}
      {isAdding && (
        <div className="relative mt-2">
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search or create tag..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          {/* Dropdown */}
          {isDropdownOpen && (filteredTags.length > 0 || showCreateOption) && (
            <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => handleSelectTag(tag)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {tag}
                </button>
              ))}
              {showCreateOption && (
                <button
                  onClick={handleCreateTag}
                  className="w-full text-left px-3 py-1.5 text-sm text-blue-400 hover:bg-gray-700 transition-colors border-t border-gray-700"
                >
                  Create "{searchText.trim()}"
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
