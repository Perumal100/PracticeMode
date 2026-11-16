// Instructors look through published forms and report mistakes in them,
// and follow what Form Reviewers answered.
import { AlertCircle, ArrowLeft, Flag, Inbox } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { formatDateTime } from '@/lib/format.js';
import * as defaultApi from '../../api/instructors.js';
import { ReportDialog } from './ReportProblem.jsx';

const CHANGE_STATUS = { OPEN: ['warning', 'Waiting for a reviewer'], RESOLVED: ['success', 'Resolved'], DECLINED: ['secondary', 'Declined'] };
const TYPE = { text: 'Short text', textarea: 'Long text', email: 'Email', tel: 'Phone', number: 'Number', date: 'Date', select: 'Choice list', checkbox: 'Checkbox', url: 'Link' };

export function ChangeStatus({ status }) {
  const [variant, label] = CHANGE_STATUS[status] ?? ['secondary', status];
  return <Badge variant={variant}>{label}</Badge>;
}

function MyReports({ changes }) {
  if (changes === null) return <Skeleton className="h-20 rounded-lg" />;
  if (!changes.length) return <p className="text-sm text-muted-foreground">You have not reported a problem yet.</p>;
  return (
    <ul className="divide-y rounded-lg border bg-card shadow-xs">
      {changes.map((change) => (
        <li key={change.id} className="space-y-1.5 px-5 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{change.formTitle}{change.fieldLabel && <span className="font-normal text-muted-foreground">, {change.fieldLabel}</span>}</p>
            <ChangeStatus status={change.status} />
          </div>
          <p className="whitespace-pre-wrap break-words">{change.description}</p>
          {change.response && <p className="rounded-md bg-muted px-3 py-2 text-[13px]"><span className="font-medium">{change.resolvedBy ?? 'Form Reviewer'}:</span> {change.response}</p>}
          <p className="text-xs text-muted-foreground">Reported {formatDateTime(change.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}

export default function InstructorForms({ api: overrides = {} }) {
  const [api] = useState(() => ({ ...defaultApi, ...overrides }));
  const [forms, setForms] = useState({ status: 'loading', items: [] });
  const [changes, setChanges] = useState(null);
  const [open, setOpen] = useState(null);
  const [reporting, setReporting] = useState(null);

  const loadChanges = useCallback(() => api.listMyChangeRequests().then(setChanges, () => setChanges([])), [api]);

  useEffect(() => {
    api.listPublishedForms().then((items) => setForms({ status: 'ready', items }), () => setForms({ status: 'error', items: [] }));
    loadChanges();
  }, [api, loadChanges]);

  async function openForm(id) {
    setOpen({ status: 'loading' });
    try {
      setOpen({ status: 'ready', form: await api.getPublishedForm(id) });
    } catch {
      setOpen({ status: 'error' });
    }
  }

  if (open) {
    const form = open.form;
    return (
      <>
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => setOpen(null)}><ArrowLeft />All forms</Button>
        {open.status === 'loading' && <Skeleton className="h-72 rounded-lg" />}
        {open.status === 'error' && <Alert variant="destructive"><AlertCircle />This form could not be loaded.</Alert>}
        {open.status === 'ready' && (
          <>
            <PageHeader title={form.title} description="The questions learners practise. Report anything that differs from the real form."
              actions={<Button variant="outline" onClick={() => setReporting({ fieldId: '' })}><Flag />Report a problem</Button>} />
            <Card>
              <ol className="divide-y">
                {form.fields.map((field) => (
                  <li key={field.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span>
                      <span className="tabular-nums text-muted-foreground">{field.position}.</span> {field.label}
                      <span className="block text-xs text-muted-foreground">{TYPE[field.input_type] ?? field.input_type}{field.required ? ', required' : ''}</span>
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setReporting({ fieldId: field.id })} aria-label={`Report a problem with ${field.label}`}><Flag />Report</Button>
                  </li>
                ))}
              </ol>
            </Card>
            {reporting && (
              <ReportDialog key={reporting.fieldId} form={form} initialFieldId={reporting.fieldId} open onOpenChange={(isOpen) => !isOpen && setReporting(null)}
                createChangeRequest={api.createChangeRequest} onSent={loadChanges} />
            )}
          </>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Forms" description="Published practice forms. Open one to see its questions and report a mistake to a Form Reviewer." />
      {forms.status === 'loading' && <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>}
      {forms.status === 'error' && <Alert variant="destructive"><AlertCircle />The forms could not be loaded.</Alert>}
      {forms.status === 'ready' && !forms.items.length && <EmptyState icon={Inbox} title="No published forms yet" description="Forms appear here once a Form Reviewer approves them." />}
      {forms.status === 'ready' && forms.items.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card shadow-xs">
          {forms.items.map((form) => (
            <li key={form.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="text-sm">
                <span className="font-medium">{form.title}</span>
                <span className="block text-xs text-muted-foreground">{form.fieldCount} question{form.fieldCount === 1 ? '' : 's'}</span>
              </span>
              <Button variant="outline" size="sm" onClick={() => openForm(form.id)} aria-label={`Open ${form.title}`}>Open</Button>
            </li>
          ))}
        </ul>
      )}
      <Card className="mt-8 border-0 bg-transparent shadow-none">
        <CardHeader className="border-0 px-0"><CardTitle as="h2">Your reports</CardTitle></CardHeader>
        <MyReports changes={changes} />
      </Card>
    </>
  );
}
