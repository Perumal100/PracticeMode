import { cn } from '@/lib/utils';

export function Card({ className, ...props }) {
  return <div className={cn('rounded-lg border bg-card text-card-foreground shadow-xs', className)} {...props} />;
}
export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1 border-b px-5 py-4', className)} {...props} />;
}
export function CardTitle({ className, as: Comp = 'h3', ...props }) {
  return <Comp className={cn('text-sm font-semibold leading-none tracking-tight', className)} {...props} />;
}
export function CardDescription({ className, ...props }) {
  return <p className={cn('text-[13px] text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}
export function CardFooter({ className, ...props }) {
  return <div className={cn('flex items-center gap-2 border-t px-5 py-3', className)} {...props} />;
}
