// US-08 AC-03: per-field save indicator. Failures are announced to screen
// readers and offer a Retry button.
import { SAVE_MESSAGES } from './messages.js';

export default function AutosaveStatus({ status, onRetry }) {
  if (!status) return null;

  if (status.state === 'error') {
    return (
      <span role="alert" className="autosave-status autosave-status--error">
        {status.message ?? SAVE_MESSAGES.failed}{' '}
        {onRetry && (
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        )}
      </span>
    );
  }

  const text = {
    pending: SAVE_MESSAGES.pending,
    saving: SAVE_MESSAGES.saving,
    saved: SAVE_MESSAGES.saved,
  }[status.state];
  if (!text) return null;

  return (
    <span role="status" className={`autosave-status autosave-status--${status.state}`}>
      {text}
    </span>
  );
}
