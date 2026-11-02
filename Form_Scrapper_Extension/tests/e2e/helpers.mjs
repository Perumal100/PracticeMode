/**
 * Helpers for end-to-end tests: launch Chromium with the unpacked extension,
 * serve the fixtures on localhost, and drive the extension through its real
 * service worker (the same commands the popup and the on-page copilot send).
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_DIR = path.resolve(here, '../..');
export const FIXTURES_DIR = path.resolve(here, '../fixtures');

/** A hostname the safety policy treats as a production website. */
export const PRODUCTION_ORIGIN = 'http://careers.acme.example';

export async function launchExtension() {
  const server = await startServer(0);
  const base = `http://localhost:${server.address().port}`;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');

  // Serve fixtures on a "production" hostname too, without any network access.
  await context.route(`${PRODUCTION_ORIGIN}/**`, (route) => {
    const file = path.join(FIXTURES_DIR, new URL(route.request().url()).pathname);
    if (!file.startsWith(FIXTURES_DIR) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill({ path: file });
  });

  return {
    context,
    worker,
    base,
    async close() {
      await context.close();
      server.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

/** Open a page and record every dialog (fixtures only alert on final submit). */
export async function openPage(env, url) {
  const page = await env.context.newPage();
  const dialogs = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    dialog.dismiss().catch(() => {});
  });
  await page.goto(url);
  const tabId = await tabIdFor(env.worker, page.url());
  await waitForEngine(env.worker, tabId);
  return { page, dialogs, tabId };
}

export async function tabIdFor(worker, url) {
  return worker.evaluate(async (target) => {
    // Several tests open the same fixture; tab ids only grow, so the newest
    // matching tab is the one just opened.
    const tabs = (await chrome.tabs.query({})).filter((t) => t.url === target);
    return tabs.length ? Math.max(...tabs.map((t) => t.id)) : null;
  }, url);
}

/** Wait until the declared content scripts answer in the top frame. */
export async function waitForEngine(worker, tabId, timeout = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ok = await worker.evaluate((id) => new Promise((resolve) => {
      chrome.tabs.sendMessage(id, { type: 'PM_ENGINE', action: 'probe' }, { frameId: 0 }, (r) => resolve(!chrome.runtime.lastError && r?.success));
    }), tabId);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('content scripts did not load');
}

export function command(env, tabId, name, extra = {}) {
  return env.worker.evaluate(
    ({ tabId: id, name: cmd, extra: more }) => globalThis.PracticeModeBackground.command({ type: 'PM_COMMAND', command: cmd, tabId: id, ...more }),
    { tabId, name, extra },
  );
}

export function getState(env, tabId) {
  return env.worker.evaluate((id) => globalThis.PracticeModeBackground.getState(id), tabId);
}

export async function exportDoc(env, tabId) {
  const response = await command(env, tabId, 'export');
  return response.value;
}

/** Poll the tab's extraction state until its status is one of `statuses`. */
export async function waitForStatus(env, tabId, statuses, timeout = 60_000) {
  const wanted = [].concat(statuses);
  const start = Date.now();
  let state = null;
  while (Date.now() - start < timeout) {
    state = await getState(env, tabId);
    if (state && wanted.includes(state.status)) return state;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${wanted.join('/')}; last status ${state?.status}: ${state?.message}`);
}

export const fieldLabels = (step) => step.fields.map((f) => f.label);
export const findField = (doc, label) => doc.steps.flatMap((s) => s.fields).find((f) => f.label === label);
