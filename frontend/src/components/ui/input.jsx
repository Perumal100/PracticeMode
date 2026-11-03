import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const fieldClasses = 'w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20';

export const Input = forwardRef(function Input({ className, type = 'text', ...props }, ref) {
  return <input ref={ref} type={type} className={cn(fieldClasses, 'h-9', className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldClasses, 'min-h-20 py-2 leading-relaxed', className)} {...props} />;
});

export const NativeSelect = forwardRef(function NativeSelect({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(fieldClasses, 'h-9 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9', className)}
      {...props}
    >
      {children}
    </select>
  );
});

export function Label({ className, ...props }) {
  // eslint-disable-next-line jsx-a11y/label-has-associated-control
  return <label className={cn('text-sm font-medium leading-none text-foreground', className)} {...props} />;
}

export function Checkbox({ className, ...props }) {
  return <input type="checkbox" className={cn('mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-[var(--primary)] disabled:cursor-not-allowed', className)} {...props} />;
}
