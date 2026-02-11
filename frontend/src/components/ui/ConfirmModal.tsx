import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './Button';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        />

        {/* Modal */}
        <motion.div
          className="relative bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-6 max-w-md w-full mx-4"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <h3 className="text-lg font-semibold text-gray-100 mb-2">
            {title}
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            {message}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button
              variant={confirmVariant}
              onClick={() => {
                onConfirm();
                onCancel();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
