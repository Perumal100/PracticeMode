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

- The backend endpoints (API-05, API-06) are not implemented yet. The tests use mocked API
  responses, so they check frontend behaviour only, not a working backend.
- The GET response format is not specified in the design. `extractSavedAnswers` in
  `attemptApi.js` assumes `answers: [{ fieldId, value }]`. Confirm with the backend owner.
- Typing is debounced by 800 ms, and blur saves immediately. Pass `debounceMs: 0` to save on every change.

## Tests

```
cd frontend
npm install
npm test
```
