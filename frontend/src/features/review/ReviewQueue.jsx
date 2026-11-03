// US-04 review queue and US-16 pending-review notifications: the Form
// Reviewer's dashboard.
import { AlertCircle, ArrowRight, Bell, CheckCircle2, FileSearch, Inbox, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { StatCard } from '@/components/stat-card.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { Badge, StatusBadge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { Tabs } from '@/components/ui/tabs.jsx';
import { hostOf, timeAgo } from '@/lib/format';
import { listNotifications as defaultListNotifications, listReviewForms as defaultListReviewForms } from '../../api/review.js';

const STATUSES = [['AWAITING_REVIEW', 'Awaiting review'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']];

export function reviewErrorMessage(error) {
  if (error?.status === 401) return 'Your session has ended. Sign in again.';
  if (error?.status === 403) return 'Only Form Reviewers can open the review area.';
  if (error?.status === 404) return 'This form does not exist.';
  return 'The review data could not be loaded. Please try again.';
}

export default function ReviewQueue({ onOpen, api = {} }) {
  const listReviewForms = api.listReviewForms ?? defaultListReviewForms;
  const listNotifications = api.listNotifications ?? defaultListNotifications;
  const [status, setStatus] = useState('AWAITING_REVIEW');
  const [lists, setLists] = useState({ state: 'loading', byStatus: {}, error: null });
  const [notifications, setNotifications] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(STATUSES.map(([value]) => listReviewForms(value))).then(
      (results) => !cancelled && setLists({ state: 'ready', byStatus: Object.fromEntries(STATUSES.map(([value], i) => [value, results[i]])), error: null }),
      (error) => !cancelled && setLists({ state: 'error', byStatus: {}, error: reviewErrorMessage(error) }),
    );
    listNotifications().then((n) => !cancelled && setNotifications(n), () => !cancelled && setNotifications([]));
    return () => { cancelled = true; };
  }, [listReviewForms, listNotifications]);

  const count = (value) => lists.byStatus[value]?.length ?? 0;
  const forms = lists.byStatus[status] ?? [];

  if (lists.state === 'error') {
    return (
      <>
        <PageHeader title="Form review" />
        <Alert variant="destructive"><AlertCircle />{lists.error}</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Form review"
        description="Check each imported form against its source before learners can use it. Only approved forms appear in the learner catalog."
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Awaiting review" value={count('AWAITING_REVIEW')} icon={Inbox} tone="warning" loading={lists.state === 'loading'} hint="Imported and not yet checked" />
        <StatCard label="Approved" value={count('APPROVED')} icon={CheckCircle2} tone="success" loading={lists.state === 'loading'} hint="Available to learners" />
        <StatCard label="Rejected" value={count('REJECTED')} icon={XCircle} tone="destructive" loading={lists.state === 'loading'} hint="Hidden, with a recorded reason" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Forms</CardTitle>
              <CardDescription>Open a form to compare its fields with the source page.</CardDescription>
            </div>
            <Tabs
              label="Review status"
              value={status}
              onValueChange={setStatus}
              items={STATUSES.map(([value, label]) => ({ value, label, count: lists.state === 'ready' ? count(value) : undefined }))}
            />
          </CardHeader>
          {lists.state === 'loading' ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : forms.length === 0 ? (
            <EmptyState className="m-5" icon={FileSearch} title="No forms in this list" description={status === 'AWAITING_REVIEW' ? 'New imports from the browser extension appear here.' : undefined} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Form</TableHead>
                  <TableHead className="text-right">Fields</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead><span className="sr-only">Action</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((form) => (
                  <TableRow key={form.id}>
                    <TableCell>
                      <div className="font-medium">{form.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <StatusBadge status={form.status} />
                        {form.revision_of && <Badge variant="outline">Revision</Badge>}
                        {(form.categories ?? []).map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{form.field_count}</TableCell>
                    <TableCell>
                      <div className="max-w-48 truncate text-muted-foreground" title={form.source_url}>{hostOf(form.source_url)}</div>
                      {!form.source_available && <Badge variant="destructive" className="mt-1">Unreachable</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{timeAgo(form.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => onOpen(form.id)} aria-label={`Inspect ${form.title}`}>Inspect<ArrowRight /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader className="flex-row items-center gap-2">
            <Bell className="size-4 text-muted-foreground" />
            <CardTitle>New imports</CardTitle>
            {notifications?.length > 0 && <Badge variant="warning" className="ml-auto">{notifications.length}</Badge>}
          </CardHeader>
          <CardContent className="p-0">
            {notifications === null ? (
              <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
            ) : notifications.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">You are all caught up.</p>
            ) : (
              <ul role="status" aria-label={`${notifications.length} new form${notifications.length === 1 ? '' : 's'} awaiting review`} className="divide-y">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => onOpen(n.form_id)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-muted/60">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{n.form_title}</span>
                        <span className="text-xs text-muted-foreground">Imported {timeAgo(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
