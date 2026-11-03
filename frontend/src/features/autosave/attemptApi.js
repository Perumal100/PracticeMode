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

// API-05 returns the attempt with an `answers` list of { fieldId, value, savedAt }
// (dev-rohan, attempts.serializers.AttemptSerializer). Adjust here only if it changes.
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
