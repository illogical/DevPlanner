import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../store';
import { cardsApi } from '../../api/client';
import { cn } from '../../utils/cn';
import { Badge, AssigneeBadge } from '../ui/Badge';
import { TaskProgressBar } from '../tasks/TaskProgressBar';
import type { CardSummary, Card, CardLink } from '../../types';

// Module-level cache so full card data isn't re-fetched within the same session
const cardCache = new Map<string, Card>();

function getPriorityBorderClass(priority?: 'low' | 'medium' | 'high'): string {
  switch (priority) {
    case 'high': return 'border-l-[3px] border-l-red-500';
    case 'medium': return 'border-l-[3px] border-l-amber-500';
    case 'low': return 'border-l-[3px] border-l-green-500';
    default: return 'border-l-[3px] border-l-transparent';
  }
}

const LINK_KIND_ICONS: Record<CardLink['kind'], string> = {
  doc: '📄',
  spec: '📐',
  ticket: '🎫',
  repo: '📦',
  reference: '🔗',
  other: '🌐',
};

interface ExpandedCardItemProps {
  card: CardSummary;
  projectSlug: string;
  index: number;
}

export function ExpandedCardItem({ card, projectSlug, index }: ExpandedCardItemProps) {
  const { openCardDetail, toggleTask, projects } = useStore();
  const [fullCard, setFullCard] = useState<Card | null>(cardCache.get(card.slug) ?? null);

  const projectPrefix = projects.find((p) => p.slug === projectSlug)?.prefix;
  const cardId = projectPrefix && card.frontmatter.cardNumber
    ? `${projectPrefix}-${card.frontmatter.cardNumber}`
    : null;

  const hasTasks = card.taskProgress.total > 0;
  const tasks = fullCard?.tasks ?? [];
  const description = card.frontmatter.description;
  const links = card.frontmatter.links ?? [];

  // Fetch full card data on mount if not cached
  useEffect(() => {
    if (cardCache.has(card.slug)) return;
    cardsApi.get(projectSlug, card.slug).then((data) => {
      cardCache.set(card.slug, data);
      setFullCard(data);
    }).catch(() => {/* ignore, tasks just won't show text */});
  }, [card.slug, projectSlug]);

  // Update local state if cache is populated
  useEffect(() => {
    const cached = cardCache.get(card.slug);
    if (cached && !fullCard) setFullCard(cached);
  });

  const handleToggleTask = async (taskIndex: number, checked: boolean) => {
    await toggleTask(card.slug, taskIndex, checked);
    // Invalidate cache so next focus shows fresh state
    cardCache.delete(card.slug);
  };

  const formattedDate = card.frontmatter.created
    ? new Date(card.frontmatter.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 200, delay: index * 0.03 }}
      onClick={() => openCardDetail(card.slug)}
      className={cn(
        'group relative rounded-lg border border-gray-700/40 cursor-pointer',
        'bg-gray-800/80 hover:bg-gray-800 hover:border-gray-600/60',
        'transition-colors duration-150',
        getPriorityBorderClass(card.frontmatter.priority),
        card.frontmatter.status === 'blocked' && 'border-l-red-500/80',
      )}
    >
      <div className="flex min-h-[80px]">

        {/* ── Left column: Identity ────────────────────────────── */}
        <div className="flex flex-col gap-2 p-3 pr-4" style={{ flex: '0 0 36%', minWidth: 0 }}>
          {/* Card ID + Title */}
          <div>
            {cardId && (
              <span className="font-mono text-xs text-gray-500 mr-1.5">{cardId}</span>
            )}
            <h3 className="text-sm font-semibold text-gray-100 leading-snug">
              {card.frontmatter.title}
            </h3>
          </div>

          {/* Description */}
          {description && (
            <p className="text-xs italic text-gray-500 line-clamp-3 leading-relaxed">
              {description}
            </p>
          )}

          {/* Footer: date */}
          {formattedDate && (
            <div className="mt-auto pt-1">
              <span className="text-xs text-gray-600">{formattedDate}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-700/30 my-3" />

        {/* ── Center column: Tasks ─────────────────────────────── */}
        <div className="flex flex-col p-3 overflow-y-auto" style={{ flex: '0 0 36%', minWidth: 0, maxHeight: 200 }}>
          {hasTasks ? (
            tasks.length > 0 ? (
              <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                {tasks.map((task) => (
                  <label
                    key={task.index}
                    className="flex items-start gap-2 cursor-pointer group/task"
                  >
                    <input
                      type="checkbox"
                      checked={task.checked}
                      onChange={(e) => handleToggleTask(task.index, e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className={cn(
                      'text-xs leading-snug transition-colors',
                      task.checked
                        ? 'text-gray-600 line-through'
                        : 'text-gray-300 group-hover/task:text-gray-200'
                    )}>
                      {task.text}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              // Skeleton while loading
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: card.taskProgress.total }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={cn(
                      'h-3.5 w-3.5 flex-shrink-0 rounded border',
                      i < card.taskProgress.checked ? 'bg-gray-600 border-gray-600' : 'bg-gray-750 border-gray-700'
                    )} />
                    <div className="h-2.5 rounded bg-gray-700 animate-pulse" style={{ width: `${50 + (i * 17) % 40}%` }} />
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="text-xs text-gray-600 italic">No tasks</p>
          )}
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-700/30 my-3" />

        {/* ── Right column: Context ────────────────────────────── */}
        <div className="flex flex-col p-3 gap-3" style={{ flex: '0 0 28%', minWidth: 0 }}>
          {/* Progress bar */}
          {hasTasks && (
            <div className="flex items-center gap-2">
              <TaskProgressBar
                checked={card.taskProgress.checked}
                total={card.taskProgress.total}
                size="sm"
                className="flex-1"
              />
              <span className={cn(
                'text-xs font-bold tabular-nums',
                card.taskProgress.checked > 0 ? 'text-gray-300' : 'text-gray-600'
              )}>
                {card.taskProgress.checked}/{card.taskProgress.total}
              </span>
            </div>
          )}

          {/* Tags */}
          {card.frontmatter.tags && card.frontmatter.tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {card.frontmatter.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" size="sm">{tag}</Badge>
              ))}
              {card.frontmatter.tags.length > 3 && (
                <span className="text-xs text-gray-600">+{card.frontmatter.tags.length - 3}</span>
              )}
            </div>
          )}

          {/* Links */}
          {links.length > 0 && (
            <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
              {links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors truncate group/link"
                  title={link.url}
                >
                  <span className="flex-shrink-0 text-[11px]">{LINK_KIND_ICONS[link.kind]}</span>
                  <span className="truncate group-hover/link:underline">{link.label}</span>
                </a>
              ))}
            </div>
          )}

          {/* Status + Assignee — pushed to bottom */}
          <div className="flex items-center gap-2 flex-wrap mt-auto">
            {card.frontmatter.status && (
              <span className={cn(
                'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium',
                card.frontmatter.status === 'blocked'
                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                  : card.frontmatter.status === 'review'
                  ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                  : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
              )}>
                {card.frontmatter.status}
              </span>
            )}
            {card.frontmatter.assignee && (
              <AssigneeBadge assignee={card.frontmatter.assignee} />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
