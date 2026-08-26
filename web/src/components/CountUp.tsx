import { useCountUp } from '../lib/anim';

/** Renders a number that tweens to its target. `format` maps the animated value to text. */
export function CountUp({ value, format, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{format ? format(v) : Math.round(v).toLocaleString('en-IN')}</span>;
}
