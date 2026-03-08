import { useEffect, useRef, memo } from 'react';
import hljs from 'highlight.js';

export type LineType = 'added' | 'removed' | 'unchanged';

interface DiffLineProps {
  lineNumber: number | null;
  text: string;
  type: LineType;
  language: string;
  wrap: boolean;
}

const TYPE_CLASSES: Record<LineType, string> = {
  added: 'bg-green-950 text-green-300',
  removed: 'bg-red-950 text-red-300',
  unchanged: 'bg-transparent text-gray-300',
};

export const DiffLine = memo(function DiffLine({
  lineNumber,
  text,
  type,
  language,
  wrap,
}: DiffLineProps) {
  const codeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!codeRef.current) return;
    // Reset any prior highlighting
    codeRef.current.removeAttribute('data-highlighted');
    if (language === 'auto') {
      hljs.highlightElement(codeRef.current);
    } else {
      try {
        const result = hljs.highlight(text, { language, ignoreIllegals: true });
        codeRef.current.innerHTML = result.value;
      } catch {
        // Fallback: plain text
        codeRef.current.textContent = text;
      }
    }
  }, [text, language]);

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
      <code
        className={`flex-1 leading-[1.375rem] ${wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}
      >
        <span
          ref={codeRef}
          className={language !== 'auto' ? `language-${language}` : undefined}
        >
          {text}
        </span>
      </code>
    </div>
  );
});
