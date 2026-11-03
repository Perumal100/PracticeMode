// US-11 and US-26 attempt calls (API-04, API-16). Reads and saves live in
// features/autosave/attemptApi.js (API-05, API-06).
import { apiRequest } from '../../api/client.js';

export function startAttempt(formId) {
  return apiRequest('/api/attempts', { method: 'POST', body: { formId } });
}

export function completeAttempt(attemptId) {
  return apiRequest(`/api/attempts/${encodeURIComponent(attemptId)}/completion`, { method: 'POST' });
}
