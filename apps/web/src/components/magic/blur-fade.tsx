import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BlurFadeProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  yOffset?: number;
  blur?: string;
}

/**
 * Aceternity UI's BlurFade — content blurs and rises into place.
 *
 * Intentionally animates on mount rather than on intersection: an
 * `IntersectionObserver`-driven reveal can silently never fire (hidden or
 * occluded document, observer throttling), which would leave content stuck
 * invisible. A mount animation is always visible.
 *
 * Where motion is not possible at all — no `IntersectionObserver` in the
 * environment (e.g. jsdom), or `prefers-reduced-motion` — the children render
 * plainly instead.
 */
export function BlurFade({ children, className, delay = 0, duration = 0.42, yOffset = 8, blur = '7px' }: BlurFadeProps) {
  const [canAnimate] = useState(canAnimateMotion);
  if (!canAnimate) return <div className={className}>{children}</div>;

  return (
    <motion.div
      initial={{ y: yOffset, opacity: 0, filter: `blur(${blur})` }}
      animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
      transition={{ delay: 0.03 + delay, duration, ease: [0.22, 1, 0.36, 1] }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

/** Shared guard: can this environment actually run framer-motion animations? */
function canAnimateMotion() {
  if (typeof IntersectionObserver === 'undefined') return false;
  // A hidden document never runs rAF/IntersectionObserver callbacks, so an
  // animation started there would simply never finish. Render statically.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A stagger container that reveals its children in sequence. */
export function BlurFadeGroup({
  children,
  className,
  stagger = 0.06,
}: {
  children: ReactNode[];
  className?: string;
  stagger?: number;
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <BlurFade key={i} delay={i * stagger}>
          {child}
        </BlurFade>
      ))}
    </div>
  );
}
