/**
 * End-to-end tests: the real unpacked extension in Chromium, driven through
 * its service worker exactly like the popup / on-page copilot drive it.
 * Fixtures on localhost count as authorised test sites; the same fixtures
 * served from PRODUCTION_ORIGIN count as an external production website.
 *
 * Every fixture's final "Submit" button raises an alert, so `dialogs` staying
 * empty proves that no final submission was ever clicked.
 */
import { test, expect } from '@playwright/test';
import {
  launchExtension, openPage, command, waitForStatus, exportDoc, getState,
  fieldLabels, findField, PRODUCTION_ORIGIN,
} from './helpers.mjs';

let env;
test.beforeAll(async () => { env = await launchExtension(); });
test.afterAll(async () => { await env?.close(); });

async function extract(url, { mode = 'auto', until = ['complete', 'awaiting_user', 'awaiting_consent', 'error', 'stopped'] } = {}) {
  const ctx = await openPage(env, url);
  const started = await command(env, ctx.tabId, 'start', { mode });
  expect(started.success, started.error).toBe(true);
  const state = await waitForStatus(env, ctx.tabId, until);
  return { ...ctx, state, doc: await exportDoc(env, ctx.tabId) };
}

function assertValidExport(doc) {
  const roundTrip = JSON.parse(JSON.stringify(doc));
  expect(roundTrip.schema).toBe('practicemode.form-extraction/v1');
  const ids = doc.steps.flatMap((s) => s.fields.map((f) => f.fieldId));
  expect(new Set(ids).size, 'field ids are unique').toBe(ids.length);
  for (const step of doc.steps) {
    step.fields.forEach((f, i) => expect(f.order).toBe(i + 1));
    for (const f of step.fields) {
      expect(f.label, `field ${f.fieldId} has a label`).toBeTruthy();
      if (f.options) expect(f.optionCount).toBe(f.options.length);
    }
  }
}

test('three-step form: extracts each step before navigating, stops before final submit', async () => {
  const { doc, state, dialogs } = await extract(`${env.base}/test01_three_step_form.html`);
  expect(state.status).toBe('complete');
  expect(state.completionReason).toBe('reached_final_step');
  expect(doc.steps.map((s) => s.title).slice(0, 3)).toEqual(['Personal Information', 'Education', 'Experience']);
  expect(fieldLabels(doc.steps[0])).toEqual(['First Name', 'Last Name', 'Email Address', 'Phone Number']);
  expect(doc.steps[0].fields.filter((f) => f.required).map((f) => f.label)).toEqual(['First Name', 'Last Name', 'Email Address']);
  expect(findField(doc, 'First Name').validation).toMatchObject({ minLength: 2, maxLength: 50 });
  const education = findField(doc, 'Highest Education');
  expect(education.options.map((o) => o.label)).toEqual(['-- Select --', 'High School', 'Associate Degree', "Bachelor's Degree", "Master's Degree", 'PhD']);
  expect(education.options[0].isPlaceholder).toBe(true);
  expect(doc.unvisitedSteps).toContainEqual(expect.objectContaining({ title: 'Final submission' }));
  expect(doc.extraction.status).toBe('complete');
  expect(dialogs).toEqual([]);
  assertValidExport(doc);
});

test('dynamic Next button is enabled by filling required fields', async () => {
  const { doc, state, dialogs } = await extract(`${env.base}/test02_dynamic_next_button.html`);
  expect(state.completionReason).toBe('reached_final_step');
  expect(doc.steps.map((s) => s.title)).toEqual(['Basic Info', 'Security', 'Preferences']);
  expect(findField(doc, 'Time Zone').options).toHaveLength(5);
  expect(dialogs).toEqual([]);
});

test('React-controlled inputs receive values through framework-compatible events', async () => {
  const { doc, state } = await extract(`${env.base}/test03_react_form.html`);
  expect(state.completionReason).toBe('reached_final_step');
  expect(doc.steps.map((s) => s.title)).toEqual(['Profile Setup', 'About You', 'Final Details']);
  // React reuses DOM nodes between steps; the field must still be recorded.
  expect(fieldLabels(doc.steps[1])).toEqual(['Bio (min 20 chars)', 'Interests']);
  expect(findField(doc, 'Your Role').options.map((o) => o.value)).toEqual(['', 'student', 'developer', 'designer', 'manager']);
});

