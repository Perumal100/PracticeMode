// Signed-in layout: a fixed sidebar on wide screens, a compact top bar on small ones.
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Brand } from './brand.jsx';

const ROLE_LABEL = { LEARNER: 'Learner', FORM_REVIEWER: 'Form reviewer', INSTRUCTOR: 'Instructor' };

function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function AppShell({ user, nav, active, onNavigate, onSignOut, children }) {
  const navItems = nav.map((item) => {
    const Icon = item.icon;
    const current = item.key === active;
    return (
      <a
        key={item.key}
        href={`#${item.path}`}
        aria-current={current ? 'page' : undefined}
        onClick={(e) => { e.preventDefault(); onNavigate(item.path); }}
        className={cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
          current ? 'bg-sidebar-active text-white' : 'text-sidebar-foreground hover:bg-sidebar-active/60 hover:text-white',
        )}
      >
        <Icon className="size-4" />
        {item.label}
      </a>
    );
  });

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <div className="hidden bg-sidebar lg:block">
      <aside className="flex flex-col px-3 py-4 lg:sticky lg:top-0 lg:h-dvh">
        <div className="px-2 pb-6"><Brand tone="light" /></div>
        <p className="px-2.5 pb-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">Workspace</p>
        <nav aria-label="Main" className="flex flex-col gap-0.5">{navItems}</nav>
        <div className="mt-auto flex items-center gap-3 rounded-lg border border-white/10 p-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials(user.displayName)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.displayName || 'Signed in'}</p>
            <p className="text-xs text-sidebar-muted">{ROLE_LABEL[user.role] ?? user.role}</p>
          </div>
          <button type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out" className="rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-active hover:text-white">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>
      </div>

      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Brand />
          <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
        {nav.length > 1 && <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-2 [&_a]:text-muted-foreground [&_a[aria-current]]:bg-muted [&_a[aria-current]]:text-foreground">{navItems}</nav>}
      </header>

      <main className="min-w-0">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
