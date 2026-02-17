import { useState, useRef, useEffect } from 'react';
import { IconButton } from '../ui/IconButton';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useStore } from '../../store';
import type { Card } from '../../types';

interface CardDetailHeaderProps {
  card: Card;
  onClose: () => void;
}

// Map lane slugs to display-friendly names
const laneDisplayNames: Record<string, string> = {
  '01-upcoming': 'Upcoming',
  '02-in-progress': 'In Progress',
  '03-complete': 'Complete',
  '04-archive': 'Archive',
};

export function CardDetailHeader({ card, onClose }: CardDetailHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(card.frontmatter.title);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { updateCard, archiveCard, deleteCard, closeCardDetail } = useStore();
  const activeProjectSlug = useStore(state => state.activeProjectSlug);
  const projectPrefix = useStore(
    state => state.projects.find(p => p.slug === activeProjectSlug)?.prefix
  );

  const cardId = (projectPrefix && card.frontmatter.cardNumber)
    ? `${projectPrefix}-${card.frontmatter.cardNumber}`
    : null;

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  // Reset edit state when card changes
  useEffect(() => {
    setEditTitle(card.frontmatter.title);
    setIsEditingTitle(false);
  }, [card.slug, card.frontmatter.title]);

  const handleStartEditing = () => {
    setEditTitle(card.frontmatter.title);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === card.frontmatter.title) {
      setIsEditingTitle(false);
      setEditTitle(card.frontmatter.title);
      return;
    }

    setIsSaving(true);
    try {
      await updateCard(card.slug, { title: trimmed });
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Failed to update title:', error);
      setEditTitle(card.frontmatter.title);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditTitle(card.frontmatter.title);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const isInArchive = card.lane === '04-archive';

  const handleDeleteClick = () => {
    if (isInArchive) {
      // Show confirmation for permanent delete
      setShowDeleteModal(true);
    } else {
      // Archive immediately without confirmation
      handleArchive();
    }
  };

  const handleArchive = async () => {
    try {
      await archiveCard(card.slug);
      closeCardDetail();
    } catch (error) {
      console.error('Failed to archive card:', error);
    }
  };

  const handlePermanentDelete = async () => {
    try {
      await deleteCard(card.slug);
      closeCardDetail();
    } catch (error) {
      console.error('Failed to delete card:', error);
    }
  };

  return (
    <>
      <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {cardId && (
              <span className="text-sm text-gray-500 font-mono">{cardId}</span>
            )}
            {isEditingTitle ? (
              <input
                ref={inputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSaveTitle}
                disabled={isSaving}
                className="w-full text-xl font-semibold text-gray-100 bg-gray-800 border border-blue-500 rounded px-2 py-1 mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <h2
                onClick={handleStartEditing}
                className="text-xl font-semibold text-gray-100 mb-1 cursor-pointer hover:text-blue-400 transition-colors"
                title="Click to edit title"
              >
                {card.frontmatter.title}
              </h2>
            )}
            <p className="text-sm text-gray-500">
              {laneDisplayNames[card.lane] || card.lane}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Delete button */}
            <IconButton
              label={isInArchive ? "Delete card permanently" : "Archive card"}
              onClick={handleDeleteClick}
              className="text-gray-500 hover:text-red-400"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </IconButton>

            {/* Close button */}
            <IconButton label="Close panel" onClick={onClose}>
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </IconButton>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal - only shown for permanent delete */}
      {showDeleteModal && isInArchive && (
        <ConfirmModal
          title="Permanently Delete Card?"
          message={`Are you sure you want to permanently delete "${card.frontmatter.title}"? This action cannot be undone.`}
          confirmLabel="Delete Permanently"
          confirmVariant="danger"
          onConfirm={handlePermanentDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}
