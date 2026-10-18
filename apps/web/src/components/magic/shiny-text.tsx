import { cn } from '@/lib/utils';

/** Magic UI's AnimatedShinyText — a light sweeps across muted text. */
export function AnimatedShinyText({
  children,
  className,
  shimmerWidth = 100,
}: {
  children: React.ReactNode;
  className?: string;
  shimmerWidth?: number;
}) {
  return (
    <span
      style={{ '--shiny-width': `${shimmerWidth}px` } as React.CSSProperties}
      className={cn(
        'animate-shimmer bg-[length:200%_100%] bg-clip-text text-ink-400',
        'bg-[linear-gradient(110deg,#8A7C85,45%,#EC4899,55%,#8A7C85)]',
        className,
      )}
    >
      {children}
    </span>
  );
}
