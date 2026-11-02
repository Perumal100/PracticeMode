/**
 * popup/popup.js  (v2 — robust)
 */

// ──────────────────────────────────────────────
// Element references
// ──────────────────────────────────────────────
const el = {
  statusBadge:      document.getElementById('statusBadge'),
  statusLabel:      document.getElementById('statusLabel'),
  safeNavCheck:     document.getElementById('safeNavCheck'),
  btnScanStep:      document.getElementById('btnScanStep'),
  btnExtract:       document.getElementById('btnExtract'),
  btnPause:         document.getElementById('btnPause'),
  btnResume:        document.getElementById('btnResume'),
  btnStop:          document.getElementById('btnStop'),
  progressPanel:    document.getElementById('progressPanel'),
  progressBar:      document.getElementById('progressBar'),
  progressMessage:  document.getElementById('progressMessage'),
  statDetected:     document.getElementById('statDetected'),
  statCaptured:     document.getElementById('statCaptured'),
  statFields:       document.getElementById('statFields'),
  statStep:         document.getElementById('statStep'),
  warningBox:       document.getElementById('warningBox'),
  warningText:      document.getElementById('warningText'),
  manualNotice:     document.getElementById('manualNotice'),
  exportPanel:      document.getElementById('exportPanel'),
  exportStatus:     document.getElementById('exportStatus'),
  btnExportPartial: document.getElementById('btnExportPartial'),
  btnDownloadJSON:  document.getElementById('btnDownloadJSON'),
  btnPreviewForm:   document.getElementById('btnPreviewForm'),
  previewPanel:     document.getElementById('previewPanel'),
  previewCode:      document.getElementById('previewCode'),
  btnCopy:          document.getElementById('btnCopy'),
};

// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────
let lastExportData = null;
let pollingTimer = null;
let isExtracting = false;
let selectedFrameId = null;

// ──────────────────────────────────────────────
// Messaging
// ──────────────────────────────────────────────
async function sendToContent(message, frameId = selectedFrameId) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        resolve({ success: false, error: 'No active tab found.' });
        return;
      }
      try {
        const callback = (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(resp || { success: false, error: 'No response' });
          }
        };
        if (Number.isInteger(frameId)) chrome.tabs.sendMessage(tabs[0].id, message, { frameId }, callback);
        else chrome.tabs.sendMessage(tabs[0].id, message, callback);
      } catch (e) {
        resolve({ success: false, error: e.message });
      }
    });
  });
}

async function selectFormFrame() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs?.[0]?.id;
      if (!Number.isInteger(tabId)) {
        resolve({ success: false, error: 'No active tab found.' });
        return;
      }
      chrome.runtime.sendMessage({ type: 'FIND_FORM_FRAME', tabId }, response => {
        if (chrome.runtime.lastError || !response?.success) {
          resolve({ success: false, error: response?.error || chrome.runtime.lastError?.message || 'No accessible form found.' });
          return;
        }
        selectedFrameId = response.frameId;
        resolve(response);
      });
    });
  });
}

// ──────────────────────────────────────────────
// UI helpers
// ──────────────────────────────────────────────
function setStatus(status, label) {
  el.statusBadge.className = `status-badge ${status || ''}`;
  el.statusLabel.textContent = label || 'Ready';
}

function setMessage(msg) {
  if (el.progressMessage) el.progressMessage.textContent = msg || '';
}

function showProgressPanel() {
  if (el.progressPanel) el.progressPanel.style.display = 'flex';
}

function showWarning(text) {
  if (!text) { el.warningBox.style.display = 'none'; return; }
  el.warningBox.style.display = 'flex';
  el.warningText.textContent = text;
}

function showExportPanel(status) {
  el.exportPanel.style.display = 'block';
  el.exportStatus.textContent = status || 'Ready';
}

function updateProgressBar(captured, total) {
  if (total && captured > 0) {
    el.progressBar.style.width = Math.min(100, Math.round((captured / total) * 100)) + '%';
  } else if (captured > 0) {
    el.progressBar.style.width = '60%'; // indeterminate progress
  }
}

function updateStats(state) {
  const captured = state?.capturedSteps?.length || 0;
  const totalFields = state?.capturedSteps?.reduce((sum, s) => sum + (s.fields?.length || 0), 0) || 0;
  el.statCaptured.textContent = captured;
  el.statFields.textContent = totalFields;
  el.statDetected.textContent = state?.totalStepsDetected || '?';
  el.statStep.textContent = state?.currentStep || (captured > 0 ? captured : '—');
  updateProgressBar(captured, state?.totalStepsDetected);
}

