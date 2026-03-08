import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../../store';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FolderColumn } from './FolderColumn';
import { FileColumn } from './FileColumn';
import type { TreeFolder } from '../../store/types';

export function FileBrowserColumns() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    fbFolders,
    fbActiveRoot,
    fbActivePath,
    docFilePath,
    gitStatuses,
    setFbActiveRoot,
    setFbActivePath,
    closeFileBrowser,
  } = useStore();

  // Determine navigate target based on current route
  const getNavTarget = (filePath: string) => {
    if (location.pathname.startsWith('/editor')) return `/editor?path=${encodeURIComponent(filePath)}`;
    if (location.pathname.startsWith('/diff')) return `/diff?left=${encodeURIComponent(filePath)}`;
    return `/viewer?path=${encodeURIComponent(filePath)}`;
  };

  // Top-level folders (no parent)
  const rootFolders = fbFolders.filter((f) => f.parentPath === null || f.parentPath === '');

  // Subfolders of active root
  const subFolders = fbActiveRoot
    ? fbFolders.filter(
        (f) =>
          (f.parentPath === fbActiveRoot || f.parentPath?.startsWith(fbActiveRoot + '/')) &&
          f.parentPath === fbActiveRoot
      )
    : [];

  // Files in active path folder
  const activeFolderData = fbFolders.find((f) => f.path === fbActivePath);
  const files = activeFolderData?.files ?? [];

  const handleRootSelect = (folder: TreeFolder) => {
    setFbActiveRoot(folder.path);
    setFbActivePath(folder.path);
  };

  const handleSubFolderSelect = (folder: TreeFolder) => {
    setFbActivePath(folder.path);
  };

  const handleFileSelect = (filePath: string) => {
    navigate(getNavTarget(filePath));
    closeFileBrowser();
  };

  const handleBreadcrumbNavigate = (path: string) => {
    if (!path) {
      setFbActiveRoot(null);
      setFbActivePath('');
    } else {
      setFbActivePath(path);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-gray-800">
        <FileBreadcrumb
          path={fbActivePath}
          onNavigate={handleBreadcrumbNavigate}
        />
      </div>

      <div className="flex-1 grid grid-cols-3 overflow-hidden border-t border-gray-800">
        {/* Column 1: Root folders */}
        <div className="border-r border-gray-800 overflow-hidden">
          <FolderColumn
            folders={rootFolders}
            activePath={fbActiveRoot ?? ''}
            onSelect={handleRootSelect}
          />
        </div>

        {/* Column 2: Subfolders */}
        <div className="border-r border-gray-800 overflow-hidden">
          <FolderColumn
            folders={subFolders}
            activePath={fbActivePath}
            onSelect={handleSubFolderSelect}
          />
        </div>

        {/* Column 3: Files */}
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
