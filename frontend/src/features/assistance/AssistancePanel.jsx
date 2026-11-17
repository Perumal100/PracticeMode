// US-03: a learner asks an instructor for a live session about this attempt
// and follows the request until it is scheduled.
import { Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Input, Label, Textarea } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { formatDateTime } from '@/lib/format.js';
import * as defaultApi from '../../api/assistance.js';
import { RequestStatus, isOpen } from './RequestStatus.jsx';

const NOTE_LIMIT = 1000;
const CLOSED_TEXT = { COMPLETED: 'Your last session is marked as completed.', CANCELLED: 'Your last request was cancelled.' };

function check(slot, note, now) {
  const errors = {};
  if (!slot) errors.slot = 'Choose a date and time for the session.';
  else if (Number.isNaN(new Date(slot).getTime()) || new Date(slot).getTime() <= now) errors.slot = 'Choose a time in the future.';
  if (!note.trim()) errors.note = 'Say what you need help with.';
  return errors;
}

export default function AssistancePanel({ attemptId, api = {}, now = Date.now }) {
  const listAttemptRequests = api.listAttemptRequests ?? defaultApi.listAttemptRequests;
  const createRequest = api.createRequest ?? defaultApi.createRequest;
  const cancelRequest = api.cancelRequest ?? defaultApi.cancelRequest;
  const [state, setState] = useState({ status: 'loading', request: null });
  const [formOpen, setFormOpen] = useState(false);
  const [slot, setSlot] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(() => {
    setState((current) => ({ ...current, status: current.request ? 'refreshing' : 'loading' }));
    return listAttemptRequests(attemptId).then(
      (requests) => setState({ status: 'ready', request: requests[0] ?? null }),
      () => setState((current) => ({ status: 'error', request: current.request })),
    );
  }, [attemptId, listAttemptRequests]);

  useEffect(() => { load(); }, [load]);

  async function send() {
    const found = check(slot, note, now());
    setErrors(found);
    if (Object.keys(found).length) return; // AC-03: nothing is sent until the request is complete
    setBusy(true);
    try {
      const request = await createRequest({ attemptId, requestedSlot: new Date(slot).toISOString(), note: note.trim() });
      setState({ status: 'ready', request });
      setFormOpen(false);
      setSlot('');
      setNote('');
    } catch (error) {
      if (error?.status === 409) {
        await load();
        setFormOpen(false);
      } else if (error?.status === 400) {
        setErrors({
          slot: error.body?.requestedSlot?.[0],
          note: error.body?.note?.[0],
          form: error.body?.requestedSlot || error.body?.note ? undefined : 'The request is not valid. Check the details and try again.',
        });
      } else {
        setErrors({ form: 'Your request could not be sent. Please try again.' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const request = await cancelRequest(state.request.requestId);
      setState({ status: 'ready', request });
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  }

  const { request } = state;
  let body;
  if (state.status === 'loading') {
    body = <Skeleton className="h-9" />;
  } else if (state.status === 'error' && !request) {
    body = (
      <div className="space-y-3">
        <p role="status" className="text-sm text-muted-foreground">Your help requests could not be loaded.</p>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw />Try again</Button>
      </div>
    );
  } else if (isOpen(request)) {
    const scheduled = request.status === 'SCHEDULED';
    body = (
      <div className="space-y-3">
        <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
          <RequestStatus status={request.status} />
          <span>{scheduled ? 'Your session is booked.' : 'Request sent. An instructor will reply with meeting details.'}</span>
        </div>
        <dl className="space-y-2 text-[13px]">
          <div><dt className="text-muted-foreground">Requested time</dt><dd>{formatDateTime(request.requestedSlot)}</dd></div>
          {scheduled && <div><dt className="text-muted-foreground">Instructor</dt><dd>{request.instructorName || 'An instructor'}</dd></div>}
          {scheduled && <div><dt className="text-muted-foreground">Meeting details</dt><dd className="whitespace-pre-wrap break-words">{request.meetingDetails}</dd></div>}
          <div><dt className="text-muted-foreground">Your note</dt><dd className="whitespace-pre-wrap break-words">{request.note}</dd></div>
        </dl>
        {state.status === 'error' && <p className="text-[13px] text-destructive">The status could not be refreshed.</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={state.status === 'refreshing'}>
            {state.status === 'refreshing' ? <Loader2 className="animate-spin" /> : <RefreshCw />}Check for updates
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmCancel(true)} disabled={busy}>Cancel request</Button>
        </div>
      </div>
    );
  } else if (formOpen) {
    // This panel sits inside the attempt's form, so Enter must not submit the attempt.
    const onEnter = (event) => { if (event.key === 'Enter') { event.preventDefault(); send(); } };
    body = (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="assistance-slot">When would you like to meet?</Label>
          <Input id="assistance-slot" type="datetime-local" value={slot} onChange={(e) => setSlot(e.target.value)} onKeyDown={onEnter}
            aria-invalid={errors.slot ? true : undefined} aria-describedby={errors.slot ? 'assistance-slot-error' : undefined} />
          {errors.slot && <p id="assistance-slot-error" className="text-[13px] font-medium text-destructive">{errors.slot}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assistance-note">What do you need help with?</Label>
          <Textarea id="assistance-note" rows={3} maxLength={NOTE_LIMIT} value={note} onChange={(e) => setNote(e.target.value)}
            aria-invalid={errors.note ? true : undefined} aria-describedby={errors.note ? 'assistance-note-error' : undefined} />
          {errors.note && <p id="assistance-note-error" className="text-[13px] font-medium text-destructive">{errors.note}</p>}
        </div>
        {errors.form && <p role="alert" className="text-[13px] font-medium text-destructive">{errors.form}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={send} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Send request</Button>
          <Button variant="ghost" size="sm" onClick={() => { setFormOpen(false); setErrors({}); }} disabled={busy}>Not now</Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {CLOSED_TEXT[request?.status] ?? 'Stuck on a question? Ask for a live session and an instructor will reply with meeting details.'}
        </p>
        <Button variant="outline" size="sm" className="w-full" onClick={() => setFormOpen(true)}>Ask an instructor</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Help from an instructor</CardTitle></CardHeader>
      <CardContent>{body}</CardContent>
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this help request?</AlertDialogTitle>
            <AlertDialogDescription>The instructor will no longer see it as open. You can ask again at any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep request</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={cancel}>Cancel request</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
