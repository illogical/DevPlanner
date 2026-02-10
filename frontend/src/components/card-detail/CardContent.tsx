import { useMemo } from 'react';
import { marked } from 'marked';

interface CardContentProps {
  content: string;
}

export function CardContent({ content }: CardContentProps) {
  const html = useMemo(() => {
    // Configure marked for safe rendering
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    // Remove the ## Tasks section since we render it separately
    // Also remove checklist items to avoid redundancy with the Tasks section
    const contentWithoutTasks = content
      .replace(/## Tasks[\s\S]*?(?=##|$)/g, '')
      .replace(/^\s*-\s*\[[\sx]\]\s+.*/gm, '')
      .trim();

    if (!contentWithoutTasks) {
      return '';
    }

    return marked.parse(contentWithoutTasks);
  }, [content]);

  if (!html) {
    return null;
  }

  return (
    <div className="border-t border-gray-700 pt-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Description</h3>
      <div
        className="prose prose-invert prose-sm max-w-none
          prose-headings:text-gray-100 prose-headings:font-semibold
          prose-p:text-gray-300 prose-p:leading-relaxed
          prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
          prose-code:text-blue-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
          prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700
          prose-ul:text-gray-300 prose-ol:text-gray-300
          prose-li:marker:text-gray-500
          prose-blockquote:border-gray-600 prose-blockquote:text-gray-400
          prose-hr:border-gray-700"
        dangerouslySetInnerHTML={{ __html: html as string }}
      />
    </div>
  );
}
