import { DiffPane } from './DiffPane';
import type { DiffLineData } from './DiffContent';

interface DiffLayoutProps {
  leftContent: string;
  leftFilename: string;
  leftLabel?: string;
  leftLines: DiffLineData[];
  rightContent: string;
  rightFilename: string;
  rightLabel?: string;
  rightLines: DiffLineData[];
  language: string;
  wrap: boolean;
  leftScrollRef: React.RefObject<HTMLDivElement | null>;
  rightScrollRef: React.RefObject<HTMLDivElement | null>;
  onLeftScroll: () => void;
  onRightScroll: () => void;
  onLeftFileLoad: (content: string, filename: string) => void;
  onRightFileLoad: (content: string, filename: string) => void;
}

export function DiffLayout({
  leftContent,
  leftFilename,
  leftLabel,
  leftLines,
  rightContent,
  rightFilename,
  rightLabel,
  rightLines,
  language,
  wrap,
  leftScrollRef,
  rightScrollRef,
  onLeftScroll,
  onRightScroll,
  onLeftFileLoad,
  onRightFileLoad,
}: DiffLayoutProps) {
  return (
    <div className="flex-1 grid grid-cols-2 divide-x divide-gray-700 overflow-hidden">
      <DiffPane
        side="left"
        content={leftContent}
        filename={leftFilename}
        label={leftLabel}
        lines={leftLines}
        language={language}
        wrap={wrap}
        scrollRef={leftScrollRef}
        onScroll={onLeftScroll}
        onFileLoad={onLeftFileLoad}
      />
      <DiffPane
        side="right"
        content={rightContent}
        filename={rightFilename}
        label={rightLabel}
        lines={rightLines}
        language={language}
        wrap={wrap}
        scrollRef={rightScrollRef}
        onScroll={onRightScroll}
        onFileLoad={onRightFileLoad}
      />
    </div>
  );
}
