// US-15: learners request a form by its link; reviewers link or decline the request.
import { apiRequest } from './client.js';

export function listMyRequests() {
  return apiRequest('/api/form-requests');
}

export function requestForm({ url, note }) {
  return apiRequest('/api/form-requests', { method: 'POST', body: { url, note } });
}

export function listReviewRequests(status) {
  return apiRequest(`/api/review/form-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`);
}

export function linkRequest(requestId, formId) {
  return apiRequest(`/api/review/form-requests/${encodeURIComponent(requestId)}/link`, { method: 'POST', body: { formId } });
}

export function declineRequest(requestId, reason) {
  return apiRequest(`/api/review/form-requests/${encodeURIComponent(requestId)}/decline`, { method: 'POST', body: { reason } });
}
