import { forwardRef } from 'react';
import { cn } from '../../utils/cn';

type IconButtonSize = 'sm' | 'md' | 'lg';
type IconButtonVariant = 'ghost' | 'secondary';

interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  label: string; // Required for accessibility
}

const sizeStyles: Record<IconButtonSize, string> = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

const variantStyles: Record<IconButtonVariant, string> = {
  ghost: 'hover:bg-gray-800 active:bg-gray-700',
  secondary: 'bg-gray-700 hover:bg-gray-600 active:bg-gray-800',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { children, size = 'md', variant = 'ghost', label, className, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex items-center justify-center rounded-md',
          'text-gray-400 hover:text-gray-100',
          'transition-all duration-150 ease-out',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          sizeStyles[size],
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
