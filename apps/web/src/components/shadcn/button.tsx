import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-500 text-white shadow-brand hover:bg-brand-600',
        gradient: 'bg-brand-sheen text-white shadow-brand hover:brightness-[1.05]',
        secondary: 'bg-brand-100 text-brand-700 hover:bg-brand-200',
        outline: 'border border-border bg-card text-ink-700 hover:border-brand-200 hover:bg-brand-50',
        ghost: 'text-ink-500 hover:bg-brand-50 hover:text-brand-700',
        destructive: 'bg-rose-500 text-white hover:brightness-[1.05]',
        link: 'text-brand-600 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 px-3.5 text-[13px]',
        lg: 'h-[3.25rem] px-7 text-[15px]',
        icon: 'h-11 w-11',
        'icon-sm': 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
