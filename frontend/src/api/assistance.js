// Assistance request calls (API-11 to API-13 and the cancel transition of STM-03).
import { apiRequest } from './client.js';

const BASE = '/api/assistance-requests';
const one = (requestId) => `${BASE}/${encodeURIComponent(requestId)}`;

// A learner's requests for one attempt, newest first.
export function listAttemptRequests(attemptId) {
  return apiRequest(`${BASE}?attemptId=${encodeURIComponent(attemptId)}`);
}

export function createRequest({ attemptId, requestedSlot, note }) {
  return apiRequest(BASE, { method: 'POST', body: { attemptId, requestedSlot, note } });
}

export function cancelRequest(requestId) {
  return apiRequest(`${one(requestId)}/cancel`, { method: 'POST' });
}
