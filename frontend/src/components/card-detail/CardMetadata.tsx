import { useState, useRef, useEffect } from 'react';
import { Badge, AssigneeBadge, PriorityBadge } from '../ui/Badge';
import { TagInput } from '../ui/TagInput';
import { useStore } from '../../store';
import type { Card } from '../../types';

interface CardMetadataProps {
  card: Card;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Priority selector component
function PrioritySelector({
  currentPriority,
  onSelect,
}: {
  currentPriority: 'low' | 'medium' | 'high' | null;
  onSelect: (priority: 'low' | 'medium' | 'high' | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (priority: 'low' | 'medium' | 'high' | null) => {
    onSelect(priority);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {currentPriority ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="hover:opacity-80 transition-opacity"
        >
          <PriorityBadge priority={currentPriority} size="md" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 border border-dashed border-gray-700 hover:border-gray-500 transition-colors"
        >
          Set priority
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg py-1 min-w-[120px]">
          <button
            onClick={() => handleSelect('high')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <PriorityBadge priority="high" size="sm" />
            <span className="text-gray-300">High</span>
          </button>
          <button
            onClick={() => handleSelect('medium')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <PriorityBadge priority="medium" size="sm" />
            <span className="text-gray-300">Medium</span>
          </button>
          <button
            onClick={() => handleSelect('low')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <PriorityBadge priority="low" size="sm" />
            <span className="text-gray-300">Low</span>
          </button>
          {currentPriority && (
            <>
              <div className="border-t border-gray-700 my-1" />
              <button
                onClick={() => handleSelect(null)}
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
              >
                Clear priority
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Assignee selector component
function AssigneeSelector({
  currentAssignee,
  onSelect,
}: {
  currentAssignee: 'user' | 'agent' | null;
  onSelect: (assignee: 'user' | 'agent' | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (assignee: 'user' | 'agent' | null) => {
    onSelect(assignee);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {currentAssignee ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="hover:opacity-80 transition-opacity"
        >
          <AssigneeBadge assignee={currentAssignee} size="md" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 border border-dashed border-gray-700 hover:border-gray-500 transition-colors"
        >
          Set assignee
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg py-1 min-w-[120px]">
          <button
            onClick={() => handleSelect('user')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <AssigneeBadge assignee="user" size="sm" />
            <span className="text-gray-300">User</span>
          </button>
          <button
            onClick={() => handleSelect('agent')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <AssigneeBadge assignee="agent" size="sm" />
            <span className="text-gray-300">Agent</span>
          </button>
          {currentAssignee && (
            <>
              <div className="border-t border-gray-700 my-1" />
              <button
                onClick={() => handleSelect(null)}
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
              >
                Clear assignee
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CardMetadata({ card }: CardMetadataProps) {
  const { frontmatter } = card;
  const { updateCard, projectTags, loadProjectTags, activeProjectSlug } = useStore();

  // Load project tags for autocomplete
  useEffect(() => {
    loadProjectTags();
  }, [activeProjectSlug, loadProjectTags]);

  const handleAddTag = async (tag: string) => {
    const currentTags = frontmatter.tags || [];
    if (!currentTags.includes(tag)) {
      await updateCard(card.slug, { tags: [...currentTags, tag] });
    }
  };

  const handleRemoveTag = async (tag: string) => {
    const currentTags = frontmatter.tags || [];
    await updateCard(card.slug, { tags: currentTags.filter(t => t !== tag) });
  };

  return (
    <div className="space-y-4">
      {/* Priority and Status row */}
      <div className="flex flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Priority</p>
          <PrioritySelector
            currentPriority={frontmatter.priority || null}
            onSelect={async (priority) => {
              await updateCard(card.slug, { priority });
            }}
          />
        </div>
        {frontmatter.status && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <Badge variant="default" size="md">
              {frontmatter.status}
            </Badge>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-500 mb-1">Assignee</p>
          <AssigneeSelector
            currentAssignee={frontmatter.assignee || null}
            onSelect={async (assignee) => {
              await updateCard(card.slug, { assignee });
            }}
          />
        </div>
      </div>

      {/* Tags - now editable */}
      <div>
        <p className="text-xs text-gray-500 mb-1">Tags</p>
        <TagInput
          tags={frontmatter.tags || []}
          availableTags={projectTags}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
        />
      </div>

      {/* Dates */}
      <div className="flex gap-6 text-sm">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Created</p>
          <p className="text-gray-300">{formatDate(frontmatter.created)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Updated</p>
          <p className="text-gray-300">{formatDate(frontmatter.updated)}</p>
        </div>
      </div>
    </div>
  );
}
