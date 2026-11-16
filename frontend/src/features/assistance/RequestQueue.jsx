// US-05: the instructor's queue. Waiting requests are visible to every
// instructor; an accepted one only to the instructor who took it.
import { AlertCircle, ArrowRight, CalendarCheck, Inbox, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { Tabs } from '@/components/ui/tabs.jsx';
import { formatDateTime } from '@/lib/format.js';
import { listRequests as defaultListRequests } from '../../api/assistance.js';

const TABS = [['REQUESTED', 'Waiting'], ['SCHEDULED', 'Accepted by me'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled']];
const EMPTY = {
  REQUESTED: [Inbox, 'No requests are waiting', 'When a learner asks for help from a practice form, the request appears here for every instructor.'],
  SCHEDULED: [CalendarCheck, 'You have no sessions booked', 'Accept a waiting request to book a session.'],
  COMPLETED: [CalendarCheck, 'No completed sessions yet', 'Sessions you mark as completed are listed here.'],
  CANCELLED: [CalendarCheck, 'No cancelled sessions', 'Sessions of yours that were cancelled are listed here.'],
};
const HEAD = 'normal-case tracking-normal';

export function assistanceErrorMessage(error) {
  if (error?.status === 401) return 'Your session has ended. Sign in again.';
  if (error?.status === 403) return 'This request is not available to you. Another instructor may have accepted it, or the learner cancelled it.';
  if (error?.status === 404) return 'This request does not exist.';
  return 'The requests could not be loaded. Please try again.';
}

export function LearnerName({ request }) {
  return (
    <>
      <span className="font-medium">{request.learnerName || 'Learner'}</span>
      <span className="block text-xs tabular-nums text-muted-foreground">Code {request.learnerCode}</span>
    </>
  );
}

export default function RequestQueue({ status = 'REQUESTED', onStatusChange, onOpen, api = {} }) {
  const listRequests = api.listRequests ?? defaultListRequests;
  const [state, setState] = useState({ status: 'loading', requests: [], error: null });
  const tab = TABS.some(([value]) => value === status) ? status : 'REQUESTED';

  const load = useCallback(() => {
    setState((current) => ({ ...current, status: 'loading', error: null }));
    listRequests().then(
      (requests) => setState({ status: 'ready', requests, error: null }),
      (error) => setState({ status: 'error', requests: [], error: error?.status === 403 ? 'Only instructors can open assistance requests.' : assistanceErrorMessage(error) }),
    );
  }, [listRequests]);

  useEffect(() => { load(); }, [load]);

  const count = (value) => state.requests.filter((r) => r.status === value).length;
  const rows = state.requests.filter((r) => r.status === tab);
  const [EmptyIcon, emptyTitle, emptyText] = EMPTY[tab];

  return (
    <>
      <PageHeader
        title="Assistance requests"
        description="A waiting request is open to every instructor. Once you accept one, only you and the learner can see it."
        actions={<Button variant="outline" onClick={load} disabled={state.status === 'loading'}><RefreshCw />Refresh</Button>}
      />
      {state.status === 'error' ? (
        <Alert variant="destructive"><AlertCircle />{state.error}</Alert>
      ) : (
        <>
          <Tabs
            label="Request status"
            value={tab}
            onValueChange={onStatusChange}
            items={TABS.map(([value, label]) => ({ value, label, count: state.status === 'ready' ? count(value) : undefined }))}
            className="max-w-full overflow-x-auto"
          />
          <div className="mt-4">
            {state.status === 'loading' && (
              <Card className="space-y-3 p-4" aria-busy="true">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}
                <span className="sr-only">Loading requests…</span>
              </Card>
            )}
            {state.status === 'ready' && rows.length === 0 && <EmptyState role="status" icon={EmptyIcon} title={emptyTitle} description={emptyText} />}
            {state.status === 'ready' && rows.length > 0 && (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={HEAD}>Learner</TableHead>
                      <TableHead className={HEAD}>Practice form</TableHead>
                      <TableHead className={HEAD}>Requested time</TableHead>
                      <TableHead className={HEAD}>What they need</TableHead>
                      <TableHead className={HEAD}><span className="sr-only">Open</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((request) => (
                      <TableRow key={request.requestId}>
                        <TableCell><LearnerName request={request} /></TableCell>
                        <TableCell>{request.formTitle}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(request.requestedSlot)}</TableCell>
                        <TableCell className="max-w-64 truncate text-muted-foreground">{request.note}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => onOpen(request.requestId)} aria-label={`Open request from ${request.learnerName || 'learner'} ${request.learnerCode}`}>
                            Open<ArrowRight />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}
