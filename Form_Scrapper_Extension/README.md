# PracticeMode Form Extractor (browser extension)

The browser extension from Sprint 2 design decision **DD-03**. It extracts the structure of a multi-step online form so a Form Reviewer can turn it into a PracticeMode practice form (**US-25**, and **API-15** once the backend import endpoint exists).

It works like an application "copilot". The difference is that it never fills a form in for you. It walks the form with **fictional sample data**, records every step's fields, and **stops before final submission**. The result is a single JSON document.

## Install and run

1. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this `Form_Scrapper_Extension` folder.
3. To try it on the bundled test forms:
   ```bash
   npm install          # first time only (React for fixture 03, Playwright for tests)
   npm run fixtures     # http://localhost:4317/ lists every test form
   ```
4. Open a form and use either:
   - **the toolbar popup** (extension icon), or
   - **the on-page copilot**: a "PracticeMode" tab appears on the right edge of pages with three or more fields. It opens a side panel that stays visible across page loads while an extraction is running.

### Controls

| Control | What it does |
| --- | --- |
| **Scan current step** | Records only the visible step. Nothing is typed or clicked. |
| **Extract complete form** | Walks the whole form (automatic or assisted, see below). |
| **Enable safe auto-navigation** | When on, fills fictional data and clicks Next where allowed. When off, extraction always runs in assisted mode. |
| **Explore conditional questions** | Tries each answer of choice questions to find hidden follow-up fields. |
| **Pause / Resume / Stop extraction** | Pause keeps the current step; Stop finishes and keeps what was captured. |
| **Export partial results / Download complete JSON** | Downloads the consolidated JSON. "Complete" is enabled once extraction has finished. |
| **Preview form** | Renders the extracted structure as a local practice form. |
| **Discard** | Deletes the temporary extraction state for this tab. |

The panel shows detected steps, captured steps, field count, the current step, a step timeline (including steps not visited and why), warnings, and whether your approval is needed.

## Safety model

| Where | Automatic fill and Next | Notes |
| --- | --- | --- |
| Local test fixtures (`localhost`, `127.0.0.1`, `*.localhost`, `*.test`, `file://`) | Allowed | Full automation up to the final review screen. Designated never-issued test values are used for identity fields, and a synthetic PDF for required uploads. |
| Any other website | **Only after you approve that site** | The approval prompt explains that even intermediate Next clicks can send data to the site. You can choose **Assisted mode** instead, and revoke approval from the panel. |

The extension never:
- clicks Submit, Apply, Pay, Confirm, Create account, Register, or similar final actions
- clicks a button whose label mixes "continue" with a completion word (for example "Submit and continue"). It pauses and asks you instead.
- uploads files, fills identity or payment numbers, creates passwords, or ticks legal attestations on external sites
- solves or bypasses CAPTCHA, sign-in, identity verification or verification codes

**Assisted mode** works on any site. You fill in and navigate the form yourself, and the extension records each new step as it appears. It also records fields revealed by your answers, attributed to the choice that revealed them. Your typed answers are never stored.

Whenever automation cannot continue (CAPTCHA, a required upload, an ambiguous button, repeated validation errors), the panel says **"Your action is needed"**. Do the step yourself, then press **Continue** or simply move to the next step; extraction picks up again automatically.

## How it works

Each concern from the requirements is a separate module (`content/` unless noted):

| Module | Responsibility |
| --- | --- |
| `field_extractor.js` | Field extraction in document order, including open shadow roots: labels, help text, sections, types, required flags, every option (with optgroups), and validation constraints. Covers native controls, ARIA comboboxes/listboxes/radiogroups/checkboxes, datalists, select2-style enhanced selects, and contenteditable. |
| `option_harvester.js` | Opens custom dropdowns whose options only exist while open (react-select, MUI, Headless UI), scrolls virtualised lists to collect **all** options, then closes them without selecting. |
| `dummy_data_generator.js` + `regex_sampler.js` | Fictional, validation-compatible values. Reads type, `autocomplete`, label meaning, length and number limits, dates, `pattern` (a small regex sampler verifies every value), options, and the site's own error messages on retries. Independent of extraction; can be swapped or disabled. |
| `field_populator.js` | Enters values with the events React, Angular and Vue listen for. |
| `step_detector.js` | Classifies actions (next / final / back / ambiguous), reads step counters and steppers, finds barriers and validation messages, and decides whether two page states are the same step. |
| `navigation_controller.js` | Fill → click Next → wait for a real change (re-render, route change or full page load) → on rejection read errors and retry with alternative values (2 retries by default). |
| `conditional_tracker.js` | Explores choice questions (two levels deep), records which option reveals which fields, reports unexplored options, and restores the original answers. |
| `extraction_state.js` | Per-tab temporary state in `chrome.storage.session` (cleared when the browser closes). Survives reloads and navigation across URLs. Stores structure only. |
| `safety_policy.js` | Origin classification, consent, sensitive-field and final-action rules. Shared with the popup and the service worker. |
| `content_main.js` | The engine: capture → explore → fill → advance per step, loop detection, the manual-intervention watcher, and resume after page loads. |
| `shared/export_builder.js` | Builds the consolidated JSON. |
| `shared/copilot_*.js`, `content/copilot_panel.js`, `popup/` | One UI shared by the popup and the on-page panel. |
| `background/service_worker.js` | Routes commands to the frame holding the form (top page or iframe), injects into tabs opened before install, downloads, preview. |

