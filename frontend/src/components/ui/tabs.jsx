// Accessible tabs (WAI-ARIA tabs pattern) styled like shadcn/ui.
import { useRef } from 'react';
import { cn } from '@/lib/utils';

export function Tabs({ value, onValueChange, items, label, className }) {
  const refs = useRef([]);
  function onKeyDown(event, index) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + items.length) % items.length;
    refs.current[next]?.focus();
    onValueChange(items[next].value);
  }
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground', className)}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-all',
              selected ? 'bg-card text-foreground shadow-xs' : 'hover:text-foreground',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn('rounded px-1.5 text-[11px] tabular-nums', selected ? 'bg-muted' : 'bg-background/60')}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
