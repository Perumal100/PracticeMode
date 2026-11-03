import { Card } from './ui/card.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { cn } from '@/lib/utils';

export function StatCard({ label, value, hint, icon: Icon, tone = 'default', loading }) {
  const tones = {
    default: 'bg-accent-soft text-accent-soft-foreground',
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
    destructive: 'bg-destructive-soft text-destructive',
  };
  return (
    <Card className="p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground sm:text-[13px]">{label}</p>
        {Icon && <span className={cn('hidden size-8 place-items-center rounded-md sm:grid', tones[tone])}><Icon className="size-4" /></span>}
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{value}</p>}
      {hint && <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{hint}</p>}
    </Card>
  );
}
