// US-04 inspect extracted fields, US-10 compare with the source, US-17 approve
// or reject. Title and category edits use Dev-Atheer's PATCH endpoint.
import { AlertCircle, AlertTriangle, Check, ExternalLink, Gavel, Loader2, Tag, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.jsx';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';
import { Badge, StatusBadge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Input, Label, Textarea } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { formatDateTime, hostOf, timeAgo } from '@/lib/format';
import {
  decideForm as defaultDecideForm,
  getReviewForm as defaultGetReviewForm,
  updateFormMetadata as defaultUpdateFormMetadata,
} from '../../api/review.js';
import { reviewErrorMessage } from './ReviewQueue.jsx';

export function describeRules(validation = {}) {
  const parts = [];
  if (validation.allowedValues) parts.push(`Options: ${validation.allowedValues.join(', ')}`);
  const range = (low, high, unit = '') => {
    if (low !== undefined && high !== undefined) return `${low}–${high}${unit}`;
    return low !== undefined ? `At least ${low}${unit}` : `At most ${high}${unit}`;
  };
  if (validation.minLength !== undefined || validation.maxLength !== undefined) parts.push(range(validation.minLength, validation.maxLength, ' characters'));
  if (validation.min !== undefined || validation.max !== undefined) parts.push(`Value ${range(validation.min, validation.max).replace(/^At/, 'at')}`);
  const known = new Set(['allowedValues', 'minLength', 'maxLength', 'min', 'max', 'required']);
  for (const [key, value] of Object.entries(validation)) if (!known.has(key)) parts.push(`${key}: ${JSON.stringify(value)}`);
  return parts.join(' · ') || 'None';
}

function CategoryEditor({ initial, onSave }) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(tags) !== JSON.stringify(initial) || draft.trim() !== '';

  function add(raw) {
    const parts = raw.split(',').map((t) => t.trim()).filter(Boolean);
    const next = [...tags];
    for (const part of parts) if (!next.some((t) => t.toLowerCase() === part.toLowerCase())) next.push(part);
    setTags(next);
    setDraft('');
    return next;
  }

  async function save() {
    setBusy(true);
    await onSave(draft.trim() ? add(draft) : tags);
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => setTags(tags.filter((t) => t !== tag))} className="rounded p-0.5 hover:bg-background"><X className="size-3" /></button>
          </Badge>
        ))}
        <label htmlFor="category-input" className="sr-only">Categories</label>
        <input
          id="category-input"
          value={draft}
          onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) add(draft); }
            if (e.key === 'Backspace' && !draft && tags.length) setTags(tags.slice(0, -1));
          }}
          placeholder={tags.length ? '' : 'Housing, Government…'}
          className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      <Button variant="outline" size="sm" onClick={save} disabled={!dirty || busy}>
        {busy && <Loader2 className="animate-spin" />}Save categories
      </Button>
    </div>
  );
}

