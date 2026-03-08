import { cn } from '../../utils/cn';

interface FrontmatterDisplayProps {
  frontmatter: Record<string, unknown>;
}

export function FrontmatterDisplay({ frontmatter }: FrontmatterDisplayProps) {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) return null;

  return (
    <div
      className="rounded-md p-4 mb-8 text-sm"
      style={{
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(155, 220, 254, 0.12)',
      }}
    >
      <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <span
              className={cn('font-mono font-medium')}
              style={{ color: '#9cdcfe' }}
            >
              {key}
            </span>
            <span style={{ color: '#ce9178' }}>
              {Array.isArray(value)
                ? value.join(', ')
                : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
