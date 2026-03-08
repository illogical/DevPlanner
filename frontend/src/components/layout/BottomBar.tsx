import { useStore } from '../../store';
import { FileBreadcrumb } from '../doc/FileBreadcrumb';
import { GitStatusDot } from '../doc/GitStatusDot';
import { GitCommitPanel } from '../doc/GitCommitPanel';

export function BottomBar() {
    const {
        fbIsOpen,
        fbActivePath,
        docFilePath,
        setFbActivePath,
        toggleFileBrowser,
        navigateToFile,
        gitCurrentState,
        gitIsLoading,
        gitCommitPanelOpen,
        toggleCommitPanel,
    } = useStore();

    const handleBreadcrumbNavigate = (path: string) => {
        setFbActivePath(path);
        if (!fbIsOpen) {
            toggleFileBrowser();
        }
    };

    const handleFilenameClick = () => {
        if (docFilePath) {
            if (fbIsOpen) toggleFileBrowser();
            navigateToFile(docFilePath);
        }
    };

    const breadcrumbPath = fbIsOpen ? fbActivePath : (docFilePath ? docFilePath.split('/').slice(0, -1).join('/') : '');
    const filename = docFilePath ? docFilePath.split('/').pop() : null;

    return (
        <div className="h-10 border-t border-gray-800 bg-gray-900 flex items-center px-4 shrink-0 relative">
            <div className="flex-1 flex items-center relative z-10 w-full h-full">
                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <FileBreadcrumb
                        path={breadcrumbPath}
                        onNavigate={handleBreadcrumbNavigate}
                        filename={filename}
                        onFilenameClick={handleFilenameClick}
                        gitNode={
                            filename ? (
                                <div className="relative flex items-center mr-1">
                                    <GitStatusDot
                                        state={gitCurrentState ?? undefined}
                                        loading={gitIsLoading}
                                        onClick={toggleCommitPanel}
                                    />
                                    {gitCommitPanelOpen && (
                                        <GitCommitPanel />
                                    )}
                                </div>
                            ) : undefined
                        }
                    />
                </div>

                <button
                    className="flex-1 h-full cursor-pointer opacity-0"
                    onClick={toggleFileBrowser}
                    aria-label="Toggle file browser"
                />
            </div>
        </div>
    );
}
