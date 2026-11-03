// Remembers which attempt this learner has open for each form, so reopening a
// form resumes it (US-08 AC-02). Attempts belong to the signed-in learner, and
// a new sign-in is a new learner, so entries are keyed by user id.
const KEY = 'pm_attempts_v1';

function read() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function storedAttemptId(userId, formId) {
  return read()[`${userId}:${formId}`] ?? null;
}

export function rememberAttempt(userId, formId, attemptId) {
  const all = read();
  if (attemptId) all[`${userId}:${formId}`] = attemptId;
  else delete all[`${userId}:${formId}`];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: the attempt still works, it just cannot be resumed later.
  }
}
