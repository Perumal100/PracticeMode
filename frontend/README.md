# PracticeMode frontend

React + Vite client for the Django API. The dev server proxies `/api` to `http://localhost:8000`, so the session and CSRF cookies work without CORS.

## Run

```bash
npm install
npm run dev      # http://localhost:5173 (start the Django server on :8000 first)
npm test         # Vitest unit tests; the API is mocked
npm run build    # production bundle in dist/
```

The screens need the integrated backend: `reviewer` (develop-perumal and Dev-Atheer) plus `accounts`, `catalog` and `attempts` (dev-rohan).

## Screens

| Route | Who | Stories | API |
| --- | --- | --- | --- |
| Sign in | everyone | US-01 | `GET /api/session`, `POST /api/login`, `POST /api/logout` |
| `#/forms` | Learner | US-02 | `GET /api/forms?keyword=&category=` |
| `#/forms/<id>` | Learner | US-11, US-08, US-26 | `GET /api/forms/<id>`, `POST /api/attempts`, `GET`/`PATCH` attempt answers, `POST .../completion` |
| `#/review` | Form Reviewer | US-04, US-16 | `GET /api/review/forms?status=`, `GET /api/review/notifications` |
| `#/review/<id>` | Form Reviewer | US-04, US-10, US-17 | `GET`/`PATCH /api/review/forms/<id>`, `POST .../decision` |

- Learners sign in with a display name only. Staff use a username and password and land on the workspace for their role. Instructors see a placeholder until US-03, US-05 and US-22 are built.
- The practice page autosaves each answer (`src/features/autosave`), shows "Saved ✓" only after the server confirms, and submits only after queued saves finish. It also shows the server's validation feedback next to each field.
- The open attempt for each form is remembered in `localStorage` per learner, so reopening the form resumes it. A new sign-in is a new learner, so earlier attempts are not resumed (Sprint 2, DD-05).
- The server enforces every permission. The client only routes each role to its own screens.

## Layout

```
src/api/            client.js (fetch, CSRF), session.js, catalog.js, review.js
src/features/auth   SignIn
src/features/catalog Catalog
src/features/practice PracticeForm, FieldInput, practiceApi, attemptStore
src/features/autosave US-08 hooks and status (Kashvi)
src/features/review ReviewQueue, ReviewDetail
src/lib/useHashRoute.js
```
