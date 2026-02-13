import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { CardDetailHeader } from './CardDetailHeader';
import { CardMetadata } from './CardMetadata';
import { CardContent } from './CardContent';
import { TaskList } from './TaskList';
import { CardFiles } from './CardFiles';
import { Spinner } from '../ui/Spinner';

export function CardDetailPanel() {
  // Use selective subscriptions to prevent unnecessary re-renders
  const activeCard = useStore((state) => state.activeCard);
  const activeProjectSlug = useStore((state) => state.activeProjectSlug);
  const isDetailPanelOpen = useStore((state) => state.isDetailPanelOpen);
  const isLoadingCardDetail = useStore((state) => state.isLoadingCardDetail);
  const closeCardDetail = useStore((state) => state.closeCardDetail);

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
                    <CardFiles cardSlug={activeCard.slug} />
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
