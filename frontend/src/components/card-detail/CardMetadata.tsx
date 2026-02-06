import { Badge, AssigneeBadge, PriorityBadge } from '../ui/Badge';
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

      {/* Tags */}
      {frontmatter.tags && frontmatter.tags.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {frontmatter.tags.map((tag) => (
              <Badge key={tag} variant="secondary" size="md">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

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
