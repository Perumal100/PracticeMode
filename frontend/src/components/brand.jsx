import { cn } from '@/lib/utils';

// Wordmark: a form with a check line, drawn once so it stays crisp at any size.
export function BrandMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-7', className)}>
      <rect width="32" height="32" rx="7" fill="var(--primary)" />
      <rect x="9" y="8" width="14" height="2.4" rx="1.2" fill="white" opacity=".55" />
      <rect x="9" y="13" width="10" height="2.4" rx="1.2" fill="white" opacity=".55" />
      <path d="M9.5 20.5l3.2 3.2 6.8-7" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Brand({ className, tone = 'dark' }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className={cn('text-[15px] font-semibold tracking-tight', tone === 'light' ? 'text-white' : 'text-foreground')}>PracticeMode</span>
    </span>
  );
}