test('conditional Yes/No sections are recorded with the choice that reveals them', async () => {
  const { doc } = await extract(`${env.base}/test04_conditional_sections.html`);
  const employer = findField(doc, 'Employer Name');
  expect(employer.conditional.showWhen).toEqual([expect.objectContaining({ field: 'Are you currently employed?', value: 'yes', valueLabel: 'Yes' })]);
  expect(employer.section).toBe('Current Employment Details');
  expect(findField(doc, 'Last Employment Date').conditional.showWhen[0].value).toBe('no');
  expect(findField(doc, 'Business Name').conditional.showWhen[0].value).toBe('self');
  const employed = doc.conditionalLogic.find((l) => l.triggerLabel === 'Are you currently employed?');
  expect(employed.coverage).toBe('complete');
  expect(employed.branches.map((b) => [b.valueLabel, b.revealsFieldIds.length])).toEqual([['Yes', 4], ['No', 3], ['Self-employed', 2]]);
  // Conditional fields are not all required at once.
  expect(doc.steps[0].fields.filter((f) => f.conditional && f.required)).toEqual([]);
  // No field captured twice.
  const labels = fieldLabels(doc.steps[0]);
  expect(new Set(labels).size).toBe(labels.length);
  assertValidExport(doc);
});

test('validation errors are read and different sample values are retried', async () => {
  const { doc, state, page } = await extract(`${env.base}/test05_validation_errors.html`);
  expect(state.completionReason).toBe('reached_final_step');
  expect(doc.steps).toHaveLength(2);
  expect(await page.evaluate(() => window.__attempts)).toBeGreaterThan(1);
  expect(doc.warnings.map((w) => w.message).join(' ')).toContain('Username must include at least one number');
  expect(findField(doc, 'ZIP Code').validation.pattern).toBe('\\d{5}');
  expect(findField(doc, 'Age').validation).toMatchObject({ min: '18', max: '99' });
});

test('custom dropdowns, datalists and native selects keep every option', async () => {
  const ctx = await openPage(env, `${env.base}/test06_custom_dropdowns.html`);
  const scan = await command(env, ctx.tabId, 'scan');
  expect(scan.success).toBe(true);
  const doc = await exportDoc(env, ctx.tabId);
  expect(doc.extraction.status).toBe('single_step');
  expect(findField(doc, 'Country').options).toHaveLength(6);
  expect(findField(doc, 'Preferred Language (custom dropdown)').options.map((o) => o.label)).toEqual(['English', 'Spanish', 'French', 'German', 'Chinese']);
  const level = findField(doc, 'Experience Level (custom dropdown)');
  expect(level.required).toBe(true);
  expect(level.options).toHaveLength(4);
  const city = findField(doc, 'City');
  expect(city.optionsSource).toBe('datalist');
  expect(city.options).toHaveLength(6);
});

test('lazily rendered, virtualised and portal dropdowns are opened to read all options', async () => {
  const { doc, state, page } = await extract(`${env.base}/test14_lazy_dropdowns.html`);
  expect(state.completionReason).toBe('reached_final_step');
  const department = findField(doc, 'Department');
  expect(department.options).toHaveLength(40); // only 7 rows are ever rendered at once
  expect(department.options.at(-1).label).toBe('Sociology');
  expect(findField(doc, 'Start month').options.map((o) => o.label)).toHaveLength(12);
  const country = findField(doc, 'Country of residence');
  expect(country.options).toHaveLength(10);
  expect(country.options.filter((o) => o.group === 'Europe').map((o) => o.value)).toEqual(['GB', 'DE', 'FR', 'ES']);
  // Menus were closed again after harvesting.
  expect(await page.locator('#dept-listbox').count()).toBe(0);
});

test('inaccessible CAPTCHA step is reported, never bypassed', async () => {
  const { doc, state, page, tabId } = await extract(`${env.base}/test07_inaccessible_step.html`);
  expect(state.status).toBe('awaiting_user');
  expect(state.blocker.type).toBe('captcha');
  expect(doc.steps).toHaveLength(2);
  expect(await page.locator('#captchaWidget').getAttribute('aria-checked')).toBe('false');
  const stopped = await command(env, tabId, 'stop');
  expect(stopped.success).toBe(true);
  const final = await waitForStatus(env, tabId, 'stopped');
  expect(final.completionReason).toBe('stopped_by_user');
  const after = await exportDoc(env, tabId);
  expect(after.extraction.status).toBe('partial');
  expect(after.unvisitedSteps).toContainEqual(expect.objectContaining({ title: 'Step 3' }));
});

test('final review page stops before "Submit Application"', async () => {
  const { doc, state, dialogs } = await extract(`${env.base}/test08_final_submit_button.html`);
  expect(state.completionReason).toBe('reached_final_step');
  expect(doc.steps.map((s) => s.title)).toEqual(['Applicant Information', 'Review & Submit']);
  expect(doc.unvisitedSteps[0].reason).toContain('Submit Application');
  expect(dialogs).toEqual([]);
});

