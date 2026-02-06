import { cn } from '../../utils/cn';

interface CollapsibleProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Collapsible({ isOpen, children, className }: CollapsibleProps) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-out',
        isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        className
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
