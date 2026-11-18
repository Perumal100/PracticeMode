import { cn } from '@/lib/utils';

export function Progress({ value, max = 100, className, label }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      {/* Scaled, not resized: only transform animates. */}
      <div className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-300 motion-reduce:transition-none" style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}
