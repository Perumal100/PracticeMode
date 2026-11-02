/**
 * background/service_worker.js
 * Background service worker — handles tab messaging, cross-tab coordination,
 * and relays messages from the popup to active content scripts.
 */

// Relay messages from popup → content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FIND_FORM_FRAME') {
    const tabId = message.tabId;
    if (!Number.isInteger(tabId)) {
      sendResponse({ success: false, error: 'No browser tab was provided.' });
      return;
    }

    chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      const scans = (frames || []).map(frame => new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, { type: 'SCAN_CURRENT_STEP' }, { frameId: frame.frameId }, response => {
          if (chrome.runtime.lastError || !response?.success) {
            resolve({ frameId: frame.frameId, fieldCount: -1 });
            return;
          }
          resolve({
            frameId: frame.frameId,
            fieldCount: response.data?.steps?.[0]?.fields?.length || 0,
            title: response.data?.formTitle || '',
          });
        });
      }));

      Promise.all(scans).then(results => {
        const best = results.sort((a, b) => b.fieldCount - a.fieldCount)[0];
        if (!best || best.fieldCount <= 0) {
          sendResponse({ success: false, error: 'No accessible form fields were found in this page or its embedded frames.' });
          return;
        }
        sendResponse({ success: true, frameId: best.frameId, fieldCount: best.fieldCount, title: best.title });
      });
    });
    return true;
  }

  if (message.type === 'OPEN_FORM_PREVIEW') {
    const data = message.data;
    if (!data || !Array.isArray(data.steps)) {
      sendResponse({ success: false, error: 'No extracted form data is available.' });
      return;
    }

    chrome.storage.local.set({ pm_form_preview_v1: data }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      chrome.tabs.create({ url: chrome.runtime.getURL('preview/preview.html') }, (tab) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ success: true, tabId: tab.id });
      });
    });
    return true;
  }

  if (message.target === 'content') {
    // Forward to the active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, error: 'No active tab found.' });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      });
    });
    return true; // async
  }

  if (message.target === 'popup') {
    // Forward to popup — find extension popup port if open
    // (Popup listens via chrome.runtime.onMessage directly)
  }
});

// Handle tab navigation — content script auto-resumes via its own initialization logic
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // Tab finished loading
  }
});
