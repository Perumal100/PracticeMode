/**
 * background/service_worker.js
 * Routes commands from the popup and the on-page copilot to the frame that
 * holds the form, keeps per-tab state tidy, and handles downloads/preview.
 */

import '../content/safety_policy.js';
import '../shared/export_builder.js';

const PM = globalThis.PracticeMode;
const stateKey = (tabId) => `pm_state_${tabId}`;
const ctrlKey = (tabId) => `pm_ctrl_${tabId}`;

// Let content scripts read and write their tab's temporary state directly.
chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});

async function getState(tabId) {
  const result = await chrome.storage.session.get(stateKey(tabId));
  return result[stateKey(tabId)] || null;
}

function sendToFrame(tabId, frameId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
      if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
      else resolve(response || { success: false, error: 'No response from the page.' });
    });
  });
}

async function listFrames(tabId) {
  try {
    return (await chrome.webNavigation.getAllFrames({ tabId })) || [{ frameId: 0 }];
  } catch (_) {
    return [{ frameId: 0 }];
  }
}

/** Inject the content scripts into tabs that were open before installation. */
async function ensureInjected(tabId) {
  const ping = await sendToFrame(tabId, 0, { type: 'PM_ENGINE', action: 'probe' });
  if (ping.success) return true;
  const files = chrome.runtime.getManifest().content_scripts?.[0]?.js || [];
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files });
    return true;
  } catch (e) {
    return false;
  }
}

/** The frame (top page or embedded iframe) with the most form fields. */
async function findFormFrame(tabId) {
  if (!(await ensureInjected(tabId))) {
    return { error: 'PracticeMode cannot run on this page (browser pages, the Web Store and some protected pages are off-limits).' };
  }
  const frames = await listFrames(tabId);
  const probes = await Promise.all(frames.map(async (f) => {
    const r = await sendToFrame(tabId, f.frameId, { type: 'PM_ENGINE', action: 'probe' });
    return r.success ? { frameId: f.frameId, ...r.value } : null;
  }));
  const usable = probes.filter(Boolean).sort((a, b) => b.fieldCount - a.fieldCount || (a.frameId === 0 ? -1 : 1));
  if (!usable.length) return { error: 'Could not reach the page. Reload it and try again.' };
  const best = usable[0];
  if (best.fieldCount === 0) {
    // Still allow starting: the form may render after interaction.
    return { frameId: usable.find((p) => p.frameId === 0) ? 0 : best.frameId, fieldCount: 0, title: best.title };
  }
  return best;
}

async function setControl(tabId, command) {
  await chrome.storage.session.set({ [ctrlKey(tabId)]: { command, at: Date.now() } });
}

async function grantConsent(origin) {
  const key = PM.safetyPolicy.CONSENT_KEY;
  const current = (await chrome.storage.local.get(key))[key] || {};
  current[origin] = { grantedAt: Date.now() };
  await chrome.storage.local.set({ [key]: current });
}

async function revokeConsent(origin) {
  const key = PM.safetyPolicy.CONSENT_KEY;
  const current = (await chrome.storage.local.get(key))[key] || {};
  delete current[origin];
  await chrome.storage.local.set({ [key]: current });
}

