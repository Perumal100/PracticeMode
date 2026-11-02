// US-08 API calls, following the Sprint 2 design document (Section 5.1.1).
import { apiRequest } from '../../api/client.js';

// API-05: current practice attempt, including previously saved answers.
export function getAttempt(attemptId) {
  return apiRequest(`/api/attempts/${encodeURIComponent(attemptId)}`);
}

// API-06: save one answer. Success returns { fieldId, value, savedAt }.
export function saveAnswer(attemptId, fieldId, value) {
  return apiRequest(
    `/api/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(fieldId)}`,
    { method: 'PATCH', body: { value } },
  );
}

// The design defines Answer as (attemptId, fieldId, value, updatedAt) but does
// not give an example GET response. This assumes the attempt has an `answers`
// list of { fieldId, value }. Confirm with the backend owner and adjust here only.
export function extractSavedAnswers(attempt) {
  const list = Array.isArray(attempt?.answers) ? attempt.answers : [];
  const values = {};
  for (const answer of list) {
    if (answer && answer.fieldId !== undefined && answer.fieldId !== null) {
      values[String(answer.fieldId)] = answer.value;
    }
  }
  return values;
}