export default function ReviewDetail({ formId, onBack, api = {} }) {
  const getReviewForm = api.getReviewForm ?? defaultGetReviewForm;
  const decideForm = api.decideForm ?? defaultDecideForm;
  const updateFormMetadata = api.updateFormMetadata ?? defaultUpdateFormMetadata;
  const [form, setForm] = useState({ state: 'loading', data: null, error: null });
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getReviewForm(formId).then(
      (data) => !cancelled && setForm({ state: 'ready', data, error: null }),
      (err) => !cancelled && setForm({ state: 'error', data: null, error: reviewErrorMessage(err) }),
    );
    return () => { cancelled = true; };
  }, [formId, getReviewForm]);

  function askToDecide(decision) {
    setError(null);
    if (decision === 'REJECT' && !reason.trim()) {
      setReasonError('Give a reason before rejecting, so the problem is recorded.');
      return;
    }
    setReasonError(null);
    setConfirm(decision);
  }

  async function decide(decision) {
    setConfirm(null);
    setBusy(true);
    try {
      const data = await decideForm(formId, decision, reason.trim());
      setForm({ state: 'ready', data, error: null });
      toast.success(decision === 'APPROVE' ? 'Approved. Learners can now practise this form.' : 'Rejected. Learners cannot start this form.');
    } catch (err) {
      setError(err?.status === 409 ? 'This form has already been reviewed. Reload to see the recorded decision.'
        : err?.status === 400 ? 'The decision was not accepted. Check the reason and try again.'
          : reviewErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveCategories(categories) {
    setError(null);
    try {
      const data = await updateFormMetadata(formId, { categories });
      setForm({ state: 'ready', data, error: null });
      toast.success('Categories saved.');
    } catch (err) {
      setError(err?.status === 409 ? 'Only forms awaiting review can be edited.' : 'The categories could not be saved.');
    }
  }

  const crumbs = [{ label: 'Form review', onClick: onBack }];
  if (form.state === 'loading') {
    return (
      <>
        <PageHeader title={<Skeleton className="h-7 w-72" />} breadcrumb={[...crumbs, { label: '…' }]} />
        <Skeleton className="h-96 rounded-lg" />
      </>
    );
  }
  if (form.state === 'error') {
    return (
      <>
        <PageHeader title="Form unavailable" breadcrumb={[...crumbs, { label: 'Unavailable' }]} />
        <Alert variant="destructive"><AlertCircle />{form.error}</Alert>
      </>
    );
  }

  const data = form.data;
  const pending = data.status === 'AWAITING_REVIEW';
  const required = data.fields.filter((f) => f.required).length;
  return (
    <>
      <PageHeader
        title={data.title}
        breadcrumb={[...crumbs, { label: data.title }]}
        meta={<StatusBadge status={data.status} />}
        description={`${data.fields.length} fields · ${required} required · imported ${timeAgo(data.created_at)}`}
      />

      {error && <Alert variant="destructive" className="mb-6"><AlertCircle />{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Source</CardTitle>
              <CardDescription>Open the original page next to this one and compare every field.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2.5">
                <a href={data.source_url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm font-medium text-primary hover:underline">{data.source_url}</a>
                <Button asChild variant="outline" size="sm">
                  <a href={data.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink />Open source</a>
                </Button>
              </div>
              {!data.source_available && (
                <Alert variant="warning">
                  <AlertTriangle />
                  <div>
                    <AlertTitle>The importer could not reach this source</AlertTitle>
                    <AlertDescription>Do not treat the form as verified against {hostOf(data.source_url)}.</AlertDescription>
                  </div>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Extracted fields</CardTitle>
              <CardDescription>Labels, input types, required flags and validation exactly as learners will get them.</CardDescription>
            </CardHeader>
            <Table>
              <caption className="sr-only">Extracted fields</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Validation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.fields.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{field.position}</TableCell>
                    <TableCell className="font-medium">{field.label}</TableCell>
                    <TableCell><Badge variant="outline" className="font-mono text-[11px]">{field.input_type}</Badge></TableCell>
                    <TableCell>{field.required ? <span className="inline-flex items-center gap-1 text-sm"><Check className="size-3.5 text-success" />Yes</span> : <span className="text-sm text-muted-foreground">No</span>}</TableCell>
                    <TableCell className="max-w-72 text-[13px] text-muted-foreground">{describeRules(field.validation)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-10 lg:h-fit">
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Gavel className="size-4 text-muted-foreground" />
              <CardTitle>Decision</CardTitle>
            </CardHeader>
            {data.decision ? (
              <CardContent className="space-y-3 text-sm">
                <StatusBadge status={data.decision.outcome} />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <dt className="text-muted-foreground">Reviewer</dt><dd>{data.decision.reviewer}</dd>
                  <dt className="text-muted-foreground">Decided</dt><dd>{formatDateTime(data.decision.decided_at)}</dd>
                  {data.decision.rejection_reason && (<><dt className="text-muted-foreground">Reason</dt><dd>{data.decision.rejection_reason}</dd></>)}
                </dl>
                <p className="sr-only">{data.decision.outcome === 'APPROVED' ? 'Approved' : 'Rejected'} by {data.decision.reviewer}</p>
              </CardContent>
            ) : pending ? (
              <>
                <CardContent className="space-y-2">
                  <Label htmlFor="rejection-reason">Rejection reason</Label>
                  <Textarea
                    id="rejection-reason"
                    rows={3}
                    value={reason}
                    aria-invalid={reasonError ? true : undefined}
                    aria-describedby={reasonError ? 'reason-error' : undefined}
                    onChange={(e) => { setReason(e.target.value); setReasonError(null); }}
                    placeholder="Required when rejecting, e.g. the date field was extracted as text"
                  />
                  {reasonError && <p id="reason-error" role="alert" className="text-[13px] font-medium text-destructive">{reasonError}</p>}
                </CardContent>
                <CardFooter className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="text-destructive hover:bg-destructive-soft" disabled={busy} onClick={() => askToDecide('REJECT')}>Reject</Button>
                  <Button disabled={busy} onClick={() => askToDecide('APPROVE')}>{busy && <Loader2 className="animate-spin" />}Approve</Button>
                </CardFooter>
              </>
            ) : (
              <CardContent className="text-sm text-muted-foreground">No decision is recorded for this form.</CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Tag className="size-4 text-muted-foreground" />
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent>
              {pending ? (
                <>
                  <p className="mb-3 text-[13px] text-muted-foreground">Learners filter the catalog by these. Press Enter or a comma to add one.</p>
                  <CategoryEditor key={(data.categories ?? []).join('|')} initial={data.categories ?? []} onSave={saveCategories} />
                </>
              ) : (data.categories ?? []).length ? (
                <div className="flex flex-wrap gap-1.5">{data.categories.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}</div>
              ) : (
                <p className="text-sm text-muted-foreground">No categories.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'APPROVE' ? 'Approve this form?' : 'Reject this form?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'APPROVE'
                ? 'Learners will be able to start practice attempts on it. A decision cannot be changed later.'
                : `Learners will not be able to practise it. Reason: “${reason.trim()}”`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={confirm === 'REJECT' ? 'destructive' : 'default'} onClick={() => decide(confirm)}>
              {confirm === 'APPROVE' ? 'Approve form' : 'Reject form'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
