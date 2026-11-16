// The learner's practice history, kept on their account: every attempt on
// every form, with how far it got and how many answers needed attention.
import { AlertCircle, ArrowRight, History, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { StatusBadge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { formatDateTime } from '@/lib/format.js';
import { listMyAttempts as defaultListMyAttempts } from '../../api/attempts.js';

const HEAD = 'normal-case tracking-normal';
const FORM_NOTE = { SUPERSEDED: 'An older version; the form has since been updated', WITHDRAWN: 'Removed from the catalog' };

function Result({ attempt }) {
  if (attempt.status !== 'COMPLETED') return <span className="text-muted-foreground">{attempt.answeredCount} answered so far</span>;
  if (attempt.issueCount === 0) return <span className="text-success">No problems found</span>;
  return <span>{attempt.issueCount} answer{attempt.issueCount === 1 ? '' : 's'} needed attention</span>;
}

export default function PracticeHistory({ onOpen, onBrowse, listMyAttempts = defaultListMyAttempts }) {
  const [state, setState] = useState({ status: 'loading', attempts: [] });

  const load = useCallback(() => {
    setState({ status: 'loading', attempts: [] });
    listMyAttempts().then(
      (attempts) => setState({ status: 'ready', attempts }),
      () => setState({ status: 'error', attempts: [] }),
    );
  }, [listMyAttempts]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="My practice" description="Every attempt you have made, kept on your account. Open one to continue it or to see its feedback." />
      {state.status === 'loading' && (
        <Card className="space-y-3 p-4" aria-busy="true">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}
          <span className="sr-only">Loading your practice history…</span>
        </Card>
      )}
      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertCircle />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
            Your practice history could not be loaded.
            <Button variant="outline" size="sm" onClick={load}><RefreshCw />Try again</Button>
          </div>
        </Alert>
      )}
      {state.status === 'ready' && state.attempts.length === 0 && (
        <EmptyState role="status" icon={History} title="You have not practised a form yet"
          description="Pick a form from the catalog. Your answers and results will be kept here."
          action={<Button onClick={onBrowse}>Browse practice forms</Button>} />
      )}
      {state.status === 'ready' && state.attempts.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD}>Practice form</TableHead>
                <TableHead className={HEAD}>Started</TableHead>
                <TableHead className={HEAD}>Attempt</TableHead>
                <TableHead className={HEAD}>Result</TableHead>
                <TableHead className={HEAD}><span className="sr-only">Open</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.attempts.map((attempt) => {
                const open = attempt.status === 'COMPLETED' ? 'View result' : 'Continue';
                return (
                  <TableRow key={attempt.id}>
                    <TableCell>
                      <span className="font-medium">{attempt.formTitle}</span>
                      {FORM_NOTE[attempt.formStatus] && <span className="block text-xs text-muted-foreground">{FORM_NOTE[attempt.formStatus]}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(attempt.startedAt)}</TableCell>
                    <TableCell><StatusBadge status={attempt.status} /></TableCell>
                    <TableCell><Result attempt={attempt} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => onOpen(attempt)} aria-label={`${open}: ${attempt.formTitle}, started ${formatDateTime(attempt.startedAt)}`}>
                        {open}<ArrowRight />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
