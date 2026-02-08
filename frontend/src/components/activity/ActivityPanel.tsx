import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { ActivityLog } from './ActivityLog';
import { cn } from '../../utils/cn';

interface ActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ActivityPanel({ isOpen, onClose }: ActivityPanelProps) {
  const [activeTab, setActiveTab] = useState<'history' | 'future'>('history');

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
            }}
            className={cn(
              'fixed top-0 right-0 h-full z-50',
              'w-full md:w-[400px]',
              'bg-gray-900 border-l border-gray-700',
              'flex flex-col',
              'shadow-2xl'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-gray-100">
                Activity History
              </h2>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-gray-800 transition-colors"
                aria-label="Close activity panel"
              >
                <XMarkIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Tab Bar */}
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => setActiveTab('history')}
                className={cn(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                  activeTab === 'history'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-300'
                )}
              >
                History
              </button>
              <button
                onClick={() => setActiveTab('future')}
                className={cn(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                  activeTab === 'future'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-300'
                )}
                disabled
              >
                Notifications
                <span className="ml-2 text-xs text-gray-500">(Soon)</span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'history' && <ActivityLog />}
              {activeTab === 'future' && (
                <div className="p-4 text-center text-gray-500">
                  Coming soon...
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
