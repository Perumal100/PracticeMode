// US-02 catalog calls (API-02, API-03).
import { apiRequest } from './client.js';

export function listForms({ keyword = '', categories = [] } = {}) {
  const params = new URLSearchParams();
  if (keyword.trim()) params.set('keyword', keyword.trim());
  for (const category of categories) params.append('category', category);
  const query = params.toString();
  return apiRequest(`/api/forms${query ? `?${query}` : ''}`);
}

export function getForm(formId) {
  return apiRequest(`/api/forms/${encodeURIComponent(formId)}`);
}
