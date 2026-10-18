import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-brand-100 text-brand-700',
        solid: 'border-transparent bg-brand-500 text-white',
        secondary: 'border-transparent bg-ink-100 text-ink-500',
        success: 'border-transparent bg-mint-100 text-mint-500',
        warning: 'border-transparent bg-amber-100 text-amber-500',
        danger: 'border-transparent bg-rose-100 text-rose-500',
        outline: 'border-border bg-card text-ink-600',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
