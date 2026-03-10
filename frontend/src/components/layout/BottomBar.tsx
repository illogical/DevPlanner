import { useStore } from '../../store';
import { FileBreadcrumb } from '../doc/FileBreadcrumb';
import { GitStatusDot } from '../doc/GitStatusDot';
import { GitCommitPanel } from '../doc/GitCommitPanel';
import { DiffQuickButtons } from '../diff/DiffQuickButtons';
import { cn } from '../../utils/cn';

export function BottomBar() {
    const {
        fbIsOpen,
        docFilePath,
        setFbActivePath,
        toggleFileBrowser,
        navigateToFile,
        gitCurrentState,
        gitIsLoading,
        gitCommitPanelOpen,
        toggleCommitPanel,
        stageFile,
    } = useStore();

    const handleBreadcrumbNavigate = (path: string) => {
        if (path) {
            setFbActivePath(path);
        } else {
            setFbActivePath('');
        }
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

    const breadcrumbPath = docFilePath ? docFilePath.split('/').slice(0, -1).join('/') : '';
    const filename = docFilePath ? docFilePath.split('/').pop() : null;

    return (
        <div
            className="h-10 border-t border-gray-800 bg-gray-900 flex items-center px-4 shrink-0 relative cursor-pointer"
            onClick={() => {
                if (docFilePath) {
                    const parts = docFilePath.split('/');
                    if (parts.length > 1) {
                        setFbActivePath(parts.slice(0, -1).join('/'));
                    } else {
                        setFbActivePath('');
                    }
                }
                if (!fbIsOpen) toggleFileBrowser();
                else toggleFileBrowser(); // just toggle
            }}
        >
            <div className="flex-1 flex items-center relative z-10 w-full h-full">
                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <FileBreadcrumb
                        path={breadcrumbPath}
                        onNavigate={handleBreadcrumbNavigate}
                        filename={filename}
                        onFilenameClick={handleFilenameClick}
                    />
                </div>

                {/* Right side: Diff quick buttons + Git Status */}
                {filename && (
                    <div className="absolute right-0 top-0 bottom-0 flex items-center pr-1" onClick={(e) => e.stopPropagation()}>
                        <DiffQuickButtons filePath={docFilePath} gitState={gitCurrentState} />
                        <div className="relative flex items-center shrink-0">
                            <GitStatusDot
                                state={gitCurrentState ?? undefined}
                                loading={gitIsLoading}
                                onClick={
                                    gitCurrentState === 'untracked'
                                        ? () => stageFile(docFilePath)
                                        : toggleCommitPanel
                                }
                                showLabel={true}
                            />
                            {gitCommitPanelOpen && (
                                <div className="absolute bottom-full right-0 mb-2">
                                    <GitCommitPanel />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <svg
                    className={cn("w-4 h-4 text-gray-600 transition-transform duration-200", fbIsOpen && "rotate-180")}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
            </div>
        </div>
    );
}
