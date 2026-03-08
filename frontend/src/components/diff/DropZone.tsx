import { useRef } from 'react';

const ACCEPTED_EXTENSIONS = [
  '.md', '.txt', '.json', '.ts', '.tsx', '.js', '.jsx',
  '.yaml', '.yml', '.csv', '.html', '.css',
];

interface DropZoneProps {
  side: 'left' | 'right';
  onFileLoad: (content: string, filename: string) => void;
}

export function DropZone({ side, onFileLoad }: DropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFileLoad(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text) {
      onFileLoad(text, `pasted-${side}.txt`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    // Reset so the same file can be re-picked
    e.target.value = '';
  };

  return (
    <div
      ref={zoneRef}
      className="flex-1 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-gray-700 rounded-lg m-4 p-8 text-center cursor-default"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
    >
      <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <div className="space-y-1">
        <p className="text-sm text-gray-400">
          Drop a file here, paste text (Ctrl+V), or
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-sm text-blue-400 hover:text-blue-300 underline transition-colors"
        >
          choose a file
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
