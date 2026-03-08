interface DocEmptyStateProps {
  onOpenFileBrowser: () => void;
  label?: string;
}

function DocIcon() {
  return (
    <svg
      className="w-16 h-16 opacity-20"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      style={{ color: '#9cdcfe' }}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function FolderOpenIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export function DocEmptyState({ onOpenFileBrowser, label = 'No file open' }: DocEmptyStateProps) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-5 select-none"
      style={{ background: '#162D42' }}
    >
      <DocIcon />

      <div className="text-center">
        <p className="text-lg font-medium mb-1" style={{ color: '#9cdcfe' }}>
          {label}
        </p>
        <p className="text-sm" style={{ color: '#5a7a96' }}>
          Open a file from the browser to get started
        </p>
      </div>

      <button
        onClick={onOpenFileBrowser}
        className="doc-empty-btn flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
      >
        <FolderOpenIcon />
        Open File Browser
      </button>

      <p className="text-xs" style={{ color: '#2e4a62' }}>
        Ctrl+B to toggle browser
      </p>
    </div>
  );
}
