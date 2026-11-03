/**
 * popup/popup.js
 * Toolbar popup: the shared copilot UI bound to the active tab.
 */

(async () => {
  const PM = globalThis.PracticeMode;
  const style = document.createElement('style');
  style.textContent = PM.copilotStyles;
  document.head.appendChild(style);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const root = document.getElementById('root');
  if (!tab) {
    root.textContent = 'No active tab.';
    return;
  }

  PM.copilotController.create({
    root,
    variant: 'popup',
    tabId: tab.id,
    pageUrl: tab.url || tab.pendingUrl || '',
    onOpenPanel: async () => {
      const response = await PM.copilotController.sendCommand('openPanel', { tabId: tab.id });
      if (response?.success) window.close();
    },
  });
})();
