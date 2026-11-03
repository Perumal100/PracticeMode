// US-04 inspect extracted fields, US-10 compare with the source and correct
// what extraction got wrong, US-17 approve or reject. Corrections are allowed
// only while the form awaits review.
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, BarChart3, Check, ChevronDown, ExternalLink, Eye, Gavel, Loader2, Pencil, Plus, Search, Tag, Trash2, X } from 'lucide-react';
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
import { Checkbox, Input, Label, Textarea } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { formatDateTime, hostOf, timeAgo } from '@/lib/format';
import {
  addField as defaultAddField,
  decideForm as defaultDecideForm,
  deleteField as defaultDeleteField,
  getReviewForm as defaultGetReviewForm,
  reorderFields as defaultReorderFields,
  updateField as defaultUpdateField,
  updateFormMetadata as defaultUpdateFormMetadata,
} from '../../api/review.js';
import FieldEditor, { FIELD_TYPES, apiErrorMessage } from './FieldEditor.jsx';
import FormPreview from './FormPreview.jsx';
import { reviewErrorMessage } from './ReviewQueue.jsx';

const TYPE_LABEL = Object.fromEntries(FIELD_TYPES);
const INLINE_OPTIONS = 5;

// Long choice lists (country codes, states…) collapse to a one-line summary;
// the full list opens in a scrollable, filterable panel.
function OptionsSummary({ options, label }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  if (options.length <= INLINE_OPTIONS) return <span>Options: {options.join(', ')}</span>;
  const needle = query.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options;
  return (
    <div className="min-w-0">
      <p className="line-clamp-1" title={options.slice(0, 20).join(', ')}>
        <span className="font-medium text-foreground">{options.length} options</span> · {options.slice(0, 3).join(', ')}…
      </p>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        {open ? 'Hide options' : `Show all ${options.length}`}
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 max-w-xl rounded-md border bg-muted/40 p-2">
          {options.length > 12 && (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter options" aria-label={`Filter options of ${label}`} className="h-7 pl-7 text-xs" />
            </div>
          )}
          <ul aria-label={`Options of ${label}`} className="flex max-h-48 flex-wrap gap-1 overflow-y-auto pr-1">
            {shown.map((option) => (
              <li key={option} className="rounded border bg-card px-1.5 py-0.5 text-xs text-foreground">{option}</li>
            ))}
          </ul>
          {needle && <p className="mt-1.5 text-[11px] text-muted-foreground">{shown.length ? `${shown.length} of ${options.length} match` : 'No options match'}</p>}
        </div>
      )}
    </div>
  );
}

function RuleSummary({ field }) {
  const { allowedValues, ...rest } = field.validation ?? {};
  const other = describeRules(rest);
  // No rules: show nothing rather than a "None" under every plain field.
  if (!allowedValues) return other === 'None' ? null : other;
  return (
    <div className="space-y-1">
      <OptionsSummary options={allowedValues} label={field.label} />
      {other !== 'None' && <p>{other}</p>}
    </div>
  );
}

