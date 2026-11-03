import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative flex gap-3 rounded-lg border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', {
  variants: {
    variant: {
      default: 'bg-card',
      info: 'border-accent-soft-foreground/15 bg-accent-soft text-accent-soft-foreground',
      success: 'border-success/20 bg-success-soft text-success',
      warning: 'border-warning/25 bg-warning-soft text-warning',
      destructive: 'border-destructive/25 bg-destructive-soft text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Alert({ className, variant, role, ...props }) {
  return <div role={role ?? (variant === 'destructive' ? 'alert' : 'status')} className={cn(alertVariants({ variant }), className)} {...props} />;
}
export function AlertTitle({ className, ...props }) {
  return <p className={cn('font-medium leading-snug', className)} {...props} />;
}
export function AlertDescription({ className, ...props }) {
  return <div className={cn('text-[13px] leading-relaxed opacity-90', className)} {...props} />;
}
