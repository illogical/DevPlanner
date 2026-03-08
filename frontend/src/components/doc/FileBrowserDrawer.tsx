import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { FileBrowserColumns } from './FileBrowserColumns';

export function FileBrowserDrawer() {
  const { fbIsOpen, closeFileBrowser, loadFileTree } = useStore();

  // Load file tree when drawer opens
  useEffect(() => {
    if (fbIsOpen) {
      loadFileTree();
    }
  }, [fbIsOpen, loadFileTree]);

  // Escape key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fbIsOpen) closeFileBrowser();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [fbIsOpen, closeFileBrowser]);

  return (
    <AnimatePresence>
      {fbIsOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: '40vh', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="border-t-2 border-amber-500 bg-gray-900 overflow-hidden shrink-0"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
            <span className="text-sm font-medium text-gray-300">File Browser</span>
            <button
              onClick={closeFileBrowser}
              className="text-gray-400 hover:text-gray-200 p-1 rounded transition-colors"
              aria-label="Close file browser"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="h-[calc(40vh-45px)]">
            <FileBrowserColumns />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
