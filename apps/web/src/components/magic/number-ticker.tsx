import { useEffect, useState } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

interface TickerProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delay?: number;
  className?: string;
  format?: (n: number) => string;
}

const formatNumber = (n: number, { prefix = '', suffix = '', decimals = 0, format }: TickerProps) =>
  `${prefix}${format ? format(n) : inr.format(Number(n.toFixed(decimals)))}${suffix}`;

/**
 * Magic UI's NumberTicker — springs a figure up from zero when it appears.
 *
 * Animates on mount rather than on intersection so a number can never be left
 * stranded showing `0` (an `IntersectionObserver` reveal can fail to fire).
 * Where motion is not possible — no `IntersectionObserver` in the environment
 * (e.g. jsdom) or `prefers-reduced-motion` — it renders the exact value.
 */
export function NumberTicker(props: TickerProps) {
  const [canAnimate] = useState(canAnimateMotion);

  if (!canAnimate) {
    return (
      <span className={cn('inline-block tabular-nums', props.className)}>{formatNumber(props.value, props)}</span>
    );
  }
  return <AnimatedTicker {...props} />;
}

function AnimatedTicker({ value, delay = 0, className, ...rest }: TickerProps) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 26, stiffness: 140, mass: 0.9 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const start = 80 + delay * 1000;
    const t1 = window.setTimeout(() => motionValue.set(value), start);
    // Belt-and-braces: if the animation loop is suspended (hidden document) the
    // spring never progresses, so fall back to the exact figure.
    const t2 = window.setTimeout(() => setDisplay(value), start + 1400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [motionValue, value, delay]);

  useEffect(() => spring.on('change', setDisplay), [spring]);

  return (
    <span className={cn('inline-block tabular-nums', className)}>
      {formatNumber(display, { value, delay, className, ...rest })}
    </span>
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
