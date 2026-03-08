
interface DiffPaneHeaderProps {
  filename: string;
  content: string;
  side: 'left' | 'right';
  onFilePickerOpen?: () => void;
}

export function DiffPaneHeader({ filename, content, side, onFilePickerOpen }: DiffPaneHeaderProps) {
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Fallback for environments without clipboard API
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-700 min-h-[2.25rem]">
      <span className="flex-1 text-xs text-gray-400 font-mono truncate" title={filename}>
        {filename || (
          <span className="italic text-gray-600">
            {side === 'left' ? 'Left pane — no file loaded' : 'Right pane — no file loaded'}
          </span>
        )}
      </span>

      {/* Copy button — only when there's content */}
      {content && (
        <button
          onClick={copyToClipboard}
          title="Copy content to clipboard"
          className="shrink-0 p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </button>
      )}

      {/* File picker button — right pane only */}
      {side === 'right' && onFilePickerOpen && (
        <button
          onClick={onFilePickerOpen}
          title="Choose a file"
          className="shrink-0 p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
