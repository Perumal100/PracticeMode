// Attempts started per day: one series, so no legend; the card title names it.
// Each day is focusable and announces its counts; hovering shows a tooltip.
import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Round up to 1, 2 or 5 times a power of ten so the top gridline reads cleanly. */
export function niceMax(value) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((step) => step * power).find((step) => step >= value);
}

export function parseDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const dayLabel = (iso, opts = { month: 'short', day: 'numeric' }) => parseDay(iso).toLocaleDateString(undefined, opts);

export function ActivityChart({ series }) {
  const [active, setActive] = useState(null);
  const top = niceMax(Math.max(0, ...series.map((d) => d.started)));
  const point = active === null ? null : series[active];

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3">
      <div className="flex h-40 flex-col justify-between text-right text-[11px] tabular-nums text-muted-foreground" aria-hidden>
        <span className="-translate-y-1/2">{top}</span>
        <span className="-translate-y-1/2">{top / 2}</span>
        <span className="translate-y-1/2">0</span>
      </div>
      <div className="relative h-40" onMouseLeave={() => setActive(null)}>
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <span className="border-t border-dashed border-border" />
          <span className="border-t border-dashed border-border" />
          <span className="border-t border-border" />
        </div>
        <ol aria-label="Attempts started per day" className="relative flex h-full items-end gap-0.5">
          {series.map((day, index) => {
            const height = (day.started / top) * 100;
            return (
              <li
                key={day.date}
                tabIndex={0}
                aria-label={`${dayLabel(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${day.started} started, ${day.submitted} submitted`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className="group flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none focus-visible:bg-muted"
              >
                <span
                  className={cn('block w-full max-w-7 rounded-t-[4px] bg-primary transition-opacity', active !== null && active !== index && 'opacity-40')}
                  style={{ height: `${height}%` }}
                />
              </li>
            );
          })}
        </ol>
        {point && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 w-36 -translate-x-1/2 -translate-y-full rounded-md border bg-card px-3 py-2 text-xs shadow-md"
            style={{ left: `clamp(4.5rem, ${((active + 0.5) / series.length) * 100}%, calc(100% - 4.5rem))` }}
          >
            <p className="font-medium">{dayLabel(point.date, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
            <p className="mt-1 flex justify-between text-muted-foreground"><span>Started</span><span className="font-medium tabular-nums text-foreground">{point.started}</span></p>
            <p className="flex justify-between text-muted-foreground"><span>Submitted</span><span className="font-medium tabular-nums text-foreground">{point.submitted}</span></p>
          </div>
        )}
      </div>
      <div />
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground" aria-hidden>
        <span>{dayLabel(series[0].date)}</span>
        <span>{dayLabel(series[series.length - 1].date)}</span>
      </div>
    </div>
  );
}
