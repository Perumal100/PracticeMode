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

// Instructor side (API-12, API-13, API-17 and the complete transition of STM-03).
export function listRequests() {
  return apiRequest(BASE);
}

export function getRequest(requestId) {
  return apiRequest(one(requestId));
}

export function scheduleRequest(requestId, meetingDetails) {
  return apiRequest(`${one(requestId)}/schedule`, { method: 'PATCH', body: { meetingDetails } });
}

export function completeRequest(requestId) {
  return apiRequest(`${one(requestId)}/complete`, { method: 'POST' });
}
