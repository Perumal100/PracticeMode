// US-15: a learner asks for a real form to be made into a practice copy and
// follows what happens to the request.
import { AlertCircle, ArrowRight, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Input, Label, Textarea } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { formatDateTime, hostOf } from '@/lib/format.js';
import * as defaultApi from '../../api/formRequests.js';

const STATE = {
  RECEIVED: ['warning', 'Received'],
  AWAITING_REVIEW: ['default', 'Being checked'],
  AVAILABLE: ['success', 'Ready to practise'],
  NOT_AVAILABLE: ['destructive', 'Not available'],
};

function looksLikeLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export default function RequestForm({ onOpenForm, api = {} }) {
  const listMyRequests = api.listMyRequests ?? defaultApi.listMyRequests;
  const requestForm = api.requestForm ?? defaultApi.requestForm;
  const [requests, setRequests] = useState({ status: 'loading', items: [] });
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState({ busy: false, error: null, available: null, sent: false });

  const load = useCallback(() => {
    setRequests((current) => ({ ...current, status: 'loading' }));
    listMyRequests().then(
      (items) => setRequests({ status: 'ready', items }),
      () => setRequests({ status: 'error', items: [] }),
    );
  }, [listMyRequests]);

  useEffect(() => { load(); }, [load]);

  async function submit(event) {
    event.preventDefault();
    const link = url.trim();
    if (!looksLikeLink(link)) {
      setResult({ busy: false, error: 'Paste a full link, starting with https://', available: null, sent: false });
      return;
    }
    setResult({ busy: true, error: null, available: null, sent: false });
    try {
      const created = await requestForm({ url: link, note: note.trim() });
      setRequests((current) => ({ status: 'ready', items: [created, ...current.items] }));
      setUrl('');
      setNote('');
      setResult({ busy: false, error: null, available: null, sent: true });
    } catch (error) {
      if (error?.code === 'FORM_ALREADY_AVAILABLE') setResult({ busy: false, error: null, available: error.body.formId, sent: false });
      else if (error?.code === 'REQUEST_ALREADY_OPEN') setResult({ busy: false, error: 'You have already requested this form. Its status is below.', available: null, sent: false });
      else if (error?.status === 400) setResult({ busy: false, error: error.body?.url?.[0] ?? error.body?.note?.[0] ?? 'Check the link and try again.', available: null, sent: false });
      else setResult({ busy: false, error: 'Your request could not be sent. Please try again.', available: null, sent: false });
    }
  }

  return (
    <>
      <PageHeader
        title="Request a form"
        description="Need to practise a form that is not in the catalog? Send its link. A Form Reviewer makes a practice copy and checks it before it appears."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="h-fit">
          <form onSubmit={submit} noValidate>
            <CardHeader>
              <CardTitle>The form you want to practise</CardTitle>
              <CardDescription>Use the address of the page that shows the form. Never paste a link that contains your own details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="request-url">Link to the form</Label>
                <Input id="request-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://"
                  maxLength={2048} aria-invalid={result.error ? true : undefined} aria-describedby={result.error ? 'request-error' : undefined} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="request-note">Anything a reviewer should know (optional)</Label>
                <Textarea id="request-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example, which part you find hard" />
              </div>
              {result.error && <p id="request-error" role="alert" className="text-[13px] font-medium text-destructive">{result.error}</p>}
              {result.available && (
                <Alert variant="success">
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
                    This form is already in the catalog.
                    <Button size="sm" onClick={() => onOpenForm(result.available)}>Practise it now<ArrowRight /></Button>
                  </div>
                </Alert>
              )}
              {result.sent && <p role="status" className="text-[13px] font-medium text-success">Request sent. Its status is in the list.</p>}
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={result.busy}>{result.busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}Send request</Button>
            </CardFooter>
          </form>
        </Card>

        <section aria-labelledby="my-requests" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="my-requests" className="text-sm font-semibold">Your requests</h2>
            <Button variant="ghost" size="sm" onClick={load} disabled={requests.status === 'loading'}><RefreshCw />Refresh</Button>
          </div>
          {requests.status === 'loading' && <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>}
          {requests.status === 'error' && <Alert variant="destructive"><AlertCircle />Your requests could not be loaded.</Alert>}
          {requests.status === 'ready' && requests.items.length === 0 && (
            <EmptyState icon={Inbox} title="No requests yet" description="Forms you ask for appear here with what is happening to them." />
          )}
          {requests.status === 'ready' && requests.items.length > 0 && (
            <ul className="divide-y rounded-lg border bg-card shadow-xs">
              {requests.items.map((request) => {
                const [variant, label] = STATE[request.state] ?? ['secondary', request.state];
                return (
                  <li key={request.requestId} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium" title={request.url}>{hostOf(request.url)}</p>
                      <p className="break-all text-xs text-muted-foreground">{request.url}</p>
                      <p className="text-[13px]">{request.message}</p>
                      <p className="text-xs text-muted-foreground">Requested {formatDateTime(request.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                      <Badge variant={variant}>{label}</Badge>
                      {request.state === 'AVAILABLE' && request.formId && (
                        <Button size="sm" variant="outline" onClick={() => onOpenForm(request.formId)} aria-label={`Practise the form from ${hostOf(request.url)}`}>Practise<ArrowRight /></Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
