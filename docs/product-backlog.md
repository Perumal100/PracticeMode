# PracticeMode Product Backlog

The backlog reflects the accepted Sprint 1 scope and Sprint 2 design. The 16 MVP stories form the end-to-end practice workflow; stretch and out-of-scope stories are retained to keep prioritisation explicit.

Sprint 3 delivered the import, review and practice workflow (10 of the 16 MVP stories). Sprint 4 implemented the other six MVP stories and stretch story US-15 on local branches, each with tests for its acceptance criteria. "Implemented" means the code and tests pass; a story counts as Done once a teammate has reviewed its pull request and it is merged.

## MVP

| ID | Persona | Story | Status |
| --- | --- | --- | --- |
| US-01 | All roles | Access the role-appropriate workspace securely. | Done in Sprint 3. Sprint 4 change, implemented: learners create an account with a username, display name and password (no email), and their practice history follows the account |
| US-02 | Learner | Search approved practice forms by keyword and category. | Implemented: keyword and multi-category search, learner home |
| US-03 | Learner | Request an instructor assistance session. | Implemented in Sprint 4, awaiting review: request with time slot and note, confirmation and status |
| US-04 | Form Reviewer | Inspect awaiting-review forms and extracted field metadata. | Implemented: review queue and form inspection screens |
| US-05 | Instructor | View authorised assistance requests. | Implemented in Sprint 4, awaiting review: instructor queue, accept with meeting details, complete or cancel |
| US-08 | Learner | Autosave an unfinished practice attempt. | Implemented: autosave, resume and save-failure warnings |
| US-09 | Learner | View original labels and available translated guidance. | Implemented in Sprint 4, awaiting review: guidance-language picker, translations beside the original, missing translations named |
| US-10 | Form Reviewer | Compare an extracted form with its stored source reference. | Implemented: source link and availability flag; no automatic re-check yet |
| US-11 | Learner | Edit answers in an approved practice copy. | Implemented: practice workspace on approved forms only |
| US-12 | Learner | Open contextual field hints. | Implemented in Sprint 4, awaiting review: per-question hints; fields without one show no control |
| US-16 | Form Reviewer | Receive a notification when a form awaits review. | Implemented: new-import notifications |
| US-17 | Form Reviewer | Approve or reject a pending form and record the outcome. | Implemented: approve, or reject with a required reason |
| US-18 | Learner | View fictional preparation information. | Implemented in Sprint 4, awaiting review: checklist before starting, examples marked fictional, empty case stated |
| US-22 | Instructor | Filter authorised learner progress. | Implemented in Sprint 4, awaiting review: unfinished, repeated-error and frequent-hint filters, limited to learners whose request the instructor accepted |
| US-25 | Form Reviewer | Import a supported form schema for human verification. | Implemented: browser extension import with server-side validation |
| US-26 | Learner | Complete an attempt and receive validation feedback. | Implemented: completion with per-field feedback |

## Stretch

| ID | Persona | Story |
| --- | --- | --- |
| US-15 | Learner | View a requested form's preparation or review status. Implemented in Sprint 4, awaiting review: learners request a form by link and follow it from received to ready to practise. |
| US-19 | Learner | Compare guided and independent attempts. |
| US-21 | Learner | Save favourite forms. |
| US-24 | Form Reviewer | Track learner-reported form issues from investigation to resolution. |

## Also implemented in Sprint 4 (requested during the sprint)

- **Form versions for learners:** each published version is numbered; learners see what changed in each and can still read a version they practised after it was replaced.
- **Form deletion by reviewers:** deletes every version of a form; a form learners have practised is withdrawn instead and their results are kept.

## Out of scope for the MVP

US-06 workshop/session-code creation, US-07 recording playback, US-13 dedicated required-field explanation, US-14 a separate answer-review screen, US-20 alternative layouts, and US-23 instructor private notes.

## Reviewer acceptance checks

- Queue and preview return no protected review data to a signed-out or non-reviewer caller.
- An awaiting form exposes its source URL and field labels, types, required flags, and validation metadata.
- Rejecting a form without a reason fails with `400` and leaves it awaiting review.
- A decision records the reviewer and timestamp. Repeating it returns `409` and changes nothing.
- Schema import creates an awaiting-review notification; imports with answer data or duplicate field positions fail with `400`.
