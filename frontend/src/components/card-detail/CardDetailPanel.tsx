import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { CardDetailHeader } from './CardDetailHeader';
import { CardMetadata } from './CardMetadata';
import { CardContent } from './CardContent';
import { TaskList } from './TaskList';
import { Spinner } from '../ui/Spinner';

export function CardDetailPanel() {
  const {
    activeCard,
    activeProjectSlug,
    isDetailPanelOpen,
    isLoadingCardDetail,
    closeCardDetail,
  } = useStore();

  console.log(`[CardDetailPanel] RENDER:`, {
    slug: activeCard?.slug,
    taskCount: activeCard?.tasks?.length,
    tasks: activeCard?.tasks,
  });

  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDetailPanelOpen) {
        closeCardDetail();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isDetailPanelOpen, closeCardDetail]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isDetailPanelOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isDetailPanelOpen]);

  return (
    <AnimatePresence>
      {isDetailPanelOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeCardDetail}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            className="fixed right-0 top-0 h-full w-full md:max-w-2xl lg:max-w-lg bg-gray-900 border-l border-gray-700 z-50 overflow-y-auto shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {isLoadingCardDetail ? (
              <div className="h-full flex items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : activeCard && activeProjectSlug ? (
              <>
                <CardDetailHeader card={activeCard} onClose={closeCardDetail} />
                <div className="p-6 space-y-6">
                  <CardMetadata card={activeCard} />

                  <CardContent content={activeCard.content} cardSlug={activeCard.slug} />

                  <TaskList
                    tasks={activeCard.tasks}
                    cardSlug={activeCard.slug}
                  />

                  {/* Attachments section - moved to bottom */}
                  <div className="border-t border-gray-700 pt-4">
                    <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                        />
                      </svg>
                      Attachments
                    </h3>
                    <p className="text-sm text-gray-600 italic">
                      Coming soon...
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
