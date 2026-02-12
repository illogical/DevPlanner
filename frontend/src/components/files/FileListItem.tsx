import { useState, useRef, useEffect } from 'react';
import type { ProjectFileEntry } from '../../types';
import { useStore } from '../../store';
import { cn } from '../../utils/cn';
import { formatFileSize, getFileIconClass, getFileExtension } from '../../utils/file';
import { filesApi } from '../../api/client';

interface FileListItemProps {
  file: ProjectFileEntry;
  onDisassociate?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
}

export function FileListItem({
  file,
  onDisassociate,
  onDelete,
  showActions = true,
}: FileListItemProps) {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [description, setDescription] = useState(file.description || '');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const { 
    updateFileDescription,
    activeProjectSlug
  } = useStore();

  useEffect(() => {
    setDescription(file.description || '');
  }, [file.description]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveDescription = async () => {
    if (description !== file.description) {
      try {
        await updateFileDescription(file.filename, description);
      } catch (error) {
        // Error already handled in store
        setDescription(file.description || '');
      }
    }
    setIsEditingDescription(false);
  };

  const handleDownload = () => {
    if (!activeProjectSlug) return;
    const url = filesApi.getDownloadUrl(activeProjectSlug, file.filename);
    window.open(url, '_blank');
  };

  const extension = getFileExtension(file.filename).toUpperCase();
  const iconColorClass = getFileIconClass(file.mimeType);

  return (
    <div className="group relative bg-gray-800 hover:bg-gray-750 rounded-lg p-3 transition-colors border border-gray-700/50 hover:border-gray-600">
      <div className="flex items-start gap-3">
        {/* File Icon */}
        <div 
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center bg-gray-900/50 flex-shrink-0 cursor-pointer",
            iconColorClass
          )}
          onClick={handleDownload}
          title="Download file"
        >
          <div className="flex flex-col items-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {extension && (
              <span className="text-[9px] font-bold uppercase mt-[-2px]">{extension}</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <h3 
              className="text-sm font-medium text-gray-200 truncate pr-6 cursor-pointer hover:text-blue-400 transition-colors"
              title={file.filename}
              onClick={handleDownload}
            >
              {file.filename}
            </h3>
            
            {showActions && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className={cn(
                    "p-1 rounded hover:bg-gray-700 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity",
                    isMenuOpen && "opacity-100 bg-gray-700 text-gray-200"
                  )}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 top-6 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 py-1 text-sm">
                    <button
                      onClick={() => {
                        setIsEditingDescription(true);
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700 hover:text-white"
                    >
                      Edit description
                    </button>
                    {onDisassociate && (
                      <button
                        onClick={() => {
                          onDisassociate();
                          setIsMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700 hover:text-white"
                      >
                        Remove from card
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => {
                          onDelete();
                          setIsMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-red-400 hover:bg-gray-700 hover:text-red-300"
                      >
                        Delete file
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {file.originalName !== file.filename && (
            <p className="text-xs text-gray-500 truncate" title={`Stored as: ${file.filename}`}>
              Original: {file.originalName}
            </p>
          )}

          {isEditingDescription ? (
            <div className="mt-2">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                rows={2}
                placeholder="Add a description..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveDescription();
                  }
                  if (e.key === 'Escape') {
                    setIsEditingDescription(false);
                    setDescription(file.description || '');
                  }
                }}
              />
              <div className="flex justify-end gap-2 mt-1">
                <button
                  onClick={() => {
                    setIsEditingDescription(false);
                    setDescription(file.description || '');
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDescription}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            description ? (
              <p className="mt-1 text-xs text-gray-400 line-clamp-2" title={description}>
                {description}
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-600 italic">No description</p>
            )
          )}
          
          <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
            <span>{formatFileSize(file.size)}</span>
            <span>•</span>
            <span title={`${file.cardSlugs.length} cards associated`}>
              {file.cardSlugs.length} {file.cardSlugs.length === 1 ? 'card' : 'cards'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
