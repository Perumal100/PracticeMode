# PracticeMode frontend

React + Vite client for the Django API. The dev server proxies `/api` to `http://localhost:8000` (set `API_TARGET` to use another backend), so the session and CSRF cookies work without CORS.

## UI stack

- **Tailwind CSS v4** through `@tailwindcss/vite`. Design tokens (colours, radius, font) live in `src/index.css` as CSS variables, following the shadcn/ui convention. Change the palette there, not in components.
- **shadcn/ui-style components** in `src/components/ui` (button, card, input, badge, alert, table, tabs, dialog, progress, skeleton). They are copied into the project in the shadcn way and built with `class-variance-authority`, `tailwind-merge` and Radix primitives (`@radix-ui/react-alert-dialog`, `@radix-ui/react-slot`).
- **Lucide** icons, **Sonner** toasts, and **Inter** (self-hosted through `@fontsource-variable/inter`, so no third-party font requests are made).
- **Layout:** a sidebar on wide screens and a top bar on phones (`src/components/app-shell.jsx`). Every page works at a 360 px width.

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
| `#/forms`: learner home | Learner | US-02 | `GET /api/forms?keyword=&category=` |
| `#/forms/<id>`: practice workspace | Learner | US-11, US-08, US-26 | `GET /api/forms/<id>`, `POST /api/attempts`, `GET`/`PATCH` attempt answers, `POST .../completion` |
| `#/review`: reviewer dashboard | Form Reviewer | US-04, US-16 | `GET /api/review/forms?status=` (all three lists), `GET /api/review/notifications` |
| `#/review/<id>`: form inspection | Form Reviewer | US-04, US-10, US-17 | `GET`/`PATCH /api/review/forms/<id>`, `POST .../decision` |
| `#/insights`: practice insights | Form Reviewer | (supports US-10, US-17) | `GET /api/review/analytics?days=` |
| `#/insights/<id>`: one form's insights | Form Reviewer | (supports US-10, US-17) | `GET /api/review/analytics/forms/<id>` |
| `#/instructor` | Instructor | n/a | Placeholder until US-03, US-05 and US-22 |

- Learners sign in with a display name only. Staff use a username and password and land on the workspace for their role.
- **Learner home:** totals (available, in progress, submitted), keyword search, category filter pills, and form cards that offer Practise, Continue or View result.
- **Practice workspace:** numbered questions, a "Saved ✓" status under each answer (`src/features/autosave`), and a side panel with progress on required questions and an overall save status. Submitting with required questions unanswered asks first. After completion, a summary links each issue to its field, and the answers lock.
- **Reviewer dashboard:** counts by status, a "New imports" panel, and a queue table with status tabs.
- **Form inspection:** the source link with a warning when the source was unreachable, the extracted fields table, a category editor, and approve or reject with confirmation and a required rejection reason.
- **Practice insights:** counts only. Totals, a chart of attempts per day (7, 14 or 30 days; hover or focus a day for its numbers), a per-form table, and for each form the questions learners miss most, by rule. No learner names or answers are requested or shown.
- The open attempt for each form is remembered in `localStorage` per learner, so reopening the form resumes it. A new sign-in is a new learner, so earlier attempts are not resumed (Sprint 2, DD-05).
- The server enforces every permission. The client only routes each role to its own screens.

## Layout

```
src/index.css             Tailwind entry and design tokens
src/components/ui/        shadcn/ui-style primitives
src/components/           app shell, page header, stat card, empty state, brand
src/api/                  client.js (fetch, CSRF), session.js, catalog.js, review.js, analytics.js
src/features/auth         SignIn
src/features/catalog      Catalog (learner home)
src/features/practice     PracticeForm, FieldInput, practiceApi, attemptStore
src/features/autosave     US-08 hooks and status (Kashvi)
src/features/review       ReviewQueue (dashboard), ReviewDetail, FieldEditor
src/features/analytics    Insights, FormInsights, ActivityChart
src/lib/                  useHashRoute, utils (cn), format
```
