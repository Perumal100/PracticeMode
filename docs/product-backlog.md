# PracticeMode Product Backlog

The backlog reflects the accepted Sprint 1 scope and Sprint 2 design. The 16 MVP stories form the end-to-end practice workflow; stretch and out-of-scope stories are retained to keep prioritisation explicit.

Sprint 3 delivered the import → review → practice workflow (10 of the 16 MVP stories). The instructor stories (US-03, US-05, US-22) and the guidance stories (US-09, US-12, US-18) stay in the backlog for Sprint 4. "Implemented" means the code, tests and demo walkthrough pass on `main`. A story counts as Done once a teammate has reviewed it.

## MVP

| ID | Persona | Story | Sprint 3 status |
| --- | --- | --- | --- |
| US-01 | All roles | Access the role-appropriate workspace securely. | Implemented: staff and learner sign-in, role checks, sign-in screen |
| US-02 | Learner | Search approved practice forms by keyword and category. | Implemented: keyword and multi-category search, learner home |
| US-03 | Learner | Request an instructor assistance session. | Product backlog (Sprint 4) |
| US-04 | Form Reviewer | Inspect awaiting-review forms and extracted field metadata. | Implemented: review queue and form inspection screens |
| US-05 | Instructor | View authorised assistance requests. | Product backlog (Sprint 4) |
| US-08 | Learner | Autosave an unfinished practice attempt. | Implemented: autosave, resume and save-failure warnings |
| US-09 | Learner | View original labels and available translated guidance. | Product backlog (Sprint 4) |
| US-10 | Form Reviewer | Compare an extracted form with its stored source reference. | Implemented: source link and availability flag; no automatic re-check yet |
| US-11 | Learner | Edit answers in an approved practice copy. | Implemented: practice workspace on approved forms only |
| US-12 | Learner | Open contextual field hints. | Product backlog (Sprint 4) |
| US-16 | Form Reviewer | Receive a notification when a form awaits review. | Implemented: new-import notifications |
| US-17 | Form Reviewer | Approve or reject a pending form and record the outcome. | Implemented: approve, or reject with a required reason |
| US-18 | Learner | View fictional preparation information. | Product backlog (Sprint 4) |
| US-22 | Instructor | Filter authorised learner progress. | Product backlog (Sprint 4) |
| US-25 | Form Reviewer | Import a supported form schema for human verification. | Implemented: browser extension import with server-side validation |
| US-26 | Learner | Complete an attempt and receive validation feedback. | Implemented: completion with per-field feedback |

## Stretch

| ID | Persona | Story |
| --- | --- | --- |
| US-15 | Learner | View a requested form's preparation or review status. |
| US-19 | Learner | Compare guided and independent attempts. |
| US-21 | Learner | Save favourite forms. |
| US-24 | Form Reviewer | Track learner-reported form issues from investigation to resolution. |

## Out of scope for the MVP

US-06 workshop/session-code creation, US-07 recording playback, US-13 dedicated required-field explanation, US-14 a separate answer-review screen, US-20 alternative layouts, and US-23 instructor private notes.

## Reviewer acceptance checks

- Queue and preview return no protected review data to a signed-out or non-reviewer caller.
- An awaiting form exposes its source URL and field labels, types, required flags, and validation metadata.
- Rejecting a form without a reason fails with `400` and leaves it awaiting review.
- A decision records the reviewer and timestamp. Repeating it returns `409` and changes nothing.
- Schema import creates an awaiting-review notification; imports with answer data or duplicate field positions fail with `400`.
