// US-04 inspect extracted fields, US-10 compare with the source, US-17 approve
// or reject. Title and category edits use Dev-Atheer's PATCH endpoint.
import { useEffect, useState } from 'react';
import {
  decideForm as defaultDecideForm,
  getReviewForm as defaultGetReviewForm,
  updateFormMetadata as defaultUpdateFormMetadata,
} from '../../api/review.js';
import { reviewErrorMessage } from './ReviewQueue.jsx';

export function describeRules(validation = {}) {
  const parts = [];
  if (validation.allowedValues) parts.push(`Options: ${validation.allowedValues.join(', ')}`);
  if (validation.minLength !== undefined || validation.maxLength !== undefined) {
    parts.push(`Length ${validation.minLength ?? 0}–${validation.maxLength ?? '∞'}`);
  }
  if (validation.min !== undefined || validation.max !== undefined) parts.push(`Value ${validation.min ?? '−∞'}–${validation.max ?? '∞'}`);
  const known = new Set(['allowedValues', 'minLength', 'maxLength', 'min', 'max', 'required']);
  for (const [key, value] of Object.entries(validation)) if (!known.has(key)) parts.push(`${key}: ${JSON.stringify(value)}`);
  return parts.join(' · ') || 'None';
}

export default function ReviewDetail({ formId, onBack, api = {} }) {
  const getReviewForm = api.getReviewForm ?? defaultGetReviewForm;
  const decideForm = api.decideForm ?? defaultDecideForm;
  const updateFormMetadata = api.updateFormMetadata ?? defaultUpdateFormMetadata;
  const [form, setForm] = useState({ state: 'loading', data: null, error: null });
  const [reason, setReason] = useState('');
  const [categories, setCategories] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getReviewForm(formId).then(
      (data) => {
        if (cancelled) return;
        setForm({ state: 'ready', data, error: null });
        setCategories((data.categories ?? []).join(', '));
      },
      (error) => !cancelled && setForm({ state: 'error', data: null, error: reviewErrorMessage(error) }),
    );
    return () => { cancelled = true; };
  }, [formId, getReviewForm]);

  async function decide(decision) {
    setMessage(null);
    if (decision === 'REJECT' && !reason.trim()) {
      setMessage({ kind: 'error', text: 'Give a reason before rejecting, so the problem is recorded.' });
      return;
    }
    setBusy(true);
    try {
      const data = await decideForm(formId, decision, reason.trim());
      setForm({ state: 'ready', data, error: null });
      setMessage({ kind: 'ok', text: decision === 'APPROVE' ? 'Approved. Learners can now practise this form.' : 'Rejected. Learners cannot start this form.' });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error?.status === 409 ? 'This form has already been reviewed. Reload to see the recorded decision.'
          : error?.status === 400 ? 'The decision was not accepted. Check the reason and try again.'
            : reviewErrorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveCategories(event) {
    event.preventDefault();
    setMessage(null);
    const list = [...new Set(categories.split(',').map((c) => c.trim()).filter(Boolean))];
    try {
      const data = await updateFormMetadata(formId, { categories: list });
      setForm({ state: 'ready', data, error: null });
      setMessage({ kind: 'ok', text: 'Categories saved.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error?.status === 409 ? 'Only forms awaiting review can be edited.' : 'The categories could not be saved.' });
    }
  }

  if (form.state === 'loading') return <p className="muted">Loading form…</p>;
  if (form.state === 'error') {
    return (
      <section>
        <button type="button" className="link" onClick={onBack}>← Review queue</button>
        <p role="alert" className="error card">{form.error}</p>
      </section>
    );
  }

  const data = form.data;
  const pending = data.status === 'AWAITING_REVIEW';
  return (
    <section>
      <button type="button" className="link" onClick={onBack}>← Review queue</button>
      <h2>{data.title}</h2>
      <div className="card">
        <p>Status: <strong>{data.status.replace('_', ' ').toLowerCase()}</strong></p>
        <p>
          Source: <a href={data.source_url} target="_blank" rel="noopener noreferrer">{data.source_url}</a>
        </p>
        {!data.source_available && (
          <p className="notice warn">The importer could not reach this source. Do not treat the form as verified against it.</p>
        )}
        {data.decision && (
          <p>
            {data.decision.outcome === 'APPROVED' ? 'Approved' : 'Rejected'} by {data.decision.reviewer} on {new Date(data.decision.decided_at).toLocaleString()}
            {data.decision.rejection_reason && <> · Reason: {data.decision.rejection_reason}</>}
          </p>
        )}
      </div>

      <table className="card table">
        <caption>Extracted fields: compare each one with the source page</caption>
        <thead><tr><th>#</th><th>Label</th><th>Input type</th><th>Required</th><th>Validation</th></tr></thead>
        <tbody>
          {data.fields.map((field) => (
            <tr key={field.id}>
              <td>{field.position}</td>
              <td>{field.label}</td>
              <td>{field.input_type}</td>
              <td>{field.required ? 'Yes' : 'No'}</td>
              <td>{describeRules(field.validation)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'error' : 'notice ok'}>{message.text}</p>}

      {pending && (
        <>
          <form className="card" onSubmit={saveCategories}>
            <label>
              Categories (comma separated, used by learner search)
              <input value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="Housing, Government" />
            </label>
            <button type="submit">Save categories</button>
          </form>
          <div className="card decision">
            <label>
              Rejection reason
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required when rejecting" />
            </label>
            <div className="row">
              <button type="button" className="primary" disabled={busy} onClick={() => decide('APPROVE')}>Approve</button>
              <button type="button" className="danger" disabled={busy} onClick={() => decide('REJECT')}>Reject</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
