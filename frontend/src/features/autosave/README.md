# US-08 Autosave and resume (frontend)

Owner: Kashvi Prawal

Covers Sprint 1 US-08: AC-01 automatic save, AC-02 resume saved work, AC-03 save-failure warning.
Uses API-05 `GET /api/attempts/{attemptId}` and API-06 `PATCH /api/attempts/{attemptId}/answers/{fieldId}`
from the Sprint 2 design document.

## Using it in the practice form (US-11)

```jsx
import { useAutosave, useResumeAttempt, AutosaveStatus } from '../autosave';

const { status, savedAnswers, isCompleted, error } = useResumeAttempt(attemptId);
const { statuses, queueSave, flush, retry } = useAutosave({ attemptId, enabled: !isCompleted });

// For each field:
//   initial value:  savedAnswers[field.id]
//   onChange:       queueSave(field.id, newValue)
//   onBlur:         flush(field.id)
//   next to field:  <AutosaveStatus status={statuses[field.id]} onRetry={() => retry(field.id)} />
```

## Status

- The backend for API-05 and API-06 is on the `dev-rohan` branch (`attempts` app). Its responses
  match what this feature expects:
  - `GET /api/attempts/{attemptId}` returns `{ id, formId, status, ..., answers: [{ fieldId, value, savedAt }] }`.
  - `PATCH .../answers/{fieldId}` with `{ value }` returns `{ fieldId, value, savedAt }`.
  - IDs are UUID strings. `value` is a string, a boolean (checkbox), a number, or `null` (cleared).
- The tests use mocked API responses, so they check frontend behaviour only. `attemptApi.test.js`
  pins the backend's response shape.
- Save errors from that backend and the message shown:

  | Response | Message |
  | --- | --- |
  | `400 INVALID_VALUE` / `FIELD_FORM_MISMATCH` | Not saved: this answer is not valid. |
  | `401` session ended | Not saved: your session has ended. Sign in again. |
  | `403 ATTEMPT_FORBIDDEN` | Not saved: you do not have access to this attempt. |
  | `404 ATTEMPT_NOT_FOUND` / `FIELD_NOT_FOUND` | Not saved: this attempt or field no longer exists. |
  | `409 ATTEMPT_COMPLETED` | Not saved: this attempt has already been submitted. |
  | `422 UNSUPPORTED_FORM_SCHEMA` | Not saved: this form cannot be practised right now. |
  | `503 SAVE_FAILED`, network error | Not saved. Retry. |

- Learners need a session before these calls work: `GET /api/session` sets the CSRF cookie, then
  `POST /api/login` with `{ "role": "LEARNER", "displayName": "..." }` (dev-rohan, `accounts` app).
  The sign-in screen and the practice form page (US-11) that use this feature are not built yet.
- Typing is debounced by 800 ms, and blur saves immediately. Pass `debounceMs: 0` to save on every change.

## Tests

```
cd frontend
npm install
npm test
```
