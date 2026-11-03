import { ChevronRight } from 'lucide-react';

export function PageHeader({ title, description, breadcrumb, actions, meta }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && (
          <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[13px] text-muted-foreground">
            {breadcrumb.map((crumb, i) => (
              <span key={crumb.label} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5" />}
                {crumb.onClick ? (
                  <button type="button" onClick={crumb.onClick} className="hover:text-foreground">{crumb.label}</button>
                ) : (
                  <span aria-current="page" className="text-foreground">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
