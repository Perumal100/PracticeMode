// US-02: the learner's home. Search approved practice forms by keyword and
// several categories, and pick up attempts already started in this browser.
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, FileText, Layers, Search, SearchX, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { StatCard } from '@/components/stat-card.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { Badge, StatusBadge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { cn } from '@/lib/utils';
import { listForms as defaultListForms } from '../../api/catalog.js';
import { storedAttempts } from '../practice/attemptStore.js';

export default function Catalog({ user, onOpen, listForms = defaultListForms }) {
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState([]);
  const [allForms, setAllForms] = useState(null);
  const [state, setState] = useState({ status: 'loading', forms: [], error: null });
  const attempts = useMemo(() => (user ? storedAttempts(user.id) : {}), [user]);

  async function search(filters) {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const forms = await listForms(filters);
      setState({ status: 'ready', forms, error: null });
      return forms;
    } catch (error) {
      setState({
        status: 'error',
        forms: [],
        error: error?.status === 400 ? 'Those search terms are not valid. Shorten them and try again.' : 'The form list could not be loaded. Please try again.',
      });
      return null;
    }
  }

  useEffect(() => {
    // The unfiltered list supplies the category choices and the totals.
    search({}).then((forms) => forms && setAllForms(forms));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(() => [...new Set((allForms ?? []).flatMap((f) => f.categories ?? []))].sort(), [allForms]);
  const counts = useMemo(() => {
    const ids = new Set((allForms ?? []).map((f) => f.id));
    const mine = Object.entries(attempts).filter(([formId]) => ids.has(formId)).map(([, a]) => a.status);
    return { inProgress: mine.filter((s) => s === 'IN_PROGRESS').length, completed: mine.filter((s) => s === 'COMPLETED').length };
  }, [allForms, attempts]);
  const filtered = keyword.trim() !== '' || selected.length > 0;

  function toggle(category) {
    const next = selected.includes(category) ? selected.filter((c) => c !== category) : [...selected, category];
    setSelected(next);
  }

  function submit(event) {
    event.preventDefault();
    search({ keyword, categories: selected });
  }

  function clear() {
    setKeyword('');
    setSelected([]);
    search({});
  }

  return (
    <>
      <PageHeader
        title="Practice forms"
        description="Every form here has been checked by a Form Reviewer. Use made-up details; nothing you enter is sent to the real website."
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Available forms" value={allForms?.length ?? 0} icon={FileText} loading={!allForms} hint={`${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`} />
        <StatCard label="In progress" value={counts.inProgress} icon={Clock3} tone="warning" loading={!allForms} hint="Saved automatically as you type" />
        <StatCard label="Submitted" value={counts.completed} icon={CheckCircle2} tone="success" loading={!allForms} hint="With feedback on each answer" />
      </div>

      <form role="search" onSubmit={submit} className="mt-8 flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-xs">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="catalog-search" className="sr-only">Search by title</label>
            <Input id="catalog-search" value={keyword} maxLength={200} onChange={(e) => setKeyword(e.target.value)} placeholder="Search by title, e.g. housing" className="pl-9" />
          </div>
          <Button type="submit">Search</Button>
          {filtered && <Button variant="ghost" onClick={clear}><X />Clear</Button>}
        </div>
        {categories.length > 0 && (
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="sr-only">Categories</legend>
            <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Layers className="size-3.5" />Categories</span>
            {categories.map((category) => {
              const on = selected.includes(category);
              return (
                <label key={category} className={cn('cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:border-input hover:text-foreground')}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(category)} />
                  {category}
                </label>
              );
            })}
          </fieldset>
        )}
      </form>

      <div className="mt-6">
        {state.status === 'loading' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
          </div>
        )}
        {state.status === 'error' && <Alert variant="destructive"><AlertCircle />{state.error}</Alert>}
        {state.status === 'ready' && state.forms.length === 0 && (
          <EmptyState
            role="status"
            icon={SearchX}
            title={filtered ? 'No practice forms match your search' : 'No practice forms yet'}
            description={filtered ? 'Try other words or fewer categories.' : 'Forms appear here once a Form Reviewer approves them.'}
            action={filtered && <Button variant="outline" onClick={clear}>Clear filters</Button>}
          />
        )}
        {state.status === 'ready' && state.forms.length > 0 && (
          <>
            <p className="mb-3 text-[13px] text-muted-foreground">{state.forms.length} form{state.forms.length === 1 ? '' : 's'}</p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.forms.map((form) => {
                const attempt = attempts[form.id];
                return (
                  <li key={form.id}>
                    <Card className="group flex h-full flex-col p-5 transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid size-9 place-items-center rounded-md bg-muted text-muted-foreground"><FileText className="size-4" /></span>
                        {attempt && <StatusBadge status={attempt.status} />}
                      </div>
                      <h3 className="mt-4 font-semibold leading-snug">{form.title}</h3>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(form.categories ?? []).map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
                      </div>
                      <div className="mt-auto pt-5">
                        <Button variant={attempt ? 'outline' : 'default'} size="sm" className="w-full" onClick={() => onOpen(form.id)} aria-label={`${attempt ? (attempt.status === 'COMPLETED' ? 'View result' : 'Continue') : 'Practise'}: ${form.title}`}>
                          {attempt ? (attempt.status === 'COMPLETED' ? 'View result' : 'Continue') : 'Practise'}
                          <ArrowRight />
                        </Button>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
