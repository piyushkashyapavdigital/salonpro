import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** Magic UI's SparklesText — twinkling stars scattered around a heading. */
export function SparklesText({
  text,
  className,
  count = 6,
  colors = { first: '#EC4899', second: '#8B5CF6' },
}: {
  text: string;
  className?: string;
  count?: number;
  colors?: { first: string; second: string };
}) {
  const [stars, setStars] = useState<{ id: number; x: number; y: number; size: number; delay: number; color: string }[]>([]);

  useEffect(() => {
    const make = () =>
      setStars(
        Array.from({ length: count }).map((_, i) => ({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: Math.random() * 8 + 5,
          delay: Math.random() * 2.2,
          color: Math.random() > 0.45 ? colors.first : colors.second,
        })),
      );
    make();
    const t = window.setInterval(make, 3600);
    return () => window.clearInterval(t);
  }, [count, colors.first, colors.second]);

  return (
    <span className={cn('relative inline-block', className)}>
      {stars.map((s) => (
        <Star key={s.id} {...s} />
      ))}
      <span className="relative z-10">{text}</span>
    </span>
  );
}

function Star({ x, y, size, delay, color }: { x: number; y: number; size: number; delay: number; color: string }) {
  return (
    <span
      className="pointer-events-none absolute animate-sparkle"
      style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay}s` }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color }}>
        <path
          d="M12 0C12 5 14 7 19 7c-5 0-7 2-7 7 0-5-2-7-7-7 5 0 7-2 7-7Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
