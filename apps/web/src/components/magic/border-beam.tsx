import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * Magic UI's BorderBeam — a light that travels around a card's border.
 * Falls back to a static ring on engines without `offset-path` support.
 */
export function BorderBeam({
  className,
  size = 180,
  duration = 8,
  delay = 0,
  colorFrom = '#EC4899',
  colorTo = '#8B5CF6',
}: {
  className?: string;
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit]',
        '[border:1px_solid_transparent] [mask-clip:padding-box,border-box] [mask-composite:intersect]',
        '[mask:linear-gradient(transparent,transparent),linear-gradient(#fff,#fff)]',
        className,
      )}
    >
      <div
        className="absolute aspect-square animate-border-beam bg-gradient-to-l from-[var(--color-from)] via-[var(--color-to)] to-transparent"
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            '--color-from': colorFrom,
            '--color-to': colorTo,
            animationDelay: `-${delay}s`,
            animationDuration: `${duration}s`,
          } as CSSProperties
        }
      />
    </div>
  );
}
