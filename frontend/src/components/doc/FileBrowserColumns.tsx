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

        {/* Column 1: Folder Tree */}
        <div className="border-r border-gray-800 overflow-hidden flex flex-col bg-gray-900/40">
          <div className="flex-1 overflow-y-auto w-full">
            <FolderColumn
              folders={fbFolders}
              activePath={fbActivePath}
              onSelect={handleSubFolderSelect}
            />
          </div>
        </div>

        {/* Column 2: Files */}
        <div className="overflow-hidden bg-gray-900/40">
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
