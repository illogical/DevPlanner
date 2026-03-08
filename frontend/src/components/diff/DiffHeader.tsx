import { Link } from 'react-router-dom';

export function DiffHeader() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-gray-900 border-b border-gray-700">
      <Link
        to="/"
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to DevPlanner
      </Link>
      <span className="text-gray-600">|</span>
      <h1 className="text-sm font-semibold text-gray-100">Diff Viewer</h1>
    </div>
  );
}