function DetailsEditor({ data, onSave, onCancel }) {
  const [title, setTitle] = useState(data.title);
  const [sourceUrl, setSourceUrl] = useState(data.source_url);
  const [available, setAvailable] = useState(data.source_available);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!title.trim()) return setError('Enter a title.');
    try {
      const url = new URL(sourceUrl.trim());
      if (!/^https?:$/.test(url.protocol)) throw new Error('scheme');
    } catch {
      return setError('Enter the full address of the source page, starting with https://.');
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ title: title.trim(), source_url: sourceUrl.trim(), source_available: available });
    } catch (err) {
      setError(apiErrorMessage(err, 'The details could not be saved.'));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="form-title">Title</Label>
        <Input id="form-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        <p className="text-xs text-muted-foreground">Learners see this name in the catalog.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="form-source">Source page</Label>
        <Input id="form-source" type="url" value={sourceUrl} maxLength={2048} onChange={(e) => setSourceUrl(e.target.value)} />
        <p className="text-xs text-muted-foreground">The page where the real form lives, e.g. the job posting rather than an embedded frame.</p>
      </div>
      <label htmlFor="form-source-available" className="flex items-center gap-2.5 text-sm">
        <Checkbox id="form-source-available" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="mt-0" />
        I opened this source and it loads
      </label>
      {error && <Alert variant="destructive"><AlertCircle />{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save details</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

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

export default function ReviewDetail({ formId, onBack, onInsights, api = {} }) {
  const getReviewForm = api.getReviewForm ?? defaultGetReviewForm;
  const decideForm = api.decideForm ?? defaultDecideForm;
  const updateFormMetadata = api.updateFormMetadata ?? defaultUpdateFormMetadata;
  const addField = api.addField ?? defaultAddField;
  const updateField = api.updateField ?? defaultUpdateField;
  const deleteField = api.deleteField ?? defaultDeleteField;
  const reorderFields = api.reorderFields ?? defaultReorderFields;
  const [form, setForm] = useState({ state: 'loading', data: null, error: null });
  const [editingDetails, setEditingDetails] = useState(false);
  const [fieldEditor, setFieldEditor] = useState({ open: false, field: null });
  const [toDelete, setToDelete] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [moving, setMoving] = useState(false);
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

  async function saveDetails(changes) {
    const data = await updateFormMetadata(formId, changes);
    setForm({ state: 'ready', data, error: null });
    setEditingDetails(false);
    toast.success('Details saved.');
  }

  async function saveField(payload) {
    const data = fieldEditor.field ? await updateField(formId, fieldEditor.field.id, payload) : await addField(formId, payload);
    setForm({ state: 'ready', data, error: null });
    toast.success(fieldEditor.field ? 'Field saved.' : 'Field added.');
  }

  async function removeField(field) {
    setToDelete(null);
    setError(null);
    try {
      const data = await deleteField(formId, field.id);
      setForm({ state: 'ready', data, error: null });
      toast.success(`Removed "${field.label}".`);
    } catch (err) {
      setError(apiErrorMessage(err, 'The field could not be removed.'));
    }
  }

  async function move(index, step) {
    const ids = form.data.fields.map((f) => f.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    setMoving(true);
    setError(null);
    try {
      const data = await reorderFields(formId, ids);
      setForm({ state: 'ready', data, error: null });
    } catch (err) {
      setError(apiErrorMessage(err, 'The fields could not be reordered.'));
    } finally {
      setMoving(false);
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
        actions={(
          <>
            <Button variant="outline" onClick={() => setPreviewing(true)}><Eye />Preview form</Button>
            {data.status === 'APPROVED' && onInsights && (
              <Button variant="outline" onClick={() => onInsights(data.id)}><BarChart3 />Practice insights</Button>
            )}
          </>
        )}
      />

      {error && <Alert variant="destructive" className="mb-6"><AlertCircle />{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Source</CardTitle>
                <CardDescription>Open the original page next to this one and compare every field.</CardDescription>
              </div>
              {pending && !editingDetails && (
                <Button variant="outline" size="sm" onClick={() => setEditingDetails(true)}><Pencil />Edit details</Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {editingDetails ? (
                <DetailsEditor data={data} onSave={saveDetails} onCancel={() => setEditingDetails(false)} />
              ) : (
              <>
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
              </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Extracted fields</CardTitle>
                <CardDescription>Labels, input types, required flags and validation exactly as learners will get them.{pending && ' Correct anything that differs from the source.'}</CardDescription>
              </div>
              {pending && <Button variant="outline" size="sm" onClick={() => setFieldEditor({ open: true, field: null })}><Plus />Add field</Button>}
            </CardHeader>
            <Table>
              <caption className="sr-only">Extracted fields</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Question and rules</TableHead>
                  <TableHead className="w-36">Answer</TableHead>
                  {pending && <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.fields.map((field, index) => (
                  <TableRow key={field.id}>
                    <TableCell className="align-top tabular-nums text-muted-foreground">{field.position}</TableCell>
                    <TableCell className="min-w-48 align-top">
                      <p className="font-medium leading-snug">{field.label}</p>
                      <div className="mt-1 text-[13px] text-muted-foreground empty:hidden"><RuleSummary field={field} /></div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant="outline" className="whitespace-nowrap">{TYPE_LABEL[field.input_type] ?? field.input_type}</Badge>
                        {field.required
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium"><Check className="size-3.5 text-success" />Required</span>
                          : <span className="text-xs text-muted-foreground">Optional</span>}
                      </div>
                    </TableCell>
                    {pending && (
                      <TableCell className="whitespace-nowrap py-2 text-right align-top">
                        <div className="inline-flex items-center">
                          <Button variant="ghost" size="icon" className="size-7" disabled={moving || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${field.label} up`}><ArrowUp /></Button>
                          <Button variant="ghost" size="icon" className="size-7" disabled={moving || index === data.fields.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${field.label} down`}><ArrowDown /></Button>
                          <Button variant="ghost" size="icon" className="size-7" onClick={() => setFieldEditor({ open: true, field })} aria-label={`Edit ${field.label}`}><Pencil /></Button>
                          <Button variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive-soft" disabled={data.fields.length === 1} onClick={() => setToDelete(field)} aria-label={`Remove ${field.label}`}><Trash2 /></Button>
                        </div>
                      </TableCell>
                    )}
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

      <FormPreview form={data} open={previewing} onOpenChange={setPreviewing} check={api.checkPreviewAnswers} />

      <FieldEditor open={fieldEditor.open} field={fieldEditor.field} onOpenChange={(open) => setFieldEditor((f) => ({ ...f, open }))} onSave={saveField} />

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{toDelete?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>Remove a field only when the source page does not ask for it. The remaining fields are renumbered.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep field</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => removeField(toDelete)}>Remove field</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
