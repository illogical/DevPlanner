import { useEffect } from 'react';
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
        {frontmatter.priority && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Priority</p>
            <PriorityBadge priority={frontmatter.priority} size="md" />
          </div>
        )}
        {frontmatter.status && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <Badge variant="default" size="md">
              {frontmatter.status}
            </Badge>
          </div>
        )}
        {frontmatter.assignee && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Assignee</p>
            <AssigneeBadge assignee={frontmatter.assignee} size="md" />
          </div>
        )}
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
