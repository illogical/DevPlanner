import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../../store';
import { FolderColumn } from './FolderColumn';
import { FileColumn } from './FileColumn';
import type { TreeFolder } from '../../store/types';

export function FileBrowserColumns() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    fbFolders,
    fbActivePath,
    docFilePath,
    gitStatuses,
    setFbActivePath,
  } = useStore();

  const getNavTarget = (filePath: string) => {
    if (location.pathname.startsWith('/editor')) return `/editor?path=${encodeURIComponent(filePath)}`;
    if (location.pathname.startsWith('/diff')) return `/diff?left=${encodeURIComponent(filePath)}`;
    return `/viewer?path=${encodeURIComponent(filePath)}`;
  };

  const isRootLevel = !fbActivePath || !fbActivePath.includes('/');

  const displayFolderPath = isRootLevel
    ? (fbActivePath || fbFolders[0]?.path || '')
    : fbActivePath.split('/').slice(0, -1).join('/');

  const subFolders = fbFolders.filter(f => f.parentPath === displayFolderPath);

  const activeFolderData = fbFolders.find((f) => f.path === fbActivePath);
  const files = activeFolderData?.files ?? [];

  const handleSubFolderSelect = (folder: TreeFolder) => {
    setFbActivePath(folder.path);
  };

  const handleFileSelect = (filePath: string) => {
    navigate(getNavTarget(filePath));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 grid grid-cols-2 overflow-hidden border-t border-gray-800">

        {/* Column 1: Subfolders */}
        <div className="border-r border-gray-800 overflow-hidden flex flex-col">
          {displayFolderPath && (
            <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2 shrink-0 bg-gray-800/20">
              <button
                onClick={() => setFbActivePath(displayFolderPath)}
                disabled={fbActivePath === displayFolderPath}
                className="text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors p-0.5 rounded shrink-0"
                title="Go up one folder"
                aria-label="Go up one folder"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div
                className="text-sm font-medium text-gray-300 truncate"
                title={displayFolderPath}
              >
                {displayFolderPath.split('/').pop()}
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto w-full">
            <FolderColumn
              folders={subFolders}
              activePath={fbActivePath}
              onSelect={handleSubFolderSelect}
            />
          </div>
        </div>

        {/* Column 2: Files */}
        <div className="overflow-hidden">
          <FileColumn
            files={files}
            currentFilePath={docFilePath}
            gitStatuses={gitStatuses}
            onSelect={handleFileSelect}
          />
        </div>
      </div>
    </div>
  );
}
