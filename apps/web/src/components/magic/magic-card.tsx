import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Magic UI's MagicCard — a pointer-following spotlight. Works with touch too
 * (the spotlight sits under the last touch point).
 */
export function MagicCard({
  children,
  className,
  gradientSize = 240,
  gradientColor = 'rgba(236,72,153,0.16)',
}: {
  children: ReactNode;
  className?: string;
  gradientSize?: number;
  gradientColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onPointerLeave={() => setPos(null)}
      className={cn('group relative overflow-hidden rounded-3xl', className)}
    >
      {children}
      {pos ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-300"
          style={{
            background: `radial-gradient(${gradientSize}px circle at ${pos.x}px ${pos.y}px, ${gradientColor}, transparent 72%)`,
          }}
        />
      ) : null}
    </div>
  );
}
