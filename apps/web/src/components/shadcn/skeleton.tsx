import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-2xl bg-gradient-to-r from-ink-100 via-ink-50 to-ink-100 bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
