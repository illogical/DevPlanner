import { cn } from '../../utils/cn';

interface FileBreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
  filename?: string | null;
  onFilenameClick?: () => void;
  gitNode?: React.ReactNode;
}

export function FileBreadcrumb({ path, onNavigate, filename, onFilenameClick, gitNode }: FileBreadcrumbProps) {
  if (!path && !filename) {
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
                i === segments.length - 1 && !filename
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
      {filename && (
        <span className="flex items-center gap-1">
          {segments.length > 0 && <span className="text-gray-600">/</span>}
          {gitNode && gitNode}
          <button
            className={cn(
              'text-sm cursor-pointer',
              'text-blue-300 hover:text-blue-200 font-medium truncate max-w-xl'
            )}
            onClick={onFilenameClick}
            title={filename}
          >
            {filename}
          </button>
        </span>
      )}
    </div>
  );
}
