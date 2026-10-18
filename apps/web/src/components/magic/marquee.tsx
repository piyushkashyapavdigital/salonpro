import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Magic UI's Marquee — an infinite, GPU-driven ribbon.
 * `--duration` controls speed, `--gap` the spacing.
 */
export function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  repeat = 4,
  duration = 40,
  gap = '1rem',
  children,
  ...props
}: {
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  repeat?: number;
  duration?: number;
  gap?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      style={{ '--duration': `${duration}s`, '--gap': gap, ...(props.style ?? {}) } as CSSProperties}
      className={cn('group flex flex-row overflow-hidden [gap:var(--gap)]', className)}
    >
      {Array.from({ length: repeat }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex shrink-0 flex-row justify-around [gap:var(--gap)]',
            reverse ? 'animate-marquee-rev' : 'animate-marquee',
            pauseOnHover && 'group-hover:[animation-play-state:paused]',
          )}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
