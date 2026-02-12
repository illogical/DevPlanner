import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { FileListItem } from '../files/FileListItem';
import { FileAssociationInput } from './FileAssociationInput';
import { cn } from '../../utils/cn';

interface CardFilesProps {
  cardSlug: string;
}

export function CardFiles({ cardSlug }: CardFilesProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    projectFiles, 
    uploadFile,
    disassociateFile,
    isLoadingFiles,
    loadProjectFiles,
    activeProjectSlug
  } = useStore();

  // Load files if needed (e.g. if arriving directly at card detail)
  useEffect(() => {
    if (projectFiles.length === 0 && activeProjectSlug) {
      loadProjectFiles();
    }
  }, [projectFiles.length, activeProjectSlug, loadProjectFiles]);

  const cardFiles = projectFiles.filter(f => f.cardSlugs.includes(cardSlug));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleUpload(e.target.files[0]);
    }
  };

  const handleUpload = async (file: File) => {
    try {
      await uploadFile(file, undefined, cardSlug);
    } catch (error) {
      // Error handled in store/UI
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-gray-400">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        <h3 className="font-medium text-sm">Files ({cardFiles.length})</h3>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer text-center",
          isDragging 
            ? "border-blue-500 bg-blue-500/10" 
            : "border-gray-700 hover:border-gray-600 hover:bg-gray-800/50"
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
        />
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <svg className="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-xs">
            {isDragging ? "Drop to upload" : "Drop file or click to upload"}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {isLoadingFiles && cardFiles.length === 0 ? (
          <div className="text-center py-4 text-gray-500 text-xs">Loading files...</div>
        ) : cardFiles.length === 0 ? (
          <div className="text-center py-4 text-gray-500 text-xs italic">
            No files attached to this card
          </div>
        ) : (
          cardFiles.map(file => (
            <FileListItem
              key={file.filename}
              file={file}
              onDisassociate={() => disassociateFile(file.filename, cardSlug)}
            />
          ))
        )}
      </div>

      {/* File association autocomplete */}
      <FileAssociationInput cardSlug={cardSlug} />
    </div>
  );
}
