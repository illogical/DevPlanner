import { useRef } from 'react';
import { DiffContent, type DiffLineData } from './DiffContent';
import { DiffPaneHeader } from './DiffPaneHeader';
import { DropZone } from './DropZone';

interface DiffPaneProps {
  side: 'left' | 'right';
  content: string;
  filename: string;
  lines: DiffLineData[];
  language: string;
  wrap: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onFileLoad: (content: string, filename: string) => void;
}

export function DiffPane({
  side,
  content,
  filename,
  lines,
  language,
  wrap,
  scrollRef,
  onScroll,
  onFileLoad,
}: DiffPaneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col border-gray-700 overflow-hidden">
      <DiffPaneHeader
        filename={filename}
        content={content}
        side={side}
        onFilePickerOpen={side === 'right' ? () => fileInputRef.current?.click() : undefined}
      />

      {content ? (
        <DiffContent
          ref={scrollRef}
          lines={lines}
          language={language}
          wrap={wrap}
          onScroll={onScroll}
        />
      ) : (
        <DropZone side={side} onFileLoad={onFileLoad} />
      )}

      {/* Hidden file input wired to header button (right pane only) */}
      {side === 'right' && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt,.json,.ts,.tsx,.js,.jsx,.yaml,.yml,.csv,.html,.css"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                const text = ev.target?.result as string;
                onFileLoad(text, file.name);
              };
              reader.readAsText(file);
            }
            e.target.value = '';
          }}
        />
      )}
    </div>
  );
}
