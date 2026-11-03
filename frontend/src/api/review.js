// Form Reviewer calls (API-07 to API-10, reviewer app; PATCH from Dev-Atheer).
import { apiRequest } from './client.js';

export function listReviewForms(status = 'AWAITING_REVIEW') {
  return apiRequest(`/api/review/forms?status=${encodeURIComponent(status)}`);
}

export function getReviewForm(formId) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}`);
}

export function decideForm(formId, decision, rejectionReason = '') {
  const body = decision === 'REJECT' ? { decision, rejection_reason: rejectionReason } : { decision };
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/decision`, { method: 'POST', body });
}

export function updateFormMetadata(formId, changes) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}`, { method: 'PATCH', body: changes });
}

export function listNotifications() {
  return apiRequest('/api/review/notifications');
}
