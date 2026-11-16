// US-11, US-12 and US-26 attempt calls (API-04, API-16, hint views). Reads and saves live in
// features/autosave/attemptApi.js (API-05, API-06).
import { apiRequest } from '../../api/client.js';

export function startAttempt(formId) {
  return apiRequest('/api/attempts', { method: 'POST', body: { formId } });
}

export function completeAttempt(attemptId) {
  return apiRequest(`/api/attempts/${encodeURIComponent(attemptId)}/completion`, { method: 'POST' });
}

// US-12: counts one opened hint for the instructor's progress view (US-22).
export function recordHintView(attemptId, fieldId) {
  return apiRequest(`/api/attempts/${encodeURIComponent(attemptId)}/hint-views`, { method: 'POST', body: { fieldId } });
}
