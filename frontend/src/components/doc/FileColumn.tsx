import { cn } from '../../utils/cn';
import { parseVaultFilename } from '../../utils/filename';
import { GitStatusDot } from './GitStatusDot';
import type { TreeFile } from '../../store/types';
import type { GitState } from '../../api/client';

interface FileColumnProps {
  files: TreeFile[];
  currentFilePath: string | null;
  gitStatuses: Record<string, GitState>;
  onSelect: (path: string) => void;
}

export function FileColumn({ files, currentFilePath, gitStatuses, onSelect }: FileColumnProps) {
  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        No files
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {files.map((file) => {
        const { title, stamp } = parseVaultFilename(file.name);
        const isCurrent = file.path === currentFilePath;
        const gitState = gitStatuses[file.path];

        return (
          <button
            key={file.path}
            onClick={() => onSelect(file.path)}
            className={cn(
              'w-full text-left px-3 py-2 cursor-pointer transition-colors border-l-2',
              isCurrent
                ? 'bg-gray-800/80 border-amber-500 text-gray-100'
                : 'border-transparent text-gray-300 hover:bg-gray-800/50'
            )}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className={cn("text-sm truncate", isCurrent && "text-amber-500 font-medium")}>{title}</div>
                {stamp && (
                  <div className="text-xs text-gray-500 mt-0.5">{stamp}</div>
                )}
              </div>
              {gitState && (
                <div className="mt-1 shrink-0">
                  <GitStatusDot state={gitState} />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
