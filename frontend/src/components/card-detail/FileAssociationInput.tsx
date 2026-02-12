import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { cn } from '../../utils/cn';
import { formatFileSize, getFileIconClass, getFileExtension } from '../../utils/file';

interface FileAssociationInputProps {
  cardSlug: string;
}

export function FileAssociationInput({ cardSlug }: FileAssociationInputProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { projectFiles, associateFile } = useStore();

  // Get files already associated with this card
  const cardFiles = projectFiles.filter(f => f.cardSlugs.includes(cardSlug));
  const cardFileNames = new Set(cardFiles.map(f => f.filename));

  // Filter available files: exclude already-associated, match search text
  const availableFiles = projectFiles
    .filter(f => !cardFileNames.has(f.filename))
    .filter(f => {
      if (!searchText) return true;
      const query = searchText.toLowerCase();
      return (
        f.filename.toLowerCase().includes(query) ||
        f.description?.toLowerCase().includes(query)
      );
    });

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

  const handleSelectFile = async (filename: string) => {
    await associateFile(filename, cardSlug);
    setSearchText('');
    setIsDropdownOpen(false);
    // Keep input open for adding more files
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchText.trim()) {
      e.preventDefault();
      if (availableFiles.length > 0) {
        handleSelectFile(availableFiles[0].filename);
      }
    }
    if (e.key === 'Escape') {
      setIsAdding(false);
      setSearchText('');
      setIsDropdownOpen(false);
    }
  };

  // Don't show if no available files
  if (projectFiles.length === 0 || (availableFiles.length === 0 && !isAdding)) {
    return null;
  }

  return (
    <div ref={containerRef} className="mt-3 pt-3 border-t border-gray-700">
      {!isAdding ? (
        <button
          onClick={() => {
            setIsAdding(true);
            setIsDropdownOpen(true);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 border border-dashed border-gray-700 hover:border-gray-500 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add existing file
        </button>
      ) : (
        <div className="relative">
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
            placeholder="Search files..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          {/* Dropdown */}
          {isDropdownOpen && availableFiles.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {availableFiles.map(file => {
                const extension = getFileExtension(file.filename).toUpperCase();
                const iconColorClass = getFileIconClass(file.mimeType);

                return (
                  <button
                    key={file.filename}
                    onClick={() => handleSelectFile(file.filename)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors border-b border-gray-700/50 last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      {/* File icon */}
                      <div className={cn("w-8 h-8 rounded flex items-center justify-center bg-gray-900/50 flex-shrink-0", iconColorClass)}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-200 truncate">{file.filename}</div>
                        <div className="text-xs text-gray-500">
                          {formatFileSize(file.size)}
                          {file.description && ` • ${file.description.substring(0, 40)}${file.description.length > 40 ? '...' : ''}`}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
