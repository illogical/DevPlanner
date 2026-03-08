import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { FileBrowserColumns } from './FileBrowserColumns';
import { GitSettingsPanel } from './GitSettingsPanel';

export function FileBrowserDrawer() {
  const { fbIsOpen, closeFileBrowser, loadFileTree } = useStore();
  const [showGitSettings, setShowGitSettings] = useState(false);

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
          <div
            className="flex items-center justify-between px-4 py-2 border-b border-gray-800 cursor-pointer hover:bg-gray-800/50 transition-colors"
            onClick={closeFileBrowser}
          >
            <span className="text-sm font-medium text-gray-300">File Browser</span>

            <div className="flex items-center gap-2">
              <div className="relative flex items-center" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setShowGitSettings((v) => !v)}
                  title="Git settings"
                  className="text-gray-400 hover:text-gray-200 p-1 rounded transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 15.5A3.5 3.5 0 018.5 12 3.5 3.5 0 0112 8.5a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5m7.43-2.92c.04-.32.07-.64.07-.98s-.03-.66-.07-1l2.16-1.63c.19-.15.24-.42.12-.64l-2.05-3.55c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22L2.74 8.87c-.12.21-.08.49.12.64l2.15 1.63c-.05.34-.07.67-.07 1s.02.67.07 1l-2.15 1.63c-.19.15-.24.42-.12.64l2.05 3.55c.12.22.38.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2.05-3.55c.12-.22.07-.49-.12-.64l-2.15-1.63z" />
                  </svg>
                </button>
                {showGitSettings && (
                  <div className="absolute top-full right-0 mt-2 z-50 cursor-default">
                    <GitSettingsPanel onClose={() => setShowGitSettings(false)} />
                  </div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); closeFileBrowser(); }}
                className="text-gray-400 hover:text-gray-200 p-1 rounded transition-colors"
                aria-label="Close file browser"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="h-[calc(40vh-45px)]">
            <FileBrowserColumns />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