test('required upload: synthetic sample file on a local fixture', async () => {
  const { doc, state, page } = await extract(`${env.base}/test09_file_upload.html`);
  expect(state.completionReason).toBe('reached_final_step');
  expect(doc.steps).toHaveLength(3);
  expect(await page.locator('#attachedName').textContent()).toBe('practicemode-sample.pdf');
  expect(findField(doc, 'Upload Resume')).toMatchObject({ type: 'file', required: true, accept: '.pdf,.doc,.docx' });
});

test('cyclic navigation is detected and extraction stops', async () => {
  const { doc, state } = await extract(`${env.base}/test10_cyclic_navigation.html`);
  expect(state.completionReason).toBe('cycle_detected');
  expect(doc.steps).toHaveLength(2);
  expect(doc.navigation.at(-1)).toMatchObject({ fromStep: 2, toStep: 1, returnsToEarlierStep: true });
});

test('multiple independent branches are all explored', async () => {
  const { doc } = await extract(`${env.base}/test11_multiple_branches.html`);
  const goal = doc.conditionalLogic.find((l) => l.triggerLabel === 'Primary Goal');
  expect(goal.branches.map((b) => b.valueLabel)).toEqual(['Career Change', 'Further Education', 'Personal Development', 'Start a Business']);
  expect(goal.branches.every((b) => b.revealsFieldIds.length > 0)).toBe(true);
  const prior = doc.conditionalLogic.find((l) => l.triggerLabel === 'Prior relevant experience?');
  expect(prior.branches.find((b) => b.valueLabel.startsWith('Extensive')).revealsFieldIds).toHaveLength(3);
  expect(findField(doc, 'Funding Status').conditional.showWhen[0]).toMatchObject({ value: 'business' });
});

test('tabbed wizard: stepper titles detected, every tab captured', async () => {
  const { doc, state } = await extract(`${env.base}/test12_tabbed_form.html`);
  expect(state.completionReason).toBe('reached_final_step');
  expect(doc.summary.stepTitlesDetected).toEqual(['Personal', 'Address', 'Goals', 'Review']);
  expect(doc.steps.map((s) => s.title)).toEqual(['Personal', 'Address', 'Goals', 'Review']);
  expect(findField(doc, 'Primary Interest').options).toHaveLength(4);
});

test('multi-page form: state survives full page reloads across URLs', async () => {
  const { doc, state } = await extract(`${env.base}/test13_multipage_page1.html`);
  expect(state.completionReason).toBe('reached_final_step');
  expect(doc.steps.map((s) => s.url.split('/').pop())).toEqual(['test13_multipage_page1.html', 'test13_multipage_page2.html', 'test13_multipage_page3.html']);
  expect(doc.navigation.map((n) => n.kind)).toEqual(['full-page', 'full-page']);
  // URLs are stored without query strings (the GET form put sample values there).
  expect(doc.steps.every((s) => !s.url.includes('?'))).toBe(true);
  expect(findField(doc, 'Available on weekends?')).toMatchObject({ type: 'radio', required: true });
});

test('shadow DOM web components are extracted and navigated', async () => {
  const { doc, state } = await extract(`${env.base}/test15_shadow_dom.html`);
  expect(state.completionReason).toBe('reached_final_step');
  expect(fieldLabels(doc.steps[0])).toEqual(['Street address', 'City', 'State']);
  expect(findField(doc, 'How should we contact you?').options.map((o) => o.label)).toEqual(['Email', 'Text message', "Don't contact me"]);
});

test('scan current step reads a single-page application form without touching it', async () => {
  const ctx = await openPage(env, `${env.base}/single_page_application.html`);
  await command(env, ctx.tabId, 'scan');
  const doc = await exportDoc(env, ctx.tabId);
  expect(doc.steps).toHaveLength(1);
  expect(findField(doc, 'Phone')).toMatchObject({ type: 'tel', required: true }); // UUID name, label from <label for>
  expect(findField(doc, 'Location Preference').options).toHaveLength(4);
  expect(await ctx.page.locator('#_systemfield_name').inputValue()).toBe('');
});

// ── Safety on production websites ─────────────────────────────────────