function applyState(state) {
  if (!state) return;
  updateStats(state);
  showWarning(state.activeWarning);
  el.manualNotice.style.display = state.requiresManual ? 'flex' : 'none';

  // Pause/Resume button visibility
  const paused = state.status === 'paused';
  el.btnPause.style.display = paused ? 'none' : 'inline-flex';
  el.btnResume.style.display = paused ? 'inline-flex' : 'none';

  // Status badge
  const statusMap = {
    running: ['running', 'Running'],
    paused:  ['paused',  'Paused'],
    complete:['complete','Done'],
    error:   ['error',   'Error'],
    stopped: ['',        'Stopped'],
  };
  const [cls, lbl] = statusMap[state.status] || ['', 'Ready'];
  setStatus(cls, lbl);

  // Show export if we have data
  if ((state.capturedSteps?.length || 0) > 0) {
    showExportPanel(state.status === 'complete' ? 'Complete' : 'Partial');
  }

  // Complete the progress bar on done
  if (state.status === 'complete' || state.status === 'error') {
    el.progressBar.style.width = '100%';
  }
}

// ──────────────────────────────────────────────
// Polling
// ──────────────────────────────────────────────
async function pollState() {
  try {
    const resp = await sendToContent({ type: 'GET_STATE' });
    if (resp?.success && resp.data) {
      applyState(resp.data);
      if (['running', 'paused'].includes(resp.data.status)) {
        pollingTimer = setTimeout(pollState, 1000);
      } else {
        isExtracting = false;
        el.btnExtract.disabled = false;
        if (resp.data.status === 'complete') {
          fetchAndShowExport();
        }
      }
    }
  } catch (e) {
    // Tab may have navigated — retry in a moment
    pollingTimer = setTimeout(pollState, 2000);
  }
}

function startPolling() {
  clearTimeout(pollingTimer);
  pollingTimer = setTimeout(pollState, 800);
}

// ──────────────────────────────────────────────
// Export helpers
// ──────────────────────────────────────────────
async function fetchAndShowExport() {
  try {
    const resp = await sendToContent({ type: 'GET_EXPORT' });
    if (resp?.success && resp.data && resp.data.capturedStepCount > 0) {
      lastExportData = resp.data;
      showExportPanel(resp.data.extractionStatus === 'complete' ? 'Complete' : 'Partial');
      const preview = JSON.stringify(resp.data, null, 2);
      el.previewCode.textContent = preview.length > 4000
        ? preview.slice(0, 4000) + '\n\n… (truncated — download for full output)'
        : preview;
      el.previewPanel.style.display = 'block';
    }
  } catch (e) { /* ignore */ }
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ──────────────────────────────────────────────
// Progress messages from content script
// ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'EXTRACTION_PROGRESS') return;
  if (message.message) setMessage(message.message);
  if (message.currentState) applyState(message.currentState);
  if (message.exportReady) fetchAndShowExport();
  if (message.error) {
    setStatus('error', 'Error');
    isExtracting = false;
    el.btnExtract.disabled = false;
  }
});

// ──────────────────────────────────────────────
// Button: Scan Current Step
// ──────────────────────────────────────────────
el.btnScanStep.addEventListener('click', async () => {
  el.btnScanStep.disabled = true;
  showProgressPanel();
  setStatus('running', 'Scanning');
  setMessage('Scanning current step fields…');

  const target = await selectFormFrame();
  const resp = target.success
    ? await sendToContent({ type: 'SCAN_CURRENT_STEP' })
    : target;
  el.btnScanStep.disabled = false;

  if (resp?.success && resp.data) {
    lastExportData = resp.data;
    const fieldCount = resp.data.steps?.[0]?.fields?.length || 0;

    // Update stats manually since scan doesn't go through state
    el.statCaptured.textContent = 1;
    el.statFields.textContent = fieldCount;
    el.statStep.textContent = 1;
    el.statDetected.textContent = '?';
    el.progressBar.style.width = '100%';

    setStatus('complete', 'Done');
    setMessage(`✅ Scanned ${fieldCount} field${fieldCount !== 1 ? 's' : ''} on current step.`);

    // Show export
    showExportPanel('Single Step');
    const preview = JSON.stringify(resp.data, null, 2);
    el.previewCode.textContent = preview.length > 4000 ? preview.slice(0, 4000) + '\n…' : preview;
    el.previewPanel.style.display = 'block';
  } else {
    const errMsg = resp?.error || 'Could not reach page. Make sure the extension is loaded and the page is fully loaded.';
    setStatus('error', 'Error');
    setMessage(`❌ ${errMsg}`);
    showWarning(errMsg);
  }
});

// ──────────────────────────────────────────────
// Button: Extract Complete Form
// ──────────────────────────────────────────────
el.btnExtract.addEventListener('click', async () => {
  el.btnExtract.disabled = true;
  isExtracting = true;

  // Reset UI
  showProgressPanel();
  el.previewPanel.style.display = 'none';
  el.exportPanel.style.display = 'none';
  el.progressBar.style.width = '0%';
  el.statCaptured.textContent = '0';
  el.statFields.textContent = '0';
  el.statDetected.textContent = '?';
  el.statStep.textContent = '—';
  showWarning(null);
  el.manualNotice.style.display = 'none';

  setStatus('running', 'Starting');
  setMessage('Finding form fields…');

  const target = await selectFormFrame();
  if (!target.success) {
    const err = target.error || 'Could not find an accessible form.';
    setStatus('error', 'Error');
    setMessage(`❌ ${err}`);
    showWarning(err);
    el.btnExtract.disabled = false;
    isExtracting = false;
    return;
  }

  setMessage(`Found ${target.fieldCount} field${target.fieldCount === 1 ? '' : 's'}${target.frameId ? ' in an embedded form' : ''}. Clearing previous state…`);

  // Clear old state
  await sendToContent({ type: 'CLEAR_STATE' });

  // Sync safe-nav setting
  await sendToContent({ type: 'SET_SAFE_NAVIGATION', enabled: true });

  setMessage('Starting extraction…');

  const resp = await sendToContent({ type: 'EXTRACT_COMPLETE_FORM' });

  if (resp?.success) {
    setMessage('Extracting — please wait…');
    startPolling();
  } else {
    const err = resp?.error || 'Could not connect to page. Try reloading the page then retry.';
    setStatus('error', 'Error');
    setMessage(`❌ ${err}`);
    showWarning(err);
    el.btnExtract.disabled = false;
    isExtracting = false;
  }
});

