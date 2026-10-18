import { cn } from '@/lib/utils';

/** Magic UI's Meteors — a shower of streaks, for auth/empty backgrounds. */
export function Meteors({ number = 12, className }: { number?: number; className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      {Array.from({ length: number }).map((_, i) => (
        <span
          key={i}
          className="absolute top-[-5%] h-0.5 w-0.5 rotate-[215deg] animate-meteor rounded-full bg-brand-300 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] before:absolute before:top-1/2 before:h-px before:w-[52px] before:-translate-y-1/2 before:bg-gradient-to-r before:from-brand-300 before:to-transparent before:content-['']"
          style={{
            left: `${Math.floor(Math.random() * 100)}%`,
            animationDelay: `${(Math.random() * 5).toFixed(2)}s`,
            animationDuration: `${(Math.random() * 4 + 3).toFixed(2)}s`,
          }}
        />
      ))}
    </div>
  );
}
