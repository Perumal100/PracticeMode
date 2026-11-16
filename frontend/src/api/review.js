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

// Corrections before the decision (pending forms only).
export function addField(formId, field) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/fields`, { method: 'POST', body: field });
}

export function updateField(formId, fieldId, changes) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/fields/${encodeURIComponent(fieldId)}`, { method: 'PATCH', body: changes });
}

export function deleteField(formId, fieldId) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/fields/${encodeURIComponent(fieldId)}`, { method: 'DELETE' });
}

export function reorderFields(formId, fieldIds) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/fields/order`, { method: 'PUT', body: { fieldIds } });
}

// Sample answers checked like a learner's submission; nothing is saved.
export function checkPreviewAnswers(formId, answers) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/preview-check`, { method: 'POST', body: { answers } });
}

// A copy of an approved form to correct after its source changed (pending until approved).
export function reviseForm(formId) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/revisions`, { method: 'POST' });
}

// Deletes a form and all its versions; a form learners practised is withdrawn instead.
// Resolves to { outcome: 'DELETED' | 'WITHDRAWN' }.
export function deleteForm(formId) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}`, { method: 'DELETE' });
}

// Guidance a reviewer writes (US-12 hints, US-09 translations, US-18 checklist).
// Each call replaces what was there; editable while pending or approved.
export function saveFieldGuidance(formId, fieldId, { hint, translations }) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/fields/${encodeURIComponent(fieldId)}/guidance`, { method: 'PUT', body: { hint, translations } });
}

export function saveChecklist(formId, items) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/checklist`, { method: 'PUT', body: { items } });
}

// AI drafts of hints or translations; learners do not see them until approved.
// Resolves to { created, skipped, providers }.
// `fieldIds` limits the request to a batch of questions, so progress can be shown.
export function draftGuidance(formId, task, languages, fieldIds) {
  const body = { task, ...(languages ? { languages } : {}), ...(fieldIds ? { fieldIds } : {}) };
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/guidance/ai`, { method: 'POST', body });
}

export function approveDrafts(formId, fieldIds) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/guidance/approve-drafts`, { method: 'POST', body: fieldIds ? { fieldIds } : {} });
}

export function discardDrafts(formId) {
  return apiRequest(`/api/review/forms/${encodeURIComponent(formId)}/guidance/discard-drafts`, { method: 'POST', body: {} });
}
