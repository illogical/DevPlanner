const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'bash', label: 'Bash' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'plaintext', label: 'Plain Text' },
];

interface DiffToolbarProps {
  language: string;
  onLanguageChange: (lang: string) => void;
  wrap: boolean;
  onWrapToggle: () => void;
  syncScroll: boolean;
  onSyncScrollToggle: () => void;
  onSwap: () => void;
  onClear: () => void;
}

export function DiffToolbar({
  language,
  onLanguageChange,
  wrap,
  onWrapToggle,
  syncScroll,
  onSyncScrollToggle,
  onSwap,
  onClear,
}: DiffToolbarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 flex-wrap">
      {/* Language selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400">Language</label>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="w-px h-4 bg-gray-700" />

      {/* Wrap toggle */}
      <button
        onClick={onWrapToggle}
        title="Toggle line wrapping"
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
          wrap
            ? 'bg-blue-700 text-blue-100'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 6h16M4 12h10m-6 6h12" />
        </svg>
        Wrap
      </button>

      {/* Sync scroll toggle */}
      <button
        onClick={onSyncScrollToggle}
        title="Toggle synchronized scrolling"
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
          syncScroll
            ? 'bg-blue-700 text-blue-100'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        Sync Scroll
      </button>

      <div className="w-px h-4 bg-gray-700" />

      {/* Swap panes */}
      <button
        onClick={onSwap}
        title="Swap left and right panes"
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
        Swap
      </button>

      {/* Clear both panes */}
      <button
        onClick={onClear}
        title="Clear both panes"
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M6 18L18 6M6 6l12 12" />
        </svg>
        Clear
      </button>
    </div>
  );
}
