// US-22: progress of the learners whose request this instructor accepted,
// filtered by unfinished attempts, repeated errors or frequent hint use.
// The filters live in the URL, so a reload keeps them.
import { AlertCircle, SearchX, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { StatusBadge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { NativeSelect } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { timeAgo } from '@/lib/format.js';
import { cn } from '@/lib/utils';
import { listProgress as defaultListProgress } from '../../api/assistance.js';
import { LearnerName } from './RequestQueue.jsx';

export const ERROR_THRESHOLD = 2;
export const HINT_THRESHOLD = 3;
// Each toggle sets one API filter to a fixed value.
const TOGGLES = [
  { key: 'incomplete', value: 'true', label: 'Unfinished attempts' },
  { key: 'minErrors', value: String(ERROR_THRESHOLD), label: `Repeated errors (${ERROR_THRESHOLD} or more)` },
  { key: 'minHints', value: String(HINT_THRESHOLD), label: `Frequent hint use (${HINT_THRESHOLD} or more)` },
];
const FILTER_KEYS = ['incomplete', 'minErrors', 'minHints', 'formId', 'learnerCode'];
const HEAD = 'normal-case tracking-normal';

function progressError(error) {
  if (error?.status === 401) return 'Your session has ended. Sign in again.';
  if (error?.status === 403) return error.code === 'PROGRESS_FORBIDDEN'
    ? 'You can only see progress for learners whose request you accepted.'
    : 'Only instructors can open learner progress.';
  return 'Learner progress could not be loaded. Please try again.';
}

export default function LearnerProgress({ query = {}, onQueryChange, listProgress = defaultListProgress }) {
  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.filter((key) => query[key]).map((key) => [key, query[key]])), [query]);
  const filterKey = JSON.stringify(filters);
  const [state, setState] = useState({ status: 'loading', rows: [], error: null });
  // The unfiltered list supplies the form choices and the total.
  const [everything, setEverything] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listProgress({}).then((rows) => !cancelled && setEverything(rows), () => !cancelled && setEverything([]));
    return () => { cancelled = true; };
  }, [listProgress]);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: 'loading', error: null }));
    listProgress(JSON.parse(filterKey)).then(
      (rows) => !cancelled && setState({ status: 'ready', rows, error: null }),
      (error) => !cancelled && setState({ status: 'error', rows: [], error: progressError(error) }),
    );
    return () => { cancelled = true; };
  }, [filterKey, listProgress]);

  const forms = useMemo(() => {
    const byId = new Map((everything ?? []).map((row) => [row.formId, row.formTitle]));
    return [...byId].sort((a, b) => a[1].localeCompare(b[1]));
  }, [everything]);
  const filtered = Object.keys(filters).length > 0;
  const set = (key, value) => {
    const next = { ...filters };
    if (value) next[key] = value; else delete next[key];
    onQueryChange(next);
  };

  return (
    <>
      <PageHeader
        title="Learner progress"
        description="Attempts by learners whose assistance request you accepted. Counts only; you never see what a learner typed."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Show only</legend>
          {TOGGLES.map((toggle) => {
            const on = filters[toggle.key] === toggle.value;
            return (
              <label key={toggle.key} className={cn('cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors active:translate-y-px has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:border-input hover:text-foreground')}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => set(toggle.key, on ? null : toggle.value)} />
                {toggle.label}
              </label>
            );
          })}
        </fieldset>
        <div className="flex items-center gap-2 sm:ml-auto">
          <label htmlFor="progress-form" className="whitespace-nowrap text-[13px] font-medium text-muted-foreground">Practice form</label>
          <NativeSelect id="progress-form" className="w-56" value={filters.formId ?? ''} onChange={(e) => set('formId', e.target.value)}>
            <option value="">All forms</option>
            {forms.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </NativeSelect>
          {filtered && <Button variant="ghost" onClick={() => onQueryChange({})}><X />Clear</Button>}
        </div>
      </div>
      {filters.learnerCode && <p className="mt-3 text-[13px] text-muted-foreground">Showing one learner, code <span className="tabular-nums text-foreground">{filters.learnerCode}</span>.</p>}

      <div className="mt-4">
        {state.status === 'loading' && (
          <Card className="space-y-3 p-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
            <span className="sr-only">Loading progress…</span>
          </Card>
        )}
        {state.status === 'error' && <Alert variant="destructive"><AlertCircle />{state.error}</Alert>}
        {state.status === 'ready' && state.rows.length === 0 && (
          filtered ? (
            <EmptyState role="status" icon={SearchX} title="No attempts match these filters" description="Try fewer filters or another form."
              action={<Button variant="outline" onClick={() => onQueryChange({})}>Clear filters</Button>} />
          ) : (
            <EmptyState role="status" icon={Users} title="No learner progress to show yet"
              description="Progress appears for learners once you accept their assistance request." />
          )
        )}
        {state.status === 'ready' && state.rows.length > 0 && (
          <>
            <p role="status" className="mb-2 text-[13px] text-muted-foreground">
              {state.rows.length} attempt{state.rows.length === 1 ? '' : 's'}{filtered && everything ? ` of ${everything.length}` : ''}
            </p>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={HEAD}>Learner</TableHead>
                    <TableHead className={HEAD}>Practice form</TableHead>
                    <TableHead className={HEAD}>Attempt</TableHead>
                    <TableHead className={cn(HEAD, 'text-right')}>Errors</TableHead>
                    <TableHead className={cn(HEAD, 'text-right')}>Hint views</TableHead>
                    <TableHead className={HEAD}>Last saved</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.rows.map((row) => (
                    <TableRow key={row.attemptId}>
                      <TableCell><LearnerName request={row} /></TableCell>
                      <TableCell>{row.formTitle}</TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell className={cn('text-right tabular-nums', row.validationErrorCount >= ERROR_THRESHOLD && 'font-semibold text-destructive')}>{row.validationErrorCount}</TableCell>
                      <TableCell className={cn('text-right tabular-nums', row.hintViewCount >= HINT_THRESHOLD && 'font-semibold text-warning')}>{row.hintViewCount}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{row.lastSavedAt ? timeAgo(row.lastSavedAt) : 'Not saved yet'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <p className="mt-2 text-xs text-muted-foreground">Errors are counted when an attempt is submitted. Hint views are counted each time a learner opens a hint.</p>
          </>
        )}
      </div>
    </>
  );
}
