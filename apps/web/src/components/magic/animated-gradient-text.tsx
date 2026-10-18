import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Magic UI's AnimatedGradientText — a gradient that drifts across the text. */
export function AnimatedGradientText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block animate-shimmer bg-[length:200%_auto] bg-clip-text text-transparent',
        className,
      )}
      style={{ backgroundImage: 'linear-gradient(110deg, #DB2777 15%, #8B5CF6 40%, #EC4899 60%, #DB2777 85%)' }}
    >
      {children}
    </span>
  );
}
