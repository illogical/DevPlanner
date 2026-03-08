import { useMemo } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import { cn } from '../../utils/cn';
import { FrontmatterDisplay } from './FrontmatterDisplay';
import { parseFrontmatter } from '../../utils/frontmatter';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

const renderer = new marked.Renderer();

renderer.code = function ({ text, lang }) {
  try {
    const language = lang && hljs.getLanguage(lang) ? lang : undefined;
    const highlighted = language
      ? hljs.highlight(text, { language }).value
      : hljs.highlightAuto(text).value;
    return `<pre class="hljs-pre"><code class="hljs">${highlighted}</code></pre>`;
  } catch {
    return `<pre class="hljs-pre"><code class="hljs">${text}</code></pre>`;
  }
};

renderer.heading = function ({ text, depth }) {
  const colors: Record<number, string> = {
    1: '#9cdcfe',
    2: '#dcdcaa',
    3: '#c586c0',
  };
  const color = colors[depth] ?? '#d4d4d4';
  return `<h${depth} style="color:${color}">${text}</h${depth}>`;
};

marked.setOptions({ renderer });

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  const { frontmatter, body } = useMemo(() => parseFrontmatter(content), [content]);

  const html = useMemo(() => {
    try {
      const result = marked.parse(body, { async: false });
      return typeof result === 'string' ? result : '';
    } catch {
      return `<p style="color:#f48771">Failed to render markdown.</p>`;
    }
  }, [body]);

  return (
    <div
      className={cn('overflow-y-auto flex-1', className)}
      style={{ background: 'linear-gradient(180deg, #152535 0%, #1A3549 30%)' }}
    >
      <div className="max-w-3xl mx-auto px-8 py-10">
        {frontmatter && <FrontmatterDisplay frontmatter={frontmatter} />}
        <div
          className="prose-doc"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
