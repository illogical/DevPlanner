import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../../store';
import { FileListItem } from './FileListItem';
import { cn } from '../../utils/cn';
import { isTextFile } from '../../utils/file';

interface FilesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FilesPanel({ isOpen, onClose }: FilesPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'text' | 'unassociated'>('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    projectFiles,
    isLoadingFiles,
    uploadFile,
    deleteFile,
    loadProjectFiles,
    activeProjectSlug
  } = useStore();

  useEffect(() => {
    if (isOpen && activeProjectSlug) {
      loadProjectFiles();
    }
  }, [isOpen, activeProjectSlug, loadProjectFiles]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showDeleteConfirm]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      try {
        await uploadFile(e.target.files[0]);
      } catch (error) {
        // Error handled in store/UI
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const filteredFiles = projectFiles.filter(file => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = file.filename.toLowerCase().includes(q);
      const matchesDesc = file.description?.toLowerCase().includes(q);
      if (!matchesName && !matchesDesc) return false;
    }

    // Type filter
    if (filterMode === 'text' && !isTextFile(file.mimeType)) return false;
    if (filterMode === 'unassociated' && file.cardSlugs.length > 0) return false;

    return true;
  });

  const textCount = projectFiles.filter(f => isTextFile(f.mimeType)).length;
  const unassocCount = projectFiles.filter(f => f.cardSlugs.length === 0).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full md:w-[500px] bg-gray-900 border-l border-gray-800 z-50 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Project Files
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Toolbar */}
            <div className="p-4 space-y-4 border-b border-gray-800 bg-gray-900/50">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload File
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
              />

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div className="flex bg-gray-800 rounded-lg p-1 text-xs">
                <button
                  onClick={() => setFilterMode('all')}
                  className={cn(
                    "flex-1 py-1.5 rounded text-center transition-colors",
                    filterMode === 'all' 
                      ? "bg-gray-700 text-white font-medium" 
                      : "text-gray-400 hover:text-gray-200"
                  )}
                >
                  All ({projectFiles.length})
                </button>
                <button
                  onClick={() => setFilterMode('text')}
                  className={cn(
                    "flex-1 py-1.5 rounded text-center transition-colors",
                    filterMode === 'text' 
                      ? "bg-gray-700 text-white font-medium" 
                      : "text-gray-400 hover:text-gray-200"
                  )}
                >
                  Text ({textCount})
                </button>
                <button
                  onClick={() => setFilterMode('unassociated')}
                  className={cn(
                    "flex-1 py-1.5 rounded text-center transition-colors",
                    filterMode === 'unassociated' 
                      ? "bg-gray-700 text-white font-medium" 
                      : "text-gray-400 hover:text-gray-200"
                  )}
                >
                  Unassoc. ({unassocCount})
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isLoadingFiles && projectFiles.length === 0 ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No files match your filters</p>
                </div>
              ) : (
                filteredFiles.map(file => (
                  <FileListItem
                    key={file.filename}
                    file={file}
                    onDelete={() => setShowDeleteConfirm(file.filename)}
                  />
                ))
              )}
            </div>
          </motion.div>

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div 
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setShowDeleteConfirm(null)}
              />
              <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm relative shadow-xl border border-gray-700">
                <h3 className="text-lg font-bold text-white mb-2">Delete File?</h3>
                <p className="text-gray-300 text-sm mb-6">
                  Are you sure you want to permanently delete <span className="text-white font-medium">{showDeleteConfirm}</span>? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      deleteFile(showDeleteConfirm);
                      setShowDeleteConfirm(null);
                    }}
                    className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
