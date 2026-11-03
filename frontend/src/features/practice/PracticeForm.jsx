// US-11 practise an approved form, US-08 autosave and resume, US-26 complete
// and see validation feedback.
import { useEffect, useMemo, useState } from 'react';
import { getForm as defaultGetForm } from '../../api/catalog.js';
import { AutosaveStatus, useAutosave, useResumeAttempt } from '../autosave/index.js';
import FieldInput from './FieldInput.jsx';
import { completeAttempt as defaultCompleteAttempt, startAttempt as defaultStartAttempt } from './practiceApi.js';
import { rememberAttempt, storedAttemptId } from './attemptStore.js';

const FORM_ERRORS = {
  403: 'This form is not available for practice. It may still be awaiting review or may have been rejected.',
  404: 'This practice form does not exist.',
};
const START_ERRORS = {
  403: 'This form is not available for practice. It may still be awaiting review or may have been rejected.',
  422: 'This form contains questions PracticeMode cannot check yet, so it cannot be practised.',
};

export default function PracticeForm({ formId, user, onBack, api = {} }) {
  const getForm = api.getForm ?? defaultGetForm;
  const startAttempt = api.startAttempt ?? defaultStartAttempt;
  const [form, setForm] = useState({ status: 'loading', data: null, error: null });
  const [attemptId, setAttemptId] = useState(() => storedAttemptId(user.id, formId));
  const [startError, setStartError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getForm(formId).then(
      (data) => !cancelled && setForm({ status: 'ready', data, error: null }),
      (error) => !cancelled && setForm({ status: 'error', data: null, error: FORM_ERRORS[error?.status] ?? 'The form could not be loaded. Please try again.' }),
    );
    return () => { cancelled = true; };
  }, [formId, getForm]);

  function openAttempt(id) {
    rememberAttempt(user.id, formId, id);
    setAttemptId(id);
  }

  async function start() {
    setStartError(null);
    try {
      const attempt = await startAttempt(formId);
      openAttempt(attempt.id);
    } catch (error) {
      setStartError(START_ERRORS[error?.status] ?? 'The practice attempt could not be started. Please try again.');
    }
  }

  return (
    <section>
      <button type="button" className="link" onClick={onBack}>← All forms</button>
      {form.status === 'loading' && <p className="muted">Loading form…</p>}
      {form.status === 'error' && <p role="alert" className="error card">{form.error}</p>}
      {form.status === 'ready' && (
        <>
          <h2>{form.data.title}</h2>
          {attemptId ? (
            <AttemptView key={attemptId} attemptId={attemptId} form={form.data} api={api} onRestart={() => openAttempt(null)} />
          ) : (
            <div className="card">
              <p>This practice copy has {form.data.fields.length} question{form.data.fields.length === 1 ? '' : 's'}. Use made-up details only. Nothing you enter is sent to the real website.</p>
              {startError && <p role="alert" className="error">{startError}</p>}
              <button type="button" className="primary" onClick={start}>Start practice</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AttemptView({ attemptId, form, api, onRestart }) {
  const completeAttempt = api.completeAttempt ?? defaultCompleteAttempt;
  const resume = useResumeAttempt(attemptId, api.getAttempt ? { getAttempt: api.getAttempt } : undefined);
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [submit, setSubmit] = useState({ requested: false, busy: false, error: null });
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
      if (resume.isCompleted) setResult({ validationFeedback: resume.attempt.validationFeedback ?? [] });
    }
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
    completeAttempt(attemptId).then(
      (data) => { setResult(data); setSubmit({ requested: false, busy: false, error: null }); },
      (error) => {
        // 409: already completed; the stored result comes back unchanged.
        if (error?.status === 409 && error.body?.validationFeedback) {
          setResult(error.body);
          setSubmit({ requested: false, busy: false, error: null });
        } else {
          setSubmit({ requested: false, busy: false, error: error?.status === 403 || error?.status === 404 ? 'This attempt is no longer available.' : 'Your attempt could not be submitted. Please try again.' });
        }
      },
    );
  }, [submit.requested, statuses, attemptId, completeAttempt]);

  const feedbackByField = useMemo(() => {
    const map = {};
    for (const item of result?.validationFeedback ?? []) (map[item.fieldId] ??= []).push(item.errorMessage);
    return map;
  }, [result]);

  if (resume.status === 'loading') return <p className="muted">Loading your answers…</p>;
  if (resume.status === 'error') {
    return (
      <div className="card">
        <p role="alert" className="error">{resume.error}</p>
        <button type="button" onClick={onRestart}>Start a new attempt</button>
      </div>
    );
  }

  function change(fieldId, value) {
    setValues((current) => ({ ...current, [fieldId]: value }));
    queueSave(fieldId, value);
  }

  function requestSubmit(event) {
    event.preventDefault();
    form.fields.forEach((field) => flush(field.id));
    setSubmit({ requested: true, busy: true, error: null });
  }

  const issueCount = result?.validationFeedback?.length ?? 0;
  return (
    <form className="card practice" onSubmit={requestSubmit} noValidate>
      {result && (
        <div role="status" className={issueCount ? 'notice warn' : 'notice ok'}>
          {issueCount
            ? `Attempt submitted. ${issueCount} answer${issueCount === 1 ? ' needs' : 's need'} attention; see the messages below.`
            : 'Attempt submitted. No problems were found.'}
        </div>
      )}
      <p className="muted"><span className="required">*</span> marks a required question.</p>
      {form.fields.map((field) => {
        const messages = feedbackByField[field.id] ?? [];
        const feedbackId = messages.length ? `feedback-${field.id}` : undefined;
        return (
          <div key={field.id} className={`field ${messages.length ? 'has-error' : ''}`}>
            <label htmlFor={`field-${field.id}`}>
              {field.label}
              {field.required && <span className="required"> *<span className="sr-only"> (required)</span></span>}
            </label>
            <FieldInput
              field={field}
              value={values[field.id] ?? null}
              disabled={completed}
              describedBy={feedbackId}
              onChange={(value) => change(field.id, value)}
              onBlur={() => flush(field.id)}
            />
            <AutosaveStatus status={statuses[field.id]} onRetry={() => retry(field.id)} />
            {messages.length > 0 && (
              <ul id={feedbackId} className="feedback">{messages.map((m) => <li key={m}>{m}</li>)}</ul>
            )}
          </div>
        );
      })}
      {submit.error && <p role="alert" className="error">{submit.error}</p>}
      {completed ? (
        <button type="button" onClick={onRestart}>Start a new attempt</button>
      ) : (
        <button type="submit" className="primary" disabled={submit.busy}>{submit.busy ? 'Submitting…' : 'Submit attempt'}</button>
      )}
    </form>
  );
}
