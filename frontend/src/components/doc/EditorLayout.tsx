import { cn } from '../../utils/cn';
import { EditorPane } from './EditorPane';
import { MarkdownPreview } from './MarkdownPreview';

interface EditorLayoutProps {
  content: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  className?: string;
}

export function EditorLayout({ content, onChange, onSave, className }: EditorLayoutProps) {
  return (
    <div className={cn('flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden', className)}>
      <EditorPane
        content={content}
        onChange={onChange}
        onSave={onSave}
        className="h-full"
      />
      <MarkdownPreview
        content={content}
        className="h-full overflow-y-auto"
      />
    </div>
  );
}
