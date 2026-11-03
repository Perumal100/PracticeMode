/**
 * content/extraction_state.js
 * Temporary extraction state, scoped to one browser tab.
 *
 * Stored in chrome.storage.session (cleared when the browser closes) under
 * `pm_state_<tabId>`, so an extraction survives page reloads and
 * cross-page navigation inside the same tab, and two tabs never interfere.
 * Pause/stop requests use a separate `pm_ctrl_<tabId>` key so the UI never
 * races with the engine's own writes.
 *
 * Only form structure is stored: labels, types, options, constraints, step
 * titles and navigation. Values typed into the page are never stored.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});

  const stateKey = (tabId) => `pm_state_${tabId}`;
  const ctrlKey = (tabId) => `pm_ctrl_${tabId}`;

  // ── Storage adapter ─────────────────────────────────────────────────
  // Content scripts can use storage.session once the service worker grants
  // access; until then requests are relayed through the service worker.
  let directSession = true;

  function relay(op, key, value) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'PM_STORAGE', op, key, value }, (response) => {
        if (chrome.runtime.lastError) resolve(undefined);
        else resolve(response?.value);
      });
    });
  }

  async function sessionGet(key) {
    if (directSession) {
      try {
        const result = await chrome.storage.session.get(key);
        return result[key];
      } catch (_) {
        directSession = false;
      }
    }
    return relay('get', key);
  }

  async function sessionSet(key, value) {
    if (directSession) {
      try {
        await chrome.storage.session.set({ [key]: value });
        return;
      } catch (_) {
        directSession = false;
      }
    }
    await relay('set', key, value);
  }

  async function sessionRemove(key) {
    if (directSession) {
      try {
        await chrome.storage.session.remove(key);
        return;
      } catch (_) {
        directSession = false;
      }
    }
    await relay('remove', key);
  }

  async function localGet(key, fallback) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  // ── State ───────────────────────────────────────────────────────────
  let ctx = { tabId: null, frameId: null };
  let queue = Promise.resolve();

  function setContext(next) {
    ctx = { ...ctx, ...next };
  }

  function createState({ mode, settings, environment, frameId, isTopFrame, page }) {
    const now = Date.now();
    return {
      version: 3,
      runId: `run_${now.toString(36)}`,
      tabId: ctx.tabId,
      frameId,
      isTopFrame,
      mode, // 'auto' | 'assisted' | 'scan'
      status: 'running',
      environment,
      startUrl: PM.utils.safeUrl(location.href),
      // The tab's own page (the address bar), which differs from location
      // when the form is embedded in an iframe.
      pageUrl: PM.exportBuilder?.cleanSourceUrl(page?.url || '') || null,
      pageTitle: PM.utils.cleanText(page?.title || '').slice(0, 200) || null,
      origin: PM.safetyPolicy.originOf(location.href),
      formTitle: null,
      settings,
      message: 'Starting…',
      steps: [],
      detected: { total: null, titles: [] },
      navigation: [],
      pendingNavigation: null,
      conditionalLogic: [],
      unvisitedSteps: [],
      warnings: [],
      blocker: null,
      usedFieldIds: [],
      completionReason: null,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
    };
  }

  async function load() {
    if (ctx.tabId === null) return null;
    return (await sessionGet(stateKey(ctx.tabId))) || null;
  }

  async function save(state) {
    state.updatedAt = Date.now();
    await sessionSet(stateKey(ctx.tabId), state);
    return state;
  }

  /** Serialised read-modify-write. `mutator` may return false to skip saving. */
  function update(mutator) {
    queue = queue.then(async () => {
      const state = await load();
      if (!state) return null;
      const keep = mutator(state);
      if (keep === false) return state;
      return save(state);
    }).catch((e) => {
      console.warn('[PracticeMode] state update failed', e);
      return null;
    });
    return queue;
  }

  function replace(state) {
    queue = queue.then(() => save(state));
    return queue;
  }

  async function remove() {
    await sessionRemove(stateKey(ctx.tabId));
    await sessionRemove(ctrlKey(ctx.tabId));
  }

  async function readControl() {
    if (ctx.tabId === null) return null;
    return (await sessionGet(ctrlKey(ctx.tabId))) || null;
  }

  async function clearControl() {
    await sessionRemove(ctrlKey(ctx.tabId));
  }

  async function loadConsent() {
    return localGet(PM.safetyPolicy.CONSENT_KEY, {});
  }

  async function loadSettings() {
    const stored = await localGet(PM.safetyPolicy.SETTINGS_KEY, {});
    return { ...PM.safetyPolicy.DEFAULT_SETTINGS, ...stored };
  }

  function addWarning(state, message, step) {
    if (!message) return;
    const last = state.warnings[state.warnings.length - 1];
    if (last && last.message === message) return;
    state.warnings.push({ step: step ?? state.steps.length, message, at: Date.now() });
    if (state.warnings.length > 100) state.warnings.shift();
  }

  PM.extractionState = {
    stateKey,
    ctrlKey,
    setContext,
    get context() { return ctx; },
    createState,
    load,
    save,
    update,
    replace,
    remove,
    readControl,
    clearControl,
    loadConsent,
    loadSettings,
    addWarning,
  };
})();
