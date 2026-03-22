import { useEffect, useRef, memo } from 'react';
import hljs from 'highlight.js';

export type LineType = 'added' | 'removed' | 'unchanged';

interface DiffLineProps {
  lineNumber: number | null;
  text: string;
  type: LineType;
  language: string;
  wrap: boolean;
  highlights?: Array<{ start: number; end: number }>;
}

const TYPE_CLASSES: Record<LineType, string> = {
  added: 'bg-green-950 text-green-300',
  removed: 'bg-red-950 text-red-300',
  unchanged: 'bg-transparent text-gray-300',
};

/** Inline highlight background for changed word spans within a changed line. */
const INLINE_HL: Record<LineType, string> = {
  added: 'bg-green-500/35 rounded-sm',
  removed: 'bg-red-500/35 rounded-sm',
  unchanged: '',
};

function renderWithHighlights(
  text: string,
  highlights: Array<{ start: number; end: number }>,
  type: LineType
) {
  const hlCls = INLINE_HL[type];
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const { start, end } of sorted) {
    if (pos < start) parts.push(<span key={`u${pos}`}>{text.slice(pos, start)}</span>);
    parts.push(<span key={`h${start}`} className={hlCls}>{text.slice(start, end)}</span>);
    pos = end;
  }
  if (pos < text.length) parts.push(<span key={`u${pos}`}>{text.slice(pos)}</span>);
  return <>{parts}</>;
}

export const DiffLine = memo(function DiffLine({
  lineNumber,
  text,
  type,
  language,
  wrap,
  highlights,
}: DiffLineProps) {
  const codeRef = useRef<HTMLSpanElement>(null);
  const hasHighlights = highlights && highlights.length > 0;

  useEffect(() => {
    // When we're rendering inline highlight spans, skip hljs — it would wipe them out
    if (hasHighlights) return;
    if (!codeRef.current) return;
    codeRef.current.removeAttribute('data-highlighted');
    if (language === 'auto') {
      hljs.highlightElement(codeRef.current);
    } else {
      try {
        const result = hljs.highlight(text, { language, ignoreIllegals: true });
        codeRef.current.innerHTML = result.value;
      } catch {
        codeRef.current.textContent = text;
      }
    }
  }, [text, language, hasHighlights]);

  const codeClass = `flex-1 leading-[1.375rem] ${wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`;

  return (
    <div className={`flex min-h-[1.375rem] text-xs font-mono ${TYPE_CLASSES[type]}`}>
      {/* Line number */}
      <span className="shrink-0 w-12 text-right pr-3 text-gray-600 select-none leading-[1.375rem]">
        {lineNumber ?? ''}
      </span>
      {/* Change indicator */}
      <span className="shrink-0 w-4 leading-[1.375rem] select-none">
        {type === 'added' ? '+' : type === 'removed' ? '-' : ' '}
      </span>
      {/* Code content */}
      <code className={codeClass}>
        {hasHighlights ? (
          renderWithHighlights(text, highlights!, type)
        ) : (
          <span
            ref={codeRef}
            className={language !== 'auto' ? `language-${language}` : undefined}
          >
            {text}
          </span>
        )}
      </code>
    </div>
  );
});
