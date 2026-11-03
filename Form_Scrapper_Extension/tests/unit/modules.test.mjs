import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PM } from './load.mjs';

const { regexSampler, dummyDataGenerator: gen, safetyPolicy: policy, exportBuilder } = PM;

// ── Regex sampler ─────────────────────────────────────────────────────
test('regex sampler produces values that satisfy real form patterns', () => {
  const cases = [
    ['\\d{5}', {}],
    ['[a-zA-Z0-9_]+', { minLength: 4, maxLength: 20 }],
    ['[\\d\\-\\+\\(\\)\\s]{10,20}', {}],
    ['[A-Z]{2}\\d{6}', {}],
    ['(?:\\+1)?\\d{10}', {}],
    ['[a-z]+@[a-z]+\\.com', {}],
    ['\\(\\d{3}\\) \\d{3}-\\d{4}', {}],
    ['(?=.*\\d)(?=.*[A-Z]).{8,}', { preferred: ['SamplePass!2025'] }],
    ['[^0-9]{3,5}', {}],
    ['(red|green|blue)', {}],
  ];
  for (const [pattern, opts] of cases) {
    const value = regexSampler.generateMatching(pattern, opts);
    assert.ok(value !== null, `no value for ${pattern}`);
    assert.ok(regexSampler.compileHtmlPattern(pattern).test(value), `${value} does not match ${pattern}`);
    if (opts.minLength) assert.ok(value.length >= opts.minLength);
    if (opts.maxLength) assert.ok(value.length <= opts.maxLength);
  }
});

test('regex sampler prefers a semantic value when it already matches', () => {
  assert.equal(regexSampler.generateMatching('\\d{3}-\\d{3}-\\d{4}', { preferred: ['212-555-0100'] }), '212-555-0100');
});

test('regex sampler returns null instead of guessing for unsupported patterns', () => {
  assert.equal(regexSampler.generateMatching('(a)\\1'), null);
});

// ── Dummy data generator ──────────────────────────────────────────────
const fixture = { environment: 'fixture' };
const production = { environment: 'production' };

test('generator returns fictional values by meaning', () => {
  assert.equal(gen.generate({ type: 'text', label: 'First name' }, fixture).value, 'Alex');
  assert.equal(gen.generate({ type: 'email', label: 'Work email' }, fixture).value, 'alex@example.com');
  assert.equal(gen.generate({ type: 'text', label: 'ZIP code' }, fixture).value, '10001');
  assert.equal(gen.generate({ type: 'date', label: 'Date of birth' }, fixture).value, '1995-05-15');
  assert.equal(gen.generate({ type: 'text', label: 'Graduation date', placeholder: 'MM/DD/YYYY' }, fixture).value, '05/15/2020');
});

test('generator respects numeric and date limits', () => {
  assert.equal(gen.generate({ type: 'number', label: 'Graduation year', validation: { min: '1970', max: '2030' } }, fixture).value, '2020');
  assert.equal(gen.generate({ type: 'number', label: 'Age', validation: { min: '30', max: '40' } }, fixture).value, '30');
  assert.equal(gen.generate({ type: 'number', label: 'GPA', validation: { min: '0', max: '4', step: '0.1' } }, fixture).value, '3.8');
  assert.equal(gen.generate({ type: 'date', label: 'Date of birth', validation: { max: '1990-01-01' } }, fixture).value, '1990-01-01');
});

test('generator respects length limits and declared patterns', () => {
  const short = gen.generate({ type: 'text', label: 'Code', validation: { maxLength: 4 } }, fixture).value;
  assert.ok(short.length <= 4);
  const long = gen.generate({ type: 'textarea', label: 'Essay', validation: { minLength: 300 } }, fixture).value;
  assert.ok(long.length >= 300);
  const patterned = gen.generate({ type: 'text', label: 'Member ID', validation: { pattern: '[A-Z]{3}-\\d{4}' } }, fixture).value;
  assert.match(patterned, /^[A-Z]{3}-\d{4}$/);
});

test('generator picks a real option, never the placeholder', () => {
  const field = {
    type: 'select',
    label: 'Education',
    options: [{ value: '', label: '-- Select --', isPlaceholder: true }, { value: 'hs', label: 'High School' }, { value: 'ba', label: "Bachelor's" }],
  };
  assert.equal(gen.generate(field, fixture).value, 'hs');
  assert.equal(gen.generate(field, { ...fixture, attempt: 1 }).value, 'ba');
  const country = { type: 'select', label: 'Country', options: [{ value: 'CA', label: 'Canada' }, { value: 'US', label: 'United States' }] };
  assert.equal(gen.generate(country, fixture).value, 'US');
});

test('generator refines values using the site\'s validation message', () => {
  const field = { type: 'text', label: 'Username' };
  const value = gen.generate(field, { ...fixture, feedback: 'Username must include at least one number.' }).value;
  assert.match(value, /\d/);
  const future = gen.generate({ type: 'date', label: 'Start date' }, { ...fixture, feedback: 'Start date must be in the future.' }).value;
  assert.ok(future > new Date().toISOString().slice(0, 10));
});

