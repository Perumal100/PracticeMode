// US-04 review queue and US-16 pending-review notifications.
import { useEffect, useState } from 'react';
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
  const [queue, setQueue] = useState({ state: 'loading', forms: [], error: null });
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setQueue({ state: 'loading', forms: [], error: null });
    listReviewForms(status).then(
      (forms) => !cancelled && setQueue({ state: 'ready', forms, error: null }),
      (error) => !cancelled && setQueue({ state: 'error', forms: [], error: reviewErrorMessage(error) }),
    );
    return () => { cancelled = true; };
  }, [status, listReviewForms]);

  useEffect(() => {
    listNotifications().then(setNotifications, () => setNotifications([]));
  }, [listNotifications]);

  return (
    <section>
      <h2>Form review</h2>
      {notifications.length > 0 && (
        <div className="card notice info" role="status">
          <strong>{notifications.length} new form{notifications.length === 1 ? '' : 's'} awaiting review</strong>
          <ul>
            {notifications.map((n) => (
              <li key={n.id}>
                <button type="button" className="link" onClick={() => onOpen(n.form_id)}>{n.form_title}</button>
                <span className="muted"> · imported {new Date(n.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="tabs" role="tablist">
        {STATUSES.map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={status === value} onClick={() => setStatus(value)}>{label}</button>
        ))}
      </div>
      {queue.state === 'loading' && <p className="muted">Loading…</p>}
      {queue.state === 'error' && <p role="alert" className="error card">{queue.error}</p>}
      {queue.state === 'ready' && queue.forms.length === 0 && <p className="card">No forms in this list.</p>}
      {queue.state === 'ready' && queue.forms.length > 0 && (
        <table className="card table">
          <thead>
            <tr><th>Title</th><th>Fields</th><th>Source</th><th>Imported</th><th /></tr>
          </thead>
          <tbody>
            {queue.forms.map((form) => (
              <tr key={form.id}>
                <td>{form.title}</td>
                <td>{form.field_count}</td>
                <td>{form.source_available ? 'Reachable' : 'Unavailable'}</td>
                <td>{new Date(form.created_at).toLocaleDateString()}</td>
                <td><button type="button" onClick={() => onOpen(form.id)}>Inspect</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
