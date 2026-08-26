import { useEffect, useRef, useState } from 'react';

/**
 * Animate a number from its previous value to `target` with an ease-out curve.
 * Honors prefers-reduced-motion (snaps straight to the value) and picks up from
 * wherever it was, so a live refresh tweens smoothly instead of restarting at 0.
 */
export function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Number.isFinite(target)) {
      setVal(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;

    let raf = 0;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return val;
}
