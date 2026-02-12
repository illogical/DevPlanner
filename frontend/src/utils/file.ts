/**
 * Format file size in bytes to human-readable string
 * Example: 1536 → "1.5 KB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if MIME type represents a text file (readable by AI agents)
 */
export function isTextFile(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    [
      'application/json',
      'application/javascript',
      'application/typescript',
      'application/xml',
      'application/yaml',
    ].includes(mimeType)
  );
}

/**
 * Get Tailwind CSS class for file icon color based on MIME type
 */
export function getFileIconClass(mimeType: string): string {
  if (mimeType.startsWith('text/markdown')) return 'text-blue-400';
  if (mimeType.startsWith('text/')) return 'text-gray-400';
  if (mimeType.includes('json')) return 'text-yellow-400';
  if (mimeType.includes('javascript') || mimeType.includes('typescript')) {
    return 'text-green-400';
  }
  if (mimeType.includes('yaml') || mimeType.includes('xml')) {
    return 'text-purple-400';
  }
  return 'text-gray-500';
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}
