/**
 * content/copilot_panel.js
 * On-page copilot (top frame only), in the spirit of application copilots:
 * a small launcher appears on pages with a form, and opens a side panel that
 * shows the extraction live as you move through the form. The panel lives in
 * a closed shadow root, is ignored by extraction, and stays open across page
 * loads while an extraction is active in this tab.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});
  if (window.top !== window || PM.copilotPanel) return;

  const HIDDEN_KEY = 'pm_launcher_hidden_v1';
  const ACTIVE = new Set(['running', 'awaiting_user', 'awaiting_consent', 'paused']);
  const PANEL_CSS = `
    :host { all: initial; }
    .pm-shell { position: fixed; top: 72px; right: 16px; width: 360px; max-height: calc(100vh - 96px); overflow-y: auto;
      border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.1); background: #0f1117;
      z-index: 2147483647; }
    .pm-launcher { display: flex; align-items: center; gap: 6px;
      padding: 9px 10px 9px 12px; border-radius: 12px 0 0 12px; border: none; cursor: pointer; color: #fff;
      font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
      background: linear-gradient(135deg, #6366f1, #8b5cf6); box-shadow: 0 6px 20px rgba(99,102,241,.45); }
    .pm-launcher .count { background: rgba(255,255,255,.22); border-radius: 10px; padding: 2px 6px; font-size: 11px; }
    .pm-launcher-wrap { position: fixed; right: 0; top: 38%; z-index: 2147483647; }
    .pm-launcher-hide { position: absolute; top: -8px; left: -8px; width: 18px; height: 18px; border-radius: 50%; border: none; cursor: pointer;
      background: #1e2436; color: #8b93a8; font: 11px/18px sans-serif; text-align: center; padding: 0; }
  `;

  let host = null;
  let shadow = null;
  let controller = null;
  let mode = 'hidden';
  let tabId = null;
  let dismissedThisPage = false;

  function whoAmI() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'PM_WHOAMI' }, (r) => resolve(chrome.runtime.lastError ? null : r));
    });
  }

  async function readSession(key) {
    try {
      return (await chrome.storage.session.get(key))[key] || null;
    } catch (_) {
      return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'PM_STORAGE', op: 'get', key }, (r) => resolve(r?.value || null)));
    }
  }

  async function readLocal(key, fallback) {
    try { return (await chrome.storage.local.get(key))[key] ?? fallback; } catch (_) { return fallback; }
  }

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement('div');
    host.setAttribute(PM.utils.IGNORE_ATTR, 'panel');
    shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = PANEL_CSS + PM.copilotStyles;
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
  }

  function clearBody() {
    if (!shadow) return;
    Array.from(shadow.children).forEach((c) => { if (c.tagName !== 'STYLE') c.remove(); });
    controller?.destroy();
    controller = null;
  }

  function open() {
    if (tabId === null) return;
    ensureHost();
    if (mode === 'open') return;
    clearBody();
    mode = 'open';
    const shell = document.createElement('div');
    shell.className = 'pm-shell';
    shell.setAttribute('role', 'complementary');
    shell.setAttribute('aria-label', 'PracticeMode copilot');
    shadow.appendChild(shell);
    controller = PM.copilotController.create({
      root: shell,
      variant: 'panel',
      tabId,
      pageUrl: location.href,
      onMinimize: () => showLauncher(),
      onClose: () => {
        dismissedThisPage = true;
        hide();
      },
    });
  }

  function showLauncher(fieldCount) {
    ensureHost();
    clearBody();
    mode = 'launcher';
    const wrap = document.createElement('div');
    wrap.className = 'pm-launcher-wrap';
    const button = document.createElement('button');
    button.className = 'pm-launcher';
    button.title = 'Open the PracticeMode form copilot';
    button.innerHTML = `<span>PracticeMode</span>${fieldCount ? `<span class="count">${fieldCount} fields</span>` : ''}`;
    button.addEventListener('click', open);
    const hideButton = document.createElement('button');
    hideButton.className = 'pm-launcher-hide';
    hideButton.title = 'Hide on this site';
    hideButton.textContent = '✕';
    hideButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      const hidden = await readLocal(HIDDEN_KEY, {});
      hidden[location.origin] = true;
      await chrome.storage.local.set({ [HIDDEN_KEY]: hidden });
      hide();
    });
    wrap.append(button, hideButton);
    shadow.appendChild(wrap);
  }

  function hide() {
    clearBody();
    host?.remove();
    host = null;
    shadow = null;
    mode = 'hidden';
  }

  async function maybeShowLauncher() {
    if (mode !== 'hidden' || dismissedThisPage) return;
    const settings = { ...PM.safetyPolicy.DEFAULT_SETTINGS, ...(await readLocal(PM.safetyPolicy.SETTINGS_KEY, {})) };
    if (!settings.showLauncher) return;
    if ((await readLocal(HIDDEN_KEY, {}))[location.origin]) return;
    if (PM.safetyPolicy.classifyOrigin(location.href) === 'unsupported') return;
    const count = PM.fieldExtractor.extractFields().length;
    if (count >= 3) showLauncher(count);
  }

  async function init() {
    const me = await whoAmI();
    if (!me || me.tabId === null) return;
    tabId = me.tabId;
    const stateKey = `pm_state_${tabId}`;

    const state = await readSession(stateKey);
    if (state && ACTIVE.has(state.status)) open();
    else setTimeout(maybeShowLauncher, 1200);

    // Keep the panel visible whenever an extraction becomes active here.
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'session' || !changes[stateKey]) return;
        const next = changes[stateKey].newValue;
        if (next && ACTIVE.has(next.status) && mode !== 'open' && !dismissedThisPage) open();
      });
    } catch (_) { /* session storage not accessible; the launcher still works */ }

    // Single-page apps change URLs without reloading.
    let lastHref = location.href;
    const urlWatcher = setInterval(() => {
      if (!chrome.runtime?.id) {
        // Extension reloaded: this copy is orphaned. Remove its UI and stop.
        clearInterval(urlWatcher);
        hide();
        return;
      }
      if (location.href !== lastHref) {
        lastHref = location.href;
        controller?.setPageUrl(location.href);
      }
    }, 1000);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'PM_PANEL') return false;
    dismissedThisPage = false;
    if (message.action === 'open') open();
    sendResponse({ success: true });
    return false;
  });

  PM.copilotPanel = { open, hide, showLauncher };
  init();
})();
