// US-05: one assistance request, with what an instructor needs to prepare
// and the actions STM-03 allows: accept, complete, cancel.
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Input, Label, Textarea } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { formatDateTime } from '@/lib/format.js';
import * as defaultApi from '../../api/assistance.js';
import { getOwnProfile as defaultGetOwnProfile } from '../../api/instructors.js';
import ReportProblem from '../instructors/ReportProblem.jsx';
import { LearnerName, assistanceErrorMessage } from './RequestQueue.jsx';
import { RequestStatus } from './RequestStatus.jsx';
import SessionTimeline, { MeetingLink } from './SessionTimeline.jsx';

const DETAILS_LIMIT = 1000;

function Row({ label, children }) {
  return (
    <div className="grid gap-1 px-5 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export default function RequestDetail({ requestId, onBack, onProgress, user, api = {} }) {
  const getRequest = api.getRequest ?? defaultApi.getRequest;
  const scheduleRequest = api.scheduleRequest ?? defaultApi.scheduleRequest;
  const completeRequest = api.completeRequest ?? defaultApi.completeRequest;
  const cancelRequest = api.cancelRequest ?? defaultApi.cancelRequest;
  const getOwnProfile = api.getOwnProfile ?? defaultGetOwnProfile;
  const [link, setLink] = useState('');
  const [editingMeeting, setEditingMeeting] = useState(false);
  const [state, setState] = useState({ status: 'loading', request: null, error: null });
  const [details, setDetails] = useState('');
  const [action, setAction] = useState({ busy: null, error: null, fieldError: null });
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The default link is offered for every new session; it can be changed for this one.
    getOwnProfile().then((profile) => !cancelled && setLink((current) => current || profile.meetingLink || ''), () => {});
    getRequest(requestId).then(
      (request) => {
        if (cancelled) return;
        setState({ status: 'ready', request, error: null });
        if (request.meetingLink) setLink(request.meetingLink);
        if (request.meetingDetails) setDetails(request.meetingDetails);
      },
      (error) => !cancelled && setState({ status: 'error', request: null, error: assistanceErrorMessage(error) }),
    );
    return () => { cancelled = true; };
  }, [requestId, getRequest]);

  const breadcrumb = (label) => [{ label: 'Assistance requests', onClick: onBack }, { label }];

  if (state.status === 'loading') {
    return (
      <>
        <PageHeader title={<Skeleton className="h-7 w-56" />} breadcrumb={breadcrumb('…')} />
        <Skeleton className="h-72 rounded-lg" />
      </>
    );
  }
  if (state.status === 'error') {
    return (
      <>
        <PageHeader title="Request unavailable" breadcrumb={breadcrumb('Unavailable')} />
        <Alert variant="destructive"><AlertCircle />{state.error}</Alert>
        <Button variant="outline" className="mt-4" onClick={onBack}>Back to assistance requests</Button>
      </>
    );
  }

  const { request } = state;

  async function run(name, call) {
    setAction({ busy: name, error: null, fieldError: null });
    try {
      const updated = await call();
      setState({ status: 'ready', request: updated, error: null });
      setAction({ busy: null, error: null, fieldError: null });
    } catch (error) {
      if (error?.status === 403 || (error?.status === 409 && error.code === 'REQUEST_ALREADY_SCHEDULED')) {
        // Someone else got there first; the request is no longer this instructor's to read.
        setState({ status: 'error', request: null, error: error.status === 409 ? 'Another instructor has already accepted this request.' : assistanceErrorMessage(error) });
      } else if (error?.status === 400 && error.body?.meetingDetails) {
        setAction({ busy: null, error: null, fieldError: error.body.meetingDetails[0] });
      } else {
        setAction({ busy: null, error: error?.status === 409 ? 'This request has already been closed.' : 'The change could not be saved. Please try again.', fieldError: null });
      }
    }
  }

  function accept(event) {
    event.preventDefault();
    let valid = false;
    try {
      valid = ['http:', 'https:'].includes(new URL(link.trim()).protocol);
    } catch { /* not a link */ }
    if (!valid) {
      setAction({ busy: null, error: null, fieldError: 'Enter the meeting link, starting with https://' });
      return;
    }
    run('schedule', async () => {
      const updated = await scheduleRequest(request.requestId, { meetingLink: link.trim(), meetingDetails: details.trim() });
      setEditingMeeting(false);
      return updated;
    });
  }

  const meetingForm = (submitLabel) => (
    <form onSubmit={accept} noValidate>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="meeting-link">Meeting link</Label>
          <Input id="meeting-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://"
            aria-invalid={action.fieldError ? true : undefined} aria-describedby="meeting-link-note" />
          <p id="meeting-link-note" className={action.fieldError ? 'text-[13px] font-medium text-destructive' : 'text-xs text-muted-foreground'}>
            {action.fieldError || 'Your default link is filled in. Change it if this session uses a different one.'}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meeting-details">Note for the learner (optional)</Label>
          <Textarea id="meeting-details" rows={3} maxLength={DETAILS_LIMIT} value={details} onChange={(e) => setDetails(e.target.value)}
            placeholder="For example, a different time, or what to have ready" />
        </div>
        {action.error && <Alert variant="destructive"><AlertCircle />{action.error}</Alert>}
      </CardContent>
      <CardFooter className="flex-wrap">
        <Button type="submit" disabled={Boolean(action.busy)}>{action.busy === 'schedule' && <Loader2 className="animate-spin motion-reduce:animate-none" />}{submitLabel}</Button>
        {editingMeeting && <Button variant="ghost" onClick={() => setEditingMeeting(false)}>Cancel</Button>}
      </CardFooter>
    </form>
  );

  let session;
  if (request.status === 'REQUESTED') {
    session = (
      <>
        <CardHeader>
          <CardTitle>Accept this request</CardTitle>
          <CardDescription>The learner sees your name, the meeting link and your note on their practice form.</CardDescription>
        </CardHeader>
        {meetingForm('Accept and schedule')}
      </>
    );
  } else if (request.status === 'SCHEDULED' && editingMeeting) {
    session = (
      <>
        <CardHeader>
          <CardTitle>Change the meeting</CardTitle>
          <CardDescription>The learner sees the new link straight away, and the change is kept in the history.</CardDescription>
        </CardHeader>
        {meetingForm('Save meeting')}
      </>
    );
  } else {
    const scheduled = request.status === 'SCHEDULED';
    session = (
      <>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>
            {scheduled ? 'Booked with you. Mark it as completed after you have met.' : request.status === 'COMPLETED' ? 'This session took place.' : 'This session was cancelled.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-[13px] text-muted-foreground">Meeting link</p>
            {request.meetingLink ? <MeetingLink href={request.meetingLink} className="text-sm" /> : <p className="text-sm">None was recorded.</p>}
          </div>
          {request.meetingDetails && (
            <div>
              <p className="text-[13px] text-muted-foreground">Note for the learner</p>
              <p className="whitespace-pre-wrap break-words text-sm">{request.meetingDetails}</p>
            </div>
          )}
          {action.error && <Alert variant="destructive"><AlertCircle />{action.error}</Alert>}
        </CardContent>
        {scheduled && (
          <CardFooter className="flex-wrap">
            <Button onClick={() => run('complete', () => completeRequest(request.requestId))} disabled={Boolean(action.busy)}>
              {action.busy === 'complete' && <Loader2 className="animate-spin motion-reduce:animate-none" />}Mark as completed
            </Button>
            <Button variant="outline" onClick={() => setEditingMeeting(true)} disabled={Boolean(action.busy)}>Change meeting</Button>
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmCancel(true)} disabled={Boolean(action.busy)}>Cancel session</Button>
          </CardFooter>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Request from ${request.learnerName || 'a learner'}`}
        breadcrumb={breadcrumb(request.learnerName || 'Request')}
        meta={<RequestStatus status={request.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader><CardTitle>What the learner asked for</CardTitle></CardHeader>
          <dl className="divide-y">
            <Row label="Learner">
              <LearnerName request={request} />
              {/* US-22: progress is readable once this instructor has accepted the request. */}
              {onProgress && request.instructorName && request.status !== 'CANCELLED' && (
                <Button variant="link" size="sm" className="mt-1" onClick={() => onProgress(request.learnerCode)}>View this learner’s progress</Button>
              )}
            </Row>
            <Row label="Practice form">{request.formTitle}</Row>
            <Row label="Requested time"><span className="tabular-nums">{formatDateTime(request.requestedSlot)}</span></Row>
            <Row label="What they need help with"><span className="whitespace-pre-wrap break-words">{request.note}</span></Row>
            <Row label="Asked on"><span className="tabular-nums">{formatDateTime(request.createdAt)}</span></Row>
          </dl>
        </Card>
        <div className="space-y-6">
          <Card className="h-fit">{session}</Card>
          <Card className="h-fit">
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent><SessionTimeline events={request.events} viewerName={user?.displayName} /></CardContent>
          </Card>
          <ReportProblem formId={request.formId} formTitle={request.formTitle} getForm={api.getPublishedForm} createChangeRequest={api.createChangeRequest} />
        </div>
      </div>
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
            <AlertDialogDescription>The learner will see it as cancelled and can send a new request. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep session</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run('cancel', () => cancelRequest(request.requestId))}>Cancel session</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
