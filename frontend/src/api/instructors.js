// Instructor accounts, their meeting link, and form change requests.
import { apiRequest } from './client.js';
import { getSession } from './session.js';

const one = (id) => encodeURIComponent(id);

export async function signUpInstructor(details) {
  await getSession().catch(() => null); // sign-up is CSRF-protected even before a session exists
  return apiRequest('/api/instructor-signup', { method: 'POST', body: details });
}

export function getOwnProfile() {
  return apiRequest('/api/instructor/profile');
}

export function updateOwnProfile(changes) {
  return apiRequest('/api/instructor/profile', { method: 'PATCH', body: changes });
}

export function listPublishedForms() {
  return apiRequest('/api/instructor/forms');
}

export function getPublishedForm(formId) {
  return apiRequest(`/api/instructor/forms/${one(formId)}`);
}

export function listMyChangeRequests() {
  return apiRequest('/api/instructor/change-requests');
}

export function createChangeRequest({ formId, fieldId, description }) {
  return apiRequest('/api/instructor/change-requests', { method: 'POST', body: { formId, fieldId: fieldId || null, description } });
}

// Form Reviewer side.
export function listInstructors(status) {
  return apiRequest(`/api/review/instructors${status ? `?status=${one(status)}` : ''}`);
}

export function addInstructor(details) {
  return apiRequest('/api/review/instructors', { method: 'POST', body: details });
}

export function instructorAction(userId, action, note = '') {
  return apiRequest(`/api/review/instructors/${one(userId)}/${action}`, { method: 'POST', body: { note } });
}

export function listChangeRequests(status) {
  return apiRequest(`/api/review/change-requests${status ? `?status=${one(status)}` : ''}`);
}

export function answerChangeRequest(changeId, action, response) {
  return apiRequest(`/api/review/change-requests/${one(changeId)}/${action}`, { method: 'POST', body: { response } });
}
