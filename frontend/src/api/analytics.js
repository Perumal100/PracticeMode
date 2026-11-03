// Practice analytics for Form Reviewers (counts only, no learner details).
import { apiRequest } from './client.js';

export function getAnalytics(days = 14) {
  return apiRequest(`/api/review/analytics?days=${encodeURIComponent(days)}`);
}

export function getFormAnalytics(formId) {
  return apiRequest(`/api/review/analytics/forms/${encodeURIComponent(formId)}`);
}
