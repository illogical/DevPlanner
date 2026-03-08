import { cn } from '../../utils/cn';

interface FrontmatterDisplayProps {
  frontmatter: Record<string, unknown>;
}

export function FrontmatterDisplay({ frontmatter }: FrontmatterDisplayProps) {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) return null;

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded p-4 mb-6">
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <span className="text-cyan-400 font-mono text-sm">{key}</span>
            <span className={cn('text-sm', 'text-[#ce9178]')}>
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