// ──────────────────────────────────────────────
// Pause / Resume / Stop
// ──────────────────────────────────────────────
el.btnPause.addEventListener('click', async () => {
  clearTimeout(pollingTimer);
  await sendToContent({ type: 'PAUSE_EXTRACTION' });
  setStatus('paused', 'Paused');
  setMessage('Paused. Click Resume to continue.');
  el.btnPause.style.display = 'none';
  el.btnResume.style.display = 'inline-flex';
});

el.btnResume.addEventListener('click', async () => {
  el.btnResume.style.display = 'none';
  el.btnPause.style.display = 'inline-flex';
  setStatus('running', 'Running');
  setMessage('Resuming…');
  const target = await selectFormFrame();
  if (!target.success) {
    setStatus('error', 'Error');
    showWarning(target.error || 'Could not find the form to resume.');
    return;
  }
  await sendToContent({ type: 'RESUME_EXTRACTION' });
  startPolling();
});

el.btnStop.addEventListener('click', async () => {
  clearTimeout(pollingTimer);
  isExtracting = false;
  await sendToContent({ type: 'STOP_EXTRACTION' });
  setStatus('', 'Stopped');
  setMessage('Stopped. Download partial results below.');
  el.btnPause.style.display = 'inline-flex';
  el.btnResume.style.display = 'none';
  el.btnExtract.disabled = false;
  fetchAndShowExport();
});

// ──────────────────────────────────────────────
// Export buttons
// ──────────────────────────────────────────────
el.btnExportPartial.addEventListener('click', async () => {
  if (!lastExportData) await fetchAndShowExport();
  if (lastExportData) {
    downloadJSON(lastExportData, `practicemode_partial_${Date.now()}.json`);
  }
});

el.btnDownloadJSON.addEventListener('click', async () => {
  const resp = await sendToContent({ type: 'GET_EXPORT' });
  if (resp?.success && resp.data && (resp.data.capturedStepCount > 0 || (resp.data.steps && resp.data.steps.length > 0))) {
    lastExportData = resp.data;
    downloadJSON(resp.data, `practicemode_form_${Date.now()}.json`);
  } else if (lastExportData) {
    downloadJSON(lastExportData, `practicemode_form_${Date.now()}.json`);
  }
});

el.btnPreviewForm.addEventListener('click', async () => {
  let data = lastExportData;
  if (!data) {
    const resp = await sendToContent({ type: 'GET_EXPORT' });
    data = resp?.success ? resp.data : null;
  }
  if (!data?.steps?.length) {
    showWarning('Extract a form or scan a step before opening a preview.');
    return;
  }

  chrome.runtime.sendMessage({ type: 'OPEN_FORM_PREVIEW', data }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      showWarning(response?.error || 'Could not open the form preview.');
    }
  });
});

el.btnCopy.addEventListener('click', () => {
  const text = lastExportData ? JSON.stringify(lastExportData, null, 2) : el.previewCode.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    el.btnCopy.title = 'Copied!';
    setTimeout(() => (el.btnCopy.title = 'Copy JSON'), 1800);
  });
});

// ──────────────────────────────────────────────
// Automatic navigation is enabled for a user-started complete extraction.
// ──────────────────────────────────────────────
// ──────────────────────────────────────────────
// Init — load existing state on popup open
// ──────────────────────────────────────────────
(async () => {
  try {
    const resp = await sendToContent({ type: 'GET_STATE' });
    if (resp?.success && resp.data) {
      const s = resp.data;
      el.safeNavCheck.checked = true;

      if (['running', 'paused', 'complete', 'error'].includes(s.status)) {
        showProgressPanel();
        applyState(s);

        if (s.status === 'running') {
          setMessage('Extraction in progress…');
          el.btnExtract.disabled = true;
          isExtracting = true;
          startPolling();
        } else if (s.status === 'paused') {
          setMessage('Extraction paused. Resume or stop below.');
        } else if (s.status === 'complete') {
          setMessage(`Done — ${s.capturedSteps?.length || 0} step(s) captured.`);
          fetchAndShowExport();
        } else if (s.status === 'error') {
          setMessage(`Error: ${s.activeWarning || 'Unknown error'}`);
        }
      }
    }
  } catch (e) {
    // Popup opened with no active content script — fine, just show defaults
  }
})();