test('identity-sensitive fields: test values on fixtures, manual on production', () => {
  const ssn = { type: 'text', label: 'Social Security Number' };
  assert.equal(gen.generate(ssn, fixture).value, '000-12-3456');
  const manual = gen.generate(ssn, production);
  assert.equal(manual.requiresManual, true);
  assert.equal(manual.blocker, 'sensitive');
  assert.equal(gen.generate({ type: 'text', label: 'Card number', autocomplete: 'cc-number' }, production).requiresManual, true);
});

test('uploads, passwords and attestations are never automated on production', () => {
  assert.equal(gen.generate({ type: 'file', label: 'Resume' }, production).blocker, 'file_upload');
  assert.equal(gen.generate({ type: 'file', label: 'Resume', accept: '.pdf' }, fixture).value.fileName, 'practicemode-sample.pdf');
  assert.equal(gen.generate({ type: 'password', label: 'Password' }, production).blocker, 'account_creation');
  assert.equal(gen.generate({ type: 'checkbox', label: 'I certify that the information is true' }, production).blocker, 'attestation');
  assert.equal(gen.generate({ type: 'checkbox', label: 'I certify that the information is true' }, fixture).value, true);
});

test('verification codes are never filled anywhere', () => {
  assert.equal(gen.generate({ type: 'text', label: 'Verification code', autocomplete: 'one-time-code' }, fixture).blocker, 'verification');
});

// ── Safety policy ─────────────────────────────────────────────────────
test('origin classification', () => {
  assert.equal(policy.classifyOrigin('http://localhost:4317/a.html'), 'fixture');
  assert.equal(policy.classifyOrigin('http://127.0.0.1/a'), 'fixture');
  assert.equal(policy.classifyOrigin('file:///Users/me/form.html'), 'fixture');
  assert.equal(policy.classifyOrigin('https://forms.practicemode.test/'), 'fixture');
  assert.equal(policy.classifyOrigin('https://jobs.example.com/apply'), 'production');
  assert.equal(policy.classifyOrigin('chrome://settings'), 'unsupported');
});

test('auto-navigation on production requires per-origin consent', () => {
  const url = 'https://jobs.example.com/apply';
  assert.equal(policy.autoNavigationAllowed(url, {}).allowed, false);
  assert.equal(policy.autoNavigationAllowed(url, { 'https://jobs.example.com': { grantedAt: 1 } }).allowed, true);
  assert.equal(policy.autoNavigationAllowed(url, { 'https://other.example.com': { grantedAt: 1 } }).allowed, false);
});

test('final actions are recognised; step navigation is not', () => {
  for (const label of ['Submit Application', 'Pay now', 'Place order', 'Create account', 'Confirm booking', 'Apply', 'Finish & Submit', 'Sign up']) {
    assert.ok(policy.FINAL_ACTION_RE.test(label), label);
  }
  for (const label of ['Next', 'Continue', 'Save and continue', 'Next: Review →', 'Proceed']) {
    assert.ok(!policy.FINAL_ACTION_RE.test(label), label);
  }
});

// ── Export builder ────────────────────────────────────────────────────
function baseState(over = {}) {
  return {
    mode: 'auto', status: 'complete', completionReason: 'reached_final_step', environment: 'fixture',
    startUrl: 'http://localhost/a.html', origin: 'http://localhost', formTitle: 'Job Application',
    steps: [{ step: 1, title: 'Personal', url: 'http://localhost/a.html', fieldCount: 1, sections: [], fields: [{ fieldId: 'first_name', order: 1, label: 'First name', type: 'text', required: true }] }],
    detected: { total: 1, titles: [] }, navigation: [], conditionalLogic: [],
    unvisitedSteps: [{ title: 'Final submission', reason: 'Stopped before "Submit".' }], warnings: [],
    startedAt: 1, finishedAt: 2, ...over,
  };
}

test('export is complete only when the form was walked to its end', () => {
  assert.equal(exportBuilder.buildExport(baseState()).extraction.status, 'complete');
  assert.equal(exportBuilder.buildExport(baseState({ status: 'stopped', completionReason: 'stopped_by_user' })).extraction.status, 'partial');
  assert.equal(exportBuilder.buildExport(baseState({ unvisitedSteps: [{ title: 'Step 3', reason: 'CAPTCHA' }] })).extraction.status, 'partial');
  assert.equal(exportBuilder.buildExport(baseState({ conditionalLogic: [{ coverage: 'partial', branches: [] }] })).extraction.status, 'partial');
  assert.equal(exportBuilder.buildExport(baseState({ mode: 'scan' })).extraction.status, 'single_step');
});

test('an active blocker is reported as an unvisited step', () => {
  const doc = exportBuilder.buildExport(baseState({ status: 'awaiting_user', completionReason: null, unvisitedSteps: [], blocker: { type: 'captcha', message: 'A CAPTCHA is shown.' } }));
  assert.deepEqual(doc.unvisitedSteps, [{ title: 'After step 1', reason: 'A CAPTCHA is shown.' }]);
  assert.equal(doc.extraction.status, 'partial');
});

test('export is plain JSON with a stable file name', () => {
  const doc = exportBuilder.buildExport(baseState());
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc);
  assert.match(exportBuilder.fileName(doc), /^practicemode_job-application_complete_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
});
