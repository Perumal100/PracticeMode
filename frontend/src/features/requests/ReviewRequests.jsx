// US-15 reviewer side: links learners asked for. Import the page with the
// browser extension (open requests for that page are linked automatically),
// link an existing form, or decline with a reason the learner will see.
import { AlertCircle, ExternalLink, Inbox, Link2, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { StatusBadge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Label, NativeSelect, Textarea } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { Tabs } from '@/components/ui/tabs.jsx';
import { hostOf, timeAgo } from '@/lib/format.js';
import * as defaultApi from '../../api/formRequests.js';
import { listReviewForms as defaultListReviewForms } from '../../api/review.js';

const TABS = [['OPEN', 'Waiting'], ['LINKED', 'Linked'], ['DECLINED', 'Declined']];
const HEAD = 'normal-case tracking-normal';

// Several learners may ask for the same page: show it once, with the count.
function onePerPage(requests) {
  const seen = new Set();
  return requests.filter((request) => {
    const key = `${hostOf(request.url)}${new URL(request.url).pathname.replace(/\/$/, '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function LinkDialog({ request, onClose, onDone, api }) {
  const [forms, setForms] = useState(null);
  const [formId, setFormId] = useState('');
  const [state, setState] = useState({ busy: false, error: null });

  useEffect(() => {
    Promise.all([api.listReviewForms('AWAITING_REVIEW'), api.listReviewForms('APPROVED')]).then(
      ([waiting, approved]) => setForms([...waiting, ...approved]),
      () => setForms([]),
    );
  }, [api]);

  async function link() {
    if (!formId) return setState({ busy: false, error: 'Choose the form that matches this link.' });
    setState({ busy: true, error: null });
    try {
      await api.linkRequest(request.requestId, formId);
      onDone();
    } catch (error) {
      setState({ busy: false, error: error?.status === 409 ? 'This request was already handled, or that form cannot be linked.' : 'The request could not be linked. Please try again.' });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link to a form</DialogTitle>
          <DialogDescription>Learners who asked for {hostOf(request.url)} will follow this form&rsquo;s review and can practise it once it is approved.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="link-form">Form</Label>
          {forms === null ? <Skeleton className="h-9" /> : (
            <NativeSelect id="link-form" value={formId} onChange={(e) => setFormId(e.target.value)}>
              <option value="">Choose a form…</option>
              {forms.map((form) => <option key={form.id} value={form.id}>{form.title} ({form.status === 'APPROVED' ? 'approved' : 'awaiting review'})</option>)}
            </NativeSelect>
          )}
          {state.error && <p role="alert" className="text-[13px] font-medium text-destructive">{state.error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={link} disabled={state.busy}>{state.busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}Link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeclineDialog({ request, onClose, onDone, api }) {
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ busy: false, error: null });

  async function decline() {
    if (!reason.trim()) return setState({ busy: false, error: 'Tell the learner why this form cannot be practised.' });
    setState({ busy: true, error: null });
    try {
      await api.declineRequest(request.requestId, reason.trim());
      onDone();
    } catch (error) {
      setState({ busy: false, error: error?.status === 409 ? 'This request was already handled.' : 'The request could not be declined. Please try again.' });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline this request</DialogTitle>
          <DialogDescription>Every learner who asked for {hostOf(request.url)} sees your reason.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="decline-reason">Reason</Label>
          <Textarea id="decline-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="For example, the form needs a sign-in" aria-invalid={state.error ? true : undefined} />
          {state.error && <p role="alert" className="text-[13px] font-medium text-destructive">{state.error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={decline} disabled={state.busy}>{state.busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}Decline</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ReviewRequests({ status = 'OPEN', onStatusChange, onOpenForm, api: overrides = {} }) {
  const [api] = useState(() => ({ listReviewForms: defaultListReviewForms, ...defaultApi, ...overrides }));
  const tab = TABS.some(([value]) => value === status) ? status : 'OPEN';
  const [state, setState] = useState({ status: 'loading', rows: [] });
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => {
    setState({ status: 'loading', rows: [] });
    api.listReviewRequests(tab).then(
      (rows) => setState({ status: 'ready', rows: onePerPage(rows) }),
      (error) => setState({ status: 'error', rows: [], error: error?.status === 403 ? 'Only Form Reviewers can see learner requests.' : 'The requests could not be loaded. Please try again.' }),
    );
  }, [api, tab]);

  useEffect(() => { load(); }, [load]);

  function done() {
    setDialog(null);
    load();
  }

  return (
    <>
      <PageHeader
        title="Learner requests"
        description="Forms learners asked to practise. Importing a page with the browser extension links its requests automatically."
        actions={<Button variant="outline" onClick={load} disabled={state.status === 'loading'}><RefreshCw />Refresh</Button>}
      />
      <Tabs label="Request status" value={tab} onValueChange={onStatusChange} items={TABS.map(([value, label]) => ({ value, label }))} />
      <div className="mt-4">
        {state.status === 'loading' && <Card className="space-y-3 p-4" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</Card>}
        {state.status === 'error' && <Alert variant="destructive"><AlertCircle />{state.error}</Alert>}
        {state.status === 'ready' && state.rows.length === 0 && (
          <EmptyState role="status" icon={Inbox} title={tab === 'OPEN' ? 'No learner requests are waiting' : 'Nothing in this list yet'}
            description={tab === 'OPEN' ? 'When a learner sends a link to a form, it appears here.' : undefined} />
        )}
        {state.status === 'ready' && state.rows.length > 0 && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={HEAD}>Requested page</TableHead>
                  <TableHead className={HEAD}>Learners</TableHead>
                  <TableHead className={HEAD}>{tab === 'OPEN' ? 'Note' : tab === 'LINKED' ? 'Practice form' : 'Reason'}</TableHead>
                  <TableHead className={HEAD}><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.rows.map((request) => (
                  <TableRow key={request.requestId}>
                    <TableCell className="max-w-72">
                      <a href={request.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:underline">
                        {hostOf(request.url)}<ExternalLink className="size-3.5" /><span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      <span className="block truncate text-xs text-muted-foreground" title={request.url}>{request.url}</span>
                      <span className="block text-xs text-muted-foreground">Requested {timeAgo(request.createdAt)}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">{request.requestCount}</TableCell>
                    <TableCell className="max-w-64">
                      {tab === 'OPEN' && <span className="text-muted-foreground">{request.note || 'No note'}</span>}
                      {tab === 'LINKED' && (request.form ? (
                        <button type="button" onClick={() => onOpenForm(request.form.id)} className="text-left font-medium underline-offset-4 hover:underline focus-visible:underline">
                          {request.form.title}<StatusBadge status={request.form.status} className="ml-2" />
                        </button>
                      ) : <span className="text-muted-foreground">The form was removed</span>)}
                      {tab === 'DECLINED' && <span>{request.declineReason}</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {tab === 'OPEN' && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'link', request })}><Link2 />Link</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDialog({ kind: 'decline', request })}>Decline</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
      {dialog?.kind === 'link' && <LinkDialog request={dialog.request} api={api} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'decline' && <DeclineDialog request={dialog.request} api={api} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}

