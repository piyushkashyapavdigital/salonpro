import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-12 w-full rounded-2xl border border-input bg-card px-4 py-2 text-[15px] text-ink-900 shadow-sm transition',
      'placeholder:text-ink-300 file:border-0 file:bg-transparent file:text-sm file:font-medium',
      'focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
