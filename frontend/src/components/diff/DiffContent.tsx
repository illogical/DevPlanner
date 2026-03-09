import { forwardRef } from 'react';
import { DiffLine, type LineType } from './DiffLine';

export interface DiffLineData {
  lineNumber: number | null;
  text: string;
  type: LineType;
  /** Character ranges within `text` to highlight as inline changed spans. */
  highlights?: Array<{ start: number; end: number }>;
}

interface DiffContentProps {
  lines: DiffLineData[];
  language: string;
  wrap: boolean;
  onScroll?: () => void;
}

export const DiffContent = forwardRef<HTMLDivElement, DiffContentProps>(
  function DiffContent({ lines, language, wrap, onScroll }, ref) {
    return (
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex-1 overflow-auto bg-gray-950"
      >
        {lines.length === 0 ? null : (
          <div className="min-w-max">
            {lines.map((line, i) => (
              <DiffLine
                key={i}
                lineNumber={line.lineNumber}
                text={line.text}
                type={line.type}
                language={language}
                wrap={wrap}
                highlights={line.highlights}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);
