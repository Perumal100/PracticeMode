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

function write(all) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: the attempt still works, it just cannot be resumed later.
  }
}

/** { id, status } for this learner's attempt on the form, or null. */
export function storedAttempt(userId, formId) {
  const entry = read()[`${userId}:${formId}`];
  if (!entry) return null;
  return typeof entry === 'string' ? { id: entry, status: 'IN_PROGRESS' } : entry;
}

export function storedAttemptId(userId, formId) {
  return storedAttempt(userId, formId)?.id ?? null;
}

/** Every remembered attempt of this learner, keyed by form id. */
export function storedAttempts(userId) {
  const prefix = `${userId}:`;
  const result = {};
  for (const key of Object.keys(read())) {
    if (key.startsWith(prefix)) result[key.slice(prefix.length)] = storedAttempt(userId, key.slice(prefix.length));
  }
  return result;
}

export function rememberAttempt(userId, formId, attemptId, status = 'IN_PROGRESS') {
  const all = read();
  if (attemptId) all[`${userId}:${formId}`] = { id: attemptId, status };
  else delete all[`${userId}:${formId}`];
  write(all);
}
