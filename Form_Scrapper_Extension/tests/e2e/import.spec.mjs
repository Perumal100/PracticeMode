/**
 * End-to-end tests for sending a capture to PracticeMode (API-15). A small
 * stand-in for the Django server records what the real extension sends.
 */
import { test, expect } from '@playwright/test';
import http from 'node:http';
import { launchExtension, openPage, command, waitForStatus, exportDoc } from './helpers.mjs';

let env;
let server;
let serverUrl;
let requests = [];
let respond = null;

test.beforeAll(async () => {
  env = await launchExtension();
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      if (req.method === 'GET' && req.url === '/api/session') {
        // Like Django's ensure_csrf_cookie on GET /api/session.
        res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'csrftoken=test-csrf-token; Path=/; SameSite=Lax' });
        res.end('{"user": null}');
        return;
      }
      const [status, payload] = respond(req);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}`;
  await env.worker.evaluate((url) => chrome.storage.local.set({ pm_settings_v1: { backendUrl: `${url}/` } }), serverUrl);
});
test.afterAll(async () => {
  await env?.close();
  server?.close();
});
test.beforeEach(() => { requests = []; });

async function captured(fixture) {
  const ctx = await openPage(env, `${env.base}/${fixture}`);
  expect((await command(env, ctx.tabId, 'start', { mode: 'auto' })).success).toBe(true);
  await waitForStatus(env, ctx.tabId, ['complete']);
  return ctx;
}

test('sends the captured structure to the import endpoint with the CSRF token', async () => {
  respond = () => [201, { id: 'f3b7c1de-0000-4000-8000-000000000001', status: 'AWAITING_REVIEW' }];
  const { tabId } = await captured('test01_three_step_form.html');
  const response = await command(env, tabId, 'send');
  expect(response.success, response.error).toBe(true);
  expect(response.value).toMatchObject({ status: 'AWAITING_REVIEW', fieldCount: 10 });
  expect(response.value.message).toMatch(/10 fields awaiting review/);

  const post = requests.find((r) => r.method === 'POST');
  expect(post.url).toBe('/api/forms/extractions');
  expect(post.headers['x-csrftoken']).toBe('test-csrf-token');
  expect(post.headers.cookie).toContain('csrftoken=test-csrf-token');
  const body = JSON.parse(post.body);
  const expected = await env.worker.evaluate(async (id) => {
    const doc = globalThis.PracticeMode.exportBuilder.buildExport(await globalThis.PracticeModeBackground.getState(id));
    return globalThis.PracticeMode.importPayload.buildImportPayload(doc).payload;
  }, tabId);
  expect(body).toEqual(expected);
  expect(body.fields.map((f) => f.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(body.fields.find((f) => f.label === 'Highest Education').validation.allowedValues).not.toContain('-- Select --');
  // The fictional values typed while walking the form never leave the page.
  const doc = await exportDoc(env, tabId);
  expect(doc.steps[0].fields.find((f) => f.label === 'First Name').value).toBeUndefined();
  expect(post.body).not.toContain('Alex');
});

test('fields that cannot be practised are left out and reported', async () => {
  respond = () => [201, { id: 'f3b7c1de-0000-4000-8000-000000000002', status: 'AWAITING_REVIEW' }];
  const { tabId } = await captured('test09_file_upload.html');
  const response = await command(env, tabId, 'send');
  expect(response.success, response.error).toBe(true);
  const body = JSON.parse(requests.find((r) => r.method === 'POST').body);
  expect(body.fields.map((f) => f.label)).toEqual(['Full Name', 'Email']);
  expect(response.value.skipped.map((s) => s.label)).toEqual(['Upload Resume', 'Cover Letter Upload', 'Portfolio Upload']);
  expect(response.value.message).toMatch(/Left out 3/);
});

test('a signed-out reviewer is told to sign in and nothing is reported as sent', async () => {
  respond = () => [401, { detail: 'Authentication credentials were not provided.' }];
  const { tabId } = await captured('test01_three_step_form.html');
  const response = await command(env, tabId, 'send');
  expect(response.success).toBe(false);
  expect(response.error).toContain(`Sign in to PracticeMode at ${serverUrl} as a Form Reviewer`);
});