### Export format (`practicemode.form-extraction/v1`)

Illustrative interchange format. PracticeMode's own storage and rendering formats are decided separately; Django validates and normalises imports (API-15).

```jsonc
{
  "schema": "practicemode.form-extraction/v1",
  "formTitle": "Background Survey",
  "source": { "url": "https://…/apply", "origin": "https://…", "environment": "production" },
  "extraction": { "status": "complete | partial | single_step", "completionReason": "reached_final_step", "mode": "auto" },
  "summary": { "detectedSteps": 3, "capturedSteps": 3, "totalFields": 14, "conditionalFields": 12 },
  "steps": [{
    "step": 1, "title": "Personal Information", "url": "https://…/apply",
    "sections": [{ "title": "Current Employment Details", "fieldIds": ["employer"] }],
    "fields": [{
      "fieldId": "employed", "order": 1, "label": "Are you currently employed?", "type": "radio", "required": true,
      "options": [{ "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }], "optionCount": 2
    }, {
      "fieldId": "employer", "order": 2, "label": "Employer Name", "type": "text", "section": "Current Employment Details",
      "conditional": { "visibleInitially": false, "showWhen": [{ "fieldId": "employed", "value": "yes", "valueLabel": "Yes" }] }
    }]
  }],
  "navigation": [{ "fromStep": 1, "toStep": 2, "action": "Next →", "kind": "in-page | route-change | full-page | by-user" }],
  "conditionalLogic": [{ "triggerFieldId": "employed", "branches": [{ "valueLabel": "Yes", "revealsFieldIds": ["employer"] }], "coverage": "complete" }],
  "unvisitedSteps": [{ "title": "Final submission", "reason": "Stopped before \"Submit Application\"…" }],
  "warnings": [{ "step": 1, "message": "…" }]
}
```

URLs are stored without query strings or fragments. Option entries record the page's declared defaults (`defaultSelected`), never the current answer.

## Tests

```bash
npm install
npm run setup:browsers   # once: downloads the Playwright Chromium build (Chrome no longer loads unpacked extensions from the command line)
npm test                 # unit + end-to-end
npm run test:unit        # pure modules: regex sampler, generator, safety policy, export builder
npm run test:e2e         # real extension in headless Chromium against tests/fixtures
```

The end-to-end suite (`tests/e2e/extraction.spec.mjs`) loads the unpacked extension and drives it through its service worker, the same way the popup does. It covers every scenario in requirement §9:
- three-step required fields, a dynamic Next button, React-controlled inputs
- Yes/No conditional sections, validation errors, custom dropdowns
- an inaccessible CAPTCHA step, a final Submit button, a required file upload
- cyclic navigation, multiple conditional branches
- multi-page forms with full reloads, lazily rendered and virtualised dropdowns, shadow DOM

It also covers the safety rules: no consent means nothing is filled, files are never uploaded to production, assisted mode never stores answers, plus pause/resume and discard. Every fixture's Submit button raises an alert, and the tests assert that no alert ever appears.

To print one extraction while debugging:

```bash
node tests/tools/extract.mjs test04_conditional_sections.html          # summary
DUMP=1 node tests/tools/extract.mjs test13_multipage_page1.html          # full JSON
```

## Unsupported scenarios and known limits

- **Closed shadow roots, canvas-drawn forms, and forms inside cross-origin frames split across several frames.** Extraction runs in the single frame with the most fields.
- **Search-as-you-type dropdowns** whose options come from the server cannot be enumerated. They are exported with `optionsSource: "typeahead"` and a warning.
- **Conditional exploration** covers native radios, selects, checkboxes, button groups and ARIA radiogroups, up to 12 questions and 12 options each, two levels deep, about 9 s per step. Custom dropdowns are not probed. Anything skipped is listed as unexplored, and the export is then `partial`.
- **Branches that change later steps** (an answer on step 1 changing step 3) are only recorded along the path actually taken; `navigation[].choicesMade` shows which answers led there.
- **Validation that only happens after final submission** cannot be discovered, because the extension never submits.
- **Calendar widgets that ignore typed input** and **drag-and-drop upload zones without a file input** need manual input (the extension pauses and asks).
- Import into the Django backend (API-15) is not wired yet; the JSON download is the hand-off.
