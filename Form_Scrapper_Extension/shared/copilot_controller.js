/**
 * shared/copilot_controller.js
 * Connects the copilot UI to the extension: reads the tab's extraction state,
 * settings and consents, re-renders on every change, and turns button clicks
 * into commands for the service worker. Shared by the popup and the panel.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});
  const policy = PM.safetyPolicy;

  // False once the extension is reloaded or updated: scripts left on open
  // pages lose access to every chrome.* API and must stop quietly.
  function extensionAlive() {
    try { return Boolean(chrome.runtime?.id); } catch (_) { return false; }
  }

  async function readSession(key) {
    try {
      return (await chrome.storage.session.get(key))[key] || null;
    } catch (_) {
      if (!extensionAlive()) return null;
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'PM_STORAGE', op: 'get', key }, (r) => resolve(chrome.runtime.lastError ? null : r?.value || null));
        } catch (_) {
          resolve(null);
        }
      });
    }
  }

  async function readLocal(key, fallback) {
    try {
      return (await chrome.storage.local.get(key))[key] ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function sendCommand(command, extra) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'PM_COMMAND', command, ...extra }, (response) => {
          if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
          else resolve(response || { success: false, error: 'No response.' });
        });
      } catch (_) {
        resolve({ success: false, error: 'PracticeMode was updated or reloaded. Reload this page to keep using it.' });
      }
    });
  }

  /**
   * options: { root, variant, tabId, pageUrl, onClose, onMinimize, onOpenPanel }
   */
  function create(options) {
    let ui = null;
    const local = { consentPrompt: false, busy: null, error: null, notice: null };
    let model = null;
    const stateKey = `pm_state_${options.tabId}`;

    async function refresh() {
      if (!extensionAlive()) {
        destroy();
        return model;
      }
      const [state, consent, stored] = await Promise.all([
        readSession(stateKey),
        readLocal(policy.CONSENT_KEY, {}),
        readLocal(policy.SETTINGS_KEY, {}),
      ]);
      const url = options.pageUrl;
      model = {
        state,
        page: { url, origin: policy.originOf(url), kind: policy.classifyOrigin(url) },
        consent,
        settings: { ...policy.DEFAULT_SETTINGS, ...stored },
        ui: local,
      };
      ui.render(model);
      return model;
    }

    async function run(command, extra = {}) {
      local.busy = command;
      local.error = null;
      local.notice = null;
      await refresh();
      const response = await sendCommand(command, { tabId: options.tabId, ...extra });
      local.busy = null;
      if (!response.success) local.error = response.error || 'Something went wrong.';
      await refresh();
      return response;
    }

    const actions = {
      scan: () => run('scan'),
      extract: async () => {
        const m = model || (await refresh());
        if (!m.settings.autoNavigate) {
          local.notice = 'Safe auto-navigation is off, so extraction runs in assisted mode: fill each step yourself and PracticeMode records it.';
          return run('start', { mode: 'assisted' });
        }
        if (m.page.kind === 'production' && !m.consent[m.page.origin]) {
          local.consentPrompt = true;
          return refresh();
        }
        return run('start', { mode: 'auto' });
      },
      grantAndStart: async ({ origin }) => {
        local.consentPrompt = false;
        await sendCommand('grantConsent', { tabId: options.tabId, origin });
        return run('start', { mode: 'auto' });
      },
      startAssisted: () => {
        local.consentPrompt = false;
        return run('start', { mode: 'assisted' });
      },
      cancelConsent: () => {
        local.consentPrompt = false;
        return refresh();
      },
      grantAndResume: ({ origin }) => run('resume', { origin }),
      switchAssisted: () => run('assisted'),
      pause: () => run('pause'),
      resume: () => run('resume'),
      stop: () => run('stop'),
      discard: () => run('discard'),
      download: () => run('download'),
      preview: () => run('preview'),
      send: async () => {
        const response = await run('send');
        if (response.success) {
          local.notice = response.value.message;
          await refresh();
        }
      },
      revokeConsent: () => run('revokeConsent', { origin: model?.page.origin }),
      setSetting: async (name, value) => {
        const stored = await readLocal(policy.SETTINGS_KEY, {});
        await chrome.storage.local.set({ [policy.SETTINGS_KEY]: { ...stored, [name]: value } });
        return refresh();
      },
      openPanel: () => options.onOpenPanel?.(),
      minimize: () => options.onMinimize?.(),
      close: () => options.onClose?.(),
    };

    ui = PM.copilotUI.mount(options.root, { variant: options.variant, actions });

    const onStorage = (changes, area) => {
      if ((area === 'session' && changes[stateKey]) || (area === 'local' && (changes[policy.CONSENT_KEY] || changes[policy.SETTINGS_KEY]))) refresh();
    };
    try { chrome.storage.onChanged.addListener(onStorage); } catch (_) { /* no access: polling below */ }
    const poller = setInterval(() => refresh().catch(() => {}), 2000);

    function destroy() {
      clearInterval(poller);
      try { chrome.storage.onChanged.removeListener(onStorage); } catch (_) { /* ignore */ }
    }

    refresh().catch(() => {});
    return {
      refresh,
      setPageUrl(url) { options.pageUrl = url; refresh().catch(() => {}); },
      destroy,
    };
  }

  PM.copilotController = { create, sendCommand };
})();
