import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon, title, description, action, className, role }) {
  return (
    <div role={role} className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-14 text-center', className)}>
      {Icon && <span className="mb-4 grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-5" /></span>}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
