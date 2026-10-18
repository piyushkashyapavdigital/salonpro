import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Magic UI's ShimmerButton — a shimmering gradient call to action.
 * Renders as a real <button> so it stays accessible.
 */
export function ShimmerButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={cn(
        'group relative isolate inline-flex h-12 cursor-pointer select-none items-center justify-center gap-2 overflow-hidden rounded-full bg-brand-sheen px-6 text-[14.5px] font-semibold text-white shadow-brand transition-transform duration-200 active:scale-[.97] disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 animate-shimmer bg-[length:200%_100%] opacity-60"
        style={{
          backgroundImage: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,.55) 50%, transparent 75%)',
        }}
      />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  );
}
