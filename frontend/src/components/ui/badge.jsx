import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3', {
  variants: {
    variant: {
      default: 'border-transparent bg-accent-soft text-accent-soft-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'text-muted-foreground',
      success: 'border-transparent bg-success-soft text-success',
      warning: 'border-transparent bg-warning-soft text-warning',
      destructive: 'border-transparent bg-destructive-soft text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STATUS = {
  AWAITING_REVIEW: ['warning', 'Awaiting review'],
  APPROVED: ['success', 'Approved'],
  REJECTED: ['destructive', 'Rejected'],
  FAILED: ['destructive', 'Failed'],
  SUPERSEDED: ['secondary', 'Replaced'],
  IN_PROGRESS: ['default', 'In progress'],
  COMPLETED: ['success', 'Submitted'],
};

export function StatusBadge({ status, className }) {
  const [variant, label] = STATUS[status] ?? ['secondary', status];
  return (
    <Badge variant={variant} className={className}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}
