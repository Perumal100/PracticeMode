// A learner's practice history, kept on their account.
import { apiRequest } from './client.js';

export function listMyAttempts() {
  return apiRequest('/api/attempts');
}

/** The attempt to open for a form: the newest unfinished one, else the newest submitted one. */
export function attemptForForm(history, formId) {
  const mine = history.filter((attempt) => attempt.formId === formId);
  return mine.find((attempt) => attempt.status === 'IN_PROGRESS') ?? mine[0] ?? null;
}
