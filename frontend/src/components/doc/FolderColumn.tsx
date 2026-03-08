import { cn } from '../../utils/cn';
import type { TreeFolder } from '../../store/types';

interface FolderColumnProps {
  folders: TreeFolder[];
  activePath: string;
  onSelect: (folder: TreeFolder) => void;
}

export function FolderColumn({ folders, activePath, onSelect }: FolderColumnProps) {
  if (folders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        No folders
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {folders.map((folder) => {
        const isActive = folder.path === activePath;
        return (
          <button
            key={folder.path}
            onClick={() => onSelect(folder)}
            className={cn(
              'w-full text-left px-3 py-2 flex items-center justify-between cursor-pointer transition-colors',
              isActive
                ? 'bg-gray-800 border-l-2 border-blue-500 text-gray-100'
                : 'text-gray-300 hover:bg-gray-800 border-l-2 border-transparent'
            )}
          >
            <span className="text-sm truncate">{folder.name || '/'}</span>
            {folder.count > 0 && (
              <span className="text-xs text-gray-500 bg-gray-700 rounded px-1.5 py-0.5 shrink-0 ml-2">
                {folder.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
