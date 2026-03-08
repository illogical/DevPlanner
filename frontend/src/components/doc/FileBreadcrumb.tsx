import { cn } from '../../utils/cn';

interface FileBreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
}

export function FileBreadcrumb({ path, onNavigate }: FileBreadcrumbProps) {
  if (!path) {
    return <div className="h-6" />;
  }

  const segments = path.split('/').filter(Boolean);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        className="text-sm text-gray-400 hover:text-gray-200 cursor-pointer"
        onClick={() => onNavigate('')}
      >
        ~
      </button>
      {segments.map((seg, i) => {
        const segPath = segments.slice(0, i + 1).join('/');
        return (
          <span key={segPath} className="flex items-center gap-1">
            <span className="text-gray-600">/</span>
            <button
              className={cn(
                'text-sm cursor-pointer',
                i === segments.length - 1
                  ? 'text-gray-200'
                  : 'text-gray-400 hover:text-gray-200'
              )}
              onClick={() => onNavigate(segPath)}
            >
              {seg}
            </button>
          </span>
        );
      })}
    </div>
  );
}