test('production site: automatic mode waits for consent and changes nothing', async () => {
  const { state, page, tabId } = await extract(`${PRODUCTION_ORIGIN}/test01_three_step_form.html`, { until: ['awaiting_consent', 'complete'] });
  expect(state.status).toBe('awaiting_consent');
  expect(state.blocker.origin).toBe(PRODUCTION_ORIGIN);
  expect(state.steps).toHaveLength(0);
  expect(await page.locator('#fname').inputValue()).toBe('');
  expect(await page.locator('#step1').isVisible()).toBe(true);

  // After the user approves this origin, extraction continues.
  const resumed = await command(env, tabId, 'resume', { origin: PRODUCTION_ORIGIN });
  expect(resumed.success).toBe(true);
  const done = await waitForStatus(env, tabId, ['complete']);
  expect(done.steps.length).toBe(4);
  await command(env, tabId, 'revokeConsent', { origin: PRODUCTION_ORIGIN });
});

test('production site: file uploads are never automated', async () => {
  const ctx = await openPage(env, `${PRODUCTION_ORIGIN}/test09_file_upload.html`);
  await command(env, ctx.tabId, 'grantConsent', { origin: PRODUCTION_ORIGIN });
  await command(env, ctx.tabId, 'start', { mode: 'auto' });
  const state = await waitForStatus(env, ctx.tabId, ['awaiting_user', 'complete']);
  expect(state.status).toBe('awaiting_user');
  expect(state.blocker.type).toBe('file_upload');
  expect(await ctx.page.locator('#resume-upload').evaluate((el) => el.files.length)).toBe(0);
  expect(state.steps).toHaveLength(2);

  // Manual intervention: the user attaches a file and continues.
  await ctx.page.locator('#resume-upload').setInputFiles({ name: 'my-cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await command(env, ctx.tabId, 'resume');
  const done = await waitForStatus(env, ctx.tabId, ['complete']);
  expect(done.steps).toHaveLength(3);
  await command(env, ctx.tabId, 'revokeConsent', { origin: PRODUCTION_ORIGIN });
});

test('assisted mode: the user navigates, every new step is captured, answers are never stored', async () => {
  const { state, page, tabId } = await extract(`${PRODUCTION_ORIGIN}/test01_three_step_form.html`, { mode: 'assisted', until: ['awaiting_user'] });
  expect(state.blocker.type).toBe('assisted');
  expect(state.steps).toHaveLength(1);
  expect(await page.locator('#fname').inputValue()).toBe(''); // nothing filled for the user

  const secret = 'Zyxwv-Private-4821';
  await page.fill('#fname', secret);
  await page.fill('#lname', 'Userlast');
  await page.fill('#email', 'person@private.test');
  await page.click('#step1 .btn-next');

  await expect.poll(async () => (await getState(env, tabId)).steps.length, { timeout: 15_000 }).toBe(2);
  const doc = await exportDoc(env, tabId);
  expect(doc.steps[1].title).toBe('Education');
  expect(JSON.stringify(doc)).not.toContain(secret);
  expect(JSON.stringify(doc)).not.toContain('person@private.test');
  await command(env, tabId, 'stop');
});

test('pause and resume continue from the same step', async () => {
  const ctx = await openPage(env, `${env.base}/test12_tabbed_form.html`);
  await command(env, ctx.tabId, 'start', { mode: 'auto' });
  await command(env, ctx.tabId, 'pause');
  const paused = await waitForStatus(env, ctx.tabId, ['paused', 'complete']);
  expect(paused.status).toBe('paused');
  const capturedWhilePaused = paused.steps.length;
  await new Promise((r) => setTimeout(r, 1500));
  expect((await getState(env, ctx.tabId)).steps.length).toBe(capturedWhilePaused);
  await command(env, ctx.tabId, 'resume');
  const done = await waitForStatus(env, ctx.tabId, ['complete']);
  expect(done.steps.map((s) => s.title)).toEqual(['Personal', 'Address', 'Goals', 'Review']);
});

test('discard removes the temporary state', async () => {
  const ctx = await openPage(env, `${env.base}/test08_final_submit_button.html`);
  await command(env, ctx.tabId, 'scan');
  expect(await getState(env, ctx.tabId)).not.toBeNull();
  await command(env, ctx.tabId, 'discard');
  expect(await getState(env, ctx.tabId)).toBeNull();
});

test('on-page copilot appears on form pages and is never extracted as part of the form', async () => {
  const ctx = await openPage(env, `${env.base}/test12_tabbed_form.html`);
  await expect(ctx.page.locator('[data-pm-ignore="panel"]')).toHaveCount(1, { timeout: 5000 });
  await command(env, ctx.tabId, 'openPanel');
  await command(env, ctx.tabId, 'scan');
  const doc = await exportDoc(env, ctx.tabId);
  expect(fieldLabels(doc.steps[0])).toEqual(['First Name', 'Last Name', 'Email', 'Phone', 'Date of Birth']);
});
