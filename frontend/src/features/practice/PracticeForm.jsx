// US-11 practise an approved form, US-08 autosave and resume, US-26 complete
// and see validation feedback.
import { AlertCircle, CheckCircle2, CircleAlert, CloudOff, Loader2, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.jsx';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';
import { StatusBadge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Progress } from '@/components/ui/progress.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { getForm as defaultGetForm } from '../../api/catalog.js';
import { AutosaveStatus, useAutosave, useResumeAttempt } from '../autosave/index.js';
import Question, { messagesByField } from './Question.jsx';
import { completeAttempt as defaultCompleteAttempt, startAttempt as defaultStartAttempt } from './practiceApi.js';
import { rememberAttempt, storedAttempt } from './attemptStore.js';

const FORM_ERRORS = {
  403: 'This form is not available for practice. It may still be awaiting review or may have been rejected.',
  404: 'This practice form does not exist.',
  410: 'This form was updated to match the real form. Practise the new version instead.',
};
const START_ERRORS = {
  403: 'This form is not available for practice. It may still be awaiting review or may have been rejected.',
  422: 'This form contains questions PracticeMode cannot check yet, so it cannot be practised.',
};

const answered = (value) => value !== null && value !== undefined && value !== '' && value !== false;

export default function PracticeForm({ formId, user, onBack, onOpenForm, api = {} }) {
  const getForm = api.getForm ?? defaultGetForm;
  const startAttempt = api.startAttempt ?? defaultStartAttempt;
  const [form, setForm] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(() => storedAttempt(user.id, formId));
  const [start, setStart] = useState({ busy: false, error: null });

  useEffect(() => {
    let cancelled = false;
    getForm(formId).then(
      (data) => !cancelled && setForm({ status: 'ready', data, error: null }),
      (error) => !cancelled && setForm({
        status: 'error', data: null, replacedBy: error?.body?.replacedBy,
        error: FORM_ERRORS[error?.status] ?? 'The form could not be loaded. Please try again.',
      }),
    );
    return () => { cancelled = true; };
  }, [formId, getForm]);

  function openAttempt(id, status = 'IN_PROGRESS') {
    rememberAttempt(user.id, formId, id, status);
    setAttempt(id ? { id, status } : null);
  }

  async function begin() {
    setStart({ busy: true, error: null });
    try {
      const created = await startAttempt(formId);
      setStart({ busy: false, error: null });
      openAttempt(created.id);
    } catch (error) {
      setStart({ busy: false, error: START_ERRORS[error?.status] ?? 'The practice attempt could not be started. Please try again.' });
    }
  }

  const breadcrumb = [{ label: 'Practice forms', onClick: onBack }, { label: form.data?.title ?? 'Form' }];

  if (form.status === 'loading') {
    return (
      <>
        <PageHeader title={<Skeleton className="h-7 w-64" />} breadcrumb={[{ label: 'Practice forms', onClick: onBack }, { label: '…' }]} />
        <Skeleton className="h-80 rounded-lg" />
      </>
    );
  }
  if (form.status === 'error') {
    return (
      <>
        <PageHeader title={form.replacedBy ? 'This form was updated' : 'Form unavailable'} breadcrumb={[{ label: 'Practice forms', onClick: onBack }, { label: 'Unavailable' }]} />
        {form.replacedBy
          ? <Alert variant="info"><RefreshCw />{form.error}</Alert>
          : <Alert variant="destructive"><AlertCircle />{form.error}</Alert>}
        <div className="mt-4 flex flex-wrap gap-2">
          {form.replacedBy && onOpenForm && <Button onClick={() => onOpenForm(form.replacedBy)}>Open the updated form</Button>}
          <Button variant="outline" onClick={onBack}>Back to practice forms</Button>
        </div>
      </>
    );
  }

  const fields = form.data.fields;
  const required = fields.filter((f) => f.required).length;
  return (
    <>
      <PageHeader
        title={form.data.title}
        breadcrumb={breadcrumb}
        meta={attempt && <StatusBadge status={attempt.status} />}
        description={`${fields.length} question${fields.length === 1 ? '' : 's'} · ${required} required`}
      />
      {attempt ? (
        <AttemptView
          key={attempt.id}
          attemptId={attempt.id}
          form={form.data}
          api={api}
          onCompleted={() => openAttempt(attempt.id, 'COMPLETED')}
          onRestart={() => openAttempt(null)}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>What this form asks for</CardTitle>
              <CardDescription>Look through the questions first. Have made-up sample details ready.</CardDescription>
            </CardHeader>
            <ol className="divide-y">
              {fields.map((field) => (
                <li key={field.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>{field.label}</span>
                  {field.required && <span className="text-xs text-muted-foreground">Required</span>}
                </li>
              ))}
            </ol>
          </Card>
          <Card className="h-fit lg:sticky lg:top-10">
            <CardContent className="space-y-4 pt-5">
              <div className="flex gap-3 text-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-muted-foreground">This is a practice copy. Your answers save automatically and are never sent to the real website.</p>
              </div>
              {start.error && <Alert variant="destructive"><AlertCircle />{start.error}</Alert>}
              <Button className="w-full" size="lg" onClick={begin} disabled={start.busy}>
                {start.busy && <Loader2 className="animate-spin" />}Start practice
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function SaveSummary({ statuses }) {
  const states = Object.values(statuses).map((s) => s.state);
  const failed = states.filter((s) => s === 'error').length;
  if (failed) return <p className="flex items-center gap-2 text-sm font-medium text-destructive"><CloudOff className="size-4" />{failed} answer{failed === 1 ? '' : 's'} not saved</p>;
  if (states.some((s) => s === 'pending' || s === 'saving')) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Saving…</p>;
  if (states.length) return <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" />All changes saved</p>;
  return <p className="text-sm text-muted-foreground">Answers save automatically as you go.</p>;
}

function AttemptView({ attemptId, form, api, onCompleted, onRestart }) {
  const completeAttempt = api.completeAttempt ?? defaultCompleteAttempt;
  const resume = useResumeAttempt(attemptId, api.getAttempt ? { getAttempt: api.getAttempt } : undefined);
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [submit, setSubmit] = useState({ requested: false, busy: false, error: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const completed = resume.isCompleted || Boolean(result);
  const { statuses, queueSave, flush, retry } = useAutosave({
    attemptId,
    enabled: resume.status === 'ready' && !completed,
    ...(api.saveAnswer ? { saveAnswer: api.saveAnswer } : {}),
    ...(api.debounceMs !== undefined ? { debounceMs: api.debounceMs } : {}),
  });

  // US-08 AC-02: show the most recently saved answers.
  useEffect(() => {
    if (resume.status === 'ready') {
      setValues(resume.savedAnswers);
      if (resume.isCompleted) {
        setResult({ validationFeedback: resume.attempt.validationFeedback ?? [] });
        onCompleted();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume.status, resume.savedAnswers, resume.isCompleted, resume.attempt]);

  // Completion grades only saved answers, so wait for every queued save.
  useEffect(() => {
    if (!submit.requested) return;
    const states = Object.values(statuses).map((s) => s.state);
    if (states.some((s) => s === 'pending' || s === 'saving')) return;
    if (states.includes('error')) {
      setSubmit({ requested: false, busy: false, error: 'Some answers are not saved. Retry them before submitting.' });
      return;
    }
    setSubmit({ requested: false, busy: true, error: null });
    const done = (data) => {
      setResult(data);
      setSubmit({ requested: false, busy: false, error: null });
      onCompleted();
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
    };
    completeAttempt(attemptId).then(done, (error) => {
      // 409: already completed; the stored result comes back unchanged.
      if (error?.status === 409 && error.body?.validationFeedback) done(error.body);
      else setSubmit({ requested: false, busy: false, error: error?.status === 403 || error?.status === 404 ? 'This attempt is no longer available.' : 'Your attempt could not be submitted. Please try again.' });
    });
  }, [submit.requested, statuses, attemptId, completeAttempt, onCompleted]);

  const feedbackByField = useMemo(() => messagesByField(result?.validationFeedback), [result]);

  if (resume.status === 'loading') return <Skeleton className="h-96 rounded-lg" />;
  if (resume.status === 'error') {
    return (
      <EmptyResume message={resume.error} onRestart={onRestart} />
    );
  }

  const required = form.fields.filter((f) => f.required);
  const requiredDone = required.filter((f) => answered(values[f.id])).length;
  const unanswered = required.length - requiredDone;
  const issues = result?.validationFeedback ?? [];
  const labelOf = Object.fromEntries(form.fields.map((f) => [f.id, f.label]));

  function change(fieldId, value) {
    setValues((current) => ({ ...current, [fieldId]: value }));
    queueSave(fieldId, value);
  }

  function requestSubmit() {
    setConfirmOpen(false);
    form.fields.forEach((field) => flush(field.id));
    setSubmit({ requested: true, busy: true, error: null });
  }

  function onSubmitClick(event) {
    event.preventDefault();
    if (unanswered > 0) setConfirmOpen(true);
    else requestSubmit();
  }

  function focusField(fieldId) {
    const el = document.getElementById(`field-${fieldId}`);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  }

  return (
    <form onSubmit={onSubmitClick} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {result && (
          issues.length ? (
            <Alert variant="warning">
              <CircleAlert />
              <div>
                <AlertTitle>Attempt submitted. {issues.length} answer{issues.length === 1 ? ' needs' : 's need'} attention.</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1.5 space-y-1">
                    {issues.map((issue) => (
                      <li key={`${issue.fieldId}-${issue.ruleType}`}>
                        <button type="button" className="font-medium underline underline-offset-2" onClick={() => focusField(issue.fieldId)}>{labelOf[issue.fieldId] ?? 'Question'}</button>
                        {': '}{issue.errorMessage}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </div>
            </Alert>
          ) : (
            <Alert variant="success"><CheckCircle2 /><AlertTitle>Attempt submitted. No problems were found.</AlertTitle></Alert>
          )
        )}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Questions</CardTitle>
            <span className="text-xs text-muted-foreground"><span className="text-destructive">*</span> required</span>
          </CardHeader>
          <div className="divide-y">
            {form.fields.map((field, index) => (
              <Question
                key={field.id}
                field={field}
                number={index + 1}
                value={values[field.id]}
                disabled={completed}
                messages={feedbackByField[field.id]}
                onChange={(v) => change(field.id, v)}
                onBlur={() => flush(field.id)}
              >
                <AutosaveStatus status={statuses[field.id]} onRetry={() => retry(field.id)} />
              </Question>
            ))}
          </div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-10 lg:h-fit">
        <Card>
          <CardHeader>
            <CardTitle>{completed ? 'Result' : 'Your progress'}</CardTitle>
            <CardDescription>{required.length ? `${requiredDone} of ${required.length} required questions answered` : 'No required questions'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={requiredDone} max={required.length || 1} label="Required questions answered" />
            {completed
              ? <p className="text-sm text-muted-foreground">{issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'} found. Answers are locked; start a new attempt to try again.` : 'Every answer passed the form’s checks.'}</p>
              : <SaveSummary statuses={statuses} />}
            {submit.error && <Alert variant="destructive"><AlertCircle />{submit.error}</Alert>}
          </CardContent>
          <CardFooter>
            {completed ? (
              <Button variant="outline" className="w-full" onClick={onRestart}><RotateCcw />Start a new attempt</Button>
            ) : (
              <Button type="submit" className="w-full" disabled={submit.busy}>
                {submit.busy && <Loader2 className="animate-spin" />}{submit.busy ? 'Submitting…' : 'Submit attempt'}
              </Button>
            )}
          </CardFooter>
        </Card>
        <p className="mt-3 flex gap-2 px-1 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" />Practice copy. Nothing is sent to the real website.
        </p>
      </aside>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit with {unanswered} required question{unanswered === 1 ? '' : 's'} unanswered?</AlertDialogTitle>
            <AlertDialogDescription>You will see which answers need attention, but this attempt will be locked. Start a new attempt to try again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep answering</AlertDialogCancel>
            <AlertDialogAction onClick={requestSubmit}>Submit anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function EmptyResume({ message, onRestart }) {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 grid size-11 place-items-center rounded-full bg-destructive-soft text-destructive"><AlertCircle className="size-5" /></span>
      <p role="alert" className="text-sm font-medium">{message}</p>
      <Button variant="outline" className="mt-5" onClick={onRestart}>Start a new attempt</Button>
    </Card>
  );
}