async function download(tabId) {
  const state = await getState(tabId);
  const doc = PM.exportBuilder.buildExport(state);
  if (!doc || !doc.steps.length) return { success: false, error: 'Nothing has been captured yet.' };
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(doc, null, 2))}`;
  const downloadId = await chrome.downloads.download({ url, filename: PM.exportBuilder.fileName(doc), saveAs: false });
  return { success: true, value: { downloadId, status: doc.extraction.status } };
}

async function preview(tabId) {
  const state = await getState(tabId);
  const doc = PM.exportBuilder.buildExport(state);
  if (!doc || !doc.steps.length) return { success: false, error: 'Nothing has been captured yet.' };
  await chrome.storage.local.set({ pm_form_preview_v1: doc });
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('preview/preview.html') });
  return { success: true, value: { tabId: tab.id } };
}

async function command(msg, sender = {}) {
  const tabId = msg.tabId ?? sender.tab?.id;
  if (!Number.isInteger(tabId)) return { success: false, error: 'No browser tab was given.' };

  switch (msg.command) {
    case 'start':
    case 'scan': {
      const frame = await findFormFrame(tabId);
      if (frame.error) return { success: false, error: frame.error };
      const response = await sendToFrame(tabId, frame.frameId, { type: 'PM_ENGINE', action: msg.command, mode: msg.mode });
      return response.success ? { success: true, value: { frameId: frame.frameId, ...response.value } } : response;
    }
    case 'pause':
    case 'stop': {
      await setControl(tabId, msg.command);
      const state = await getState(tabId);
      if (!state) return { success: true };
      const reached = await sendToFrame(tabId, state.frameId, { type: 'PM_ENGINE', action: 'control' });
      if (!reached.success && msg.command === 'stop') {
        // The page is gone or navigating; finish the state here.
        state.status = 'stopped';
        state.completionReason = 'stopped_by_user';
        state.finishedAt = Date.now();
        state.blocker = null;
        state.message = 'Stopped.';
        await chrome.storage.session.set({ [stateKey(tabId)]: state });
        await chrome.storage.session.remove(ctrlKey(tabId));
      }
      return { success: true };
    }
    case 'resume':
    case 'assisted': {
      await chrome.storage.session.remove(ctrlKey(tabId));
      const state = await getState(tabId);
      if (!state) return { success: false, error: 'There is no extraction to resume.' };
      if (msg.origin) await grantConsent(msg.origin);
      const mode = msg.command === 'assisted' ? 'assisted' : undefined;
      const response = await sendToFrame(tabId, state.frameId, { type: 'PM_ENGINE', action: 'resume', mode });
      if (!response.success) return { success: false, error: 'Could not reach the page. Reload it — the extraction resumes automatically.' };
      return response;
    }
    case 'grantConsent':
      if (!msg.origin) return { success: false, error: 'No site given.' };
      await grantConsent(msg.origin);
      return { success: true };
    case 'revokeConsent':
      await revokeConsent(msg.origin);
      return { success: true };
    case 'discard': {
      const state = await getState(tabId);
      if (state) await sendToFrame(tabId, state.frameId, { type: 'PM_ENGINE', action: 'discard' });
      await chrome.storage.session.remove([stateKey(tabId), ctrlKey(tabId)]);
      return { success: true };
    }
    case 'export':
      return { success: true, value: PM.exportBuilder.buildExport(await getState(tabId)) };
    case 'download':
      return download(tabId);
    case 'preview':
      return preview(tabId);
    case 'openPanel':
      await ensureInjected(tabId);
      return sendToFrame(tabId, 0, { type: 'PM_PANEL', action: 'open' });
    default:
      return { success: false, error: `Unknown command ${msg.command}` };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PM_WHOAMI') {
    sendResponse({ tabId: sender.tab?.id ?? null, frameId: sender.frameId ?? 0 });
    return false;
  }
  if (message?.type === 'PM_STORAGE') {
    const area = chrome.storage.session;
    const op = message.op === 'get' ? area.get(message.key).then((r) => r[message.key])
      : message.op === 'set' ? area.set({ [message.key]: message.value })
        : area.remove(message.key);
    op.then((value) => sendResponse({ value }), () => sendResponse({}));
    return true;
  }
  if (message?.type === 'PM_COMMAND') {
    command(message, sender).then(sendResponse, (e) => sendResponse({ success: false, error: e.message }));
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove([stateKey(tabId), ctrlKey(tabId)]).catch(() => {});
});

// Exposed for debugging from the service-worker console and for the e2e tests.
globalThis.PracticeModeBackground = { command, getState, findFormFrame };
