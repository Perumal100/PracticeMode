// The learner's record of help sessions: every request, its meeting link,
// and its history (requested, accepted, link changes, completed, cancelled).
import { AlertCircle, CalendarClock, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { formatDateTime } from '@/lib/format.js';
import { listMyRequests as defaultListMyRequests } from '../../api/assistance.js';
import { RequestStatus } from './RequestStatus.jsx';
import SessionTimeline, { MeetingLink } from './SessionTimeline.jsx';

export default function MySessions({ user, onBrowse, listMyRequests = defaultListMyRequests }) {
  const [state, setState] = useState({ status: 'loading', items: [] });
  const load = useCallback(() => {
    setState({ status: 'loading', items: [] });
    listMyRequests().then((items) => setState({ status: 'ready', items }), () => setState({ status: 'error', items: [] }));
  }, [listMyRequests]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="My sessions" description="Every time you asked an instructor for help, with the meeting link and what happened."
        actions={<Button variant="outline" onClick={load} disabled={state.status === 'loading'}><RefreshCw />Refresh</Button>} />
      {state.status === 'loading' && <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>}
      {state.status === 'error' && <Alert variant="destructive"><AlertCircle />Your sessions could not be loaded.</Alert>}
      {state.status === 'ready' && !state.items.length && (
        <EmptyState icon={CalendarClock} title="No sessions yet" description="Ask an instructor from any practice form, and the request appears here."
          action={onBrowse && <Button onClick={onBrowse}>Browse practice forms</Button>} />
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <ul className="space-y-4">
          {state.items.map((request) => (
            <li key={request.requestId} className="rounded-lg border bg-card p-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{request.formTitle}</p>
                  <p className="text-[13px] tabular-nums text-muted-foreground">Requested time: {formatDateTime(request.requestedSlot)}</p>
                </div>
                <RequestStatus status={request.status} />
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
                <dt className="text-muted-foreground">Your note</dt><dd className="whitespace-pre-wrap break-words">{request.note}</dd>
                {request.instructorName && (<><dt className="text-muted-foreground">Instructor</dt><dd>{request.instructorName}</dd></>)}
                {request.meetingLink && (<><dt className="text-muted-foreground">Meeting link</dt><dd><MeetingLink href={request.meetingLink} /></dd></>)}
                {request.meetingDetails && (<><dt className="text-muted-foreground">Note from the instructor</dt><dd className="whitespace-pre-wrap break-words">{request.meetingDetails}</dd></>)}
              </dl>
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] font-medium text-primary focus-visible:underline">History</summary>
                <div className="mt-3"><SessionTimeline events={request.events} viewerName={user?.displayName} /></div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
