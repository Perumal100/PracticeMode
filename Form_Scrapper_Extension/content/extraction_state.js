/**
 * content/extraction_state.js  (v2 — robust)
 * Uses chrome.storage.local (always available in content scripts).
 * Falls back to in-memory state if storage is unavailable.
 * Never stores real user data or sensitive content.
 */

window.PracticeMode = window.PracticeMode || {};

window.PracticeMode.extractionState = (() => {
  const STATE_KEY = 'pm_extraction_state_v2';

  // ── In-memory fallback ──
  let _memState = null;

  function createInitialState(formId, existingSettings = {}) {
    return {
      formId,
      status: 'idle',
      startUrl: window.location.href,
      frameContext: {
        isTopFrame: window.top === window,
        origin: window.location.origin,
      },
      currentStep: 0,
      totalStepsDetected: null,
      capturedSteps: [],
      visitedSignatures: [],
      unvisitedSteps: [],
      conditionalResults: [],
      warnings: [],
      activeWarning: null,
      requiresManual: false,
      safeNavigationEnabled: existingSettings.safeNavigationEnabled || false,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
    };
  }

  function matchesCurrentFrame(state) {
    const context = state?.frameContext;
    // State from older versions did not record a frame. Preserve that behavior
    // rather than preventing an existing extraction from resuming.
    if (!context) return true;
    return context.isTopFrame === (window.top === window) && context.origin === window.location.origin;
  }

  // ── Storage helpers with fallback ──
  async function save(state) {
    state.lastUpdatedAt = Date.now();
    _memState = state; // always keep in memory
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await new Promise((resolve) => {
          chrome.storage.local.set({ [STATE_KEY]: state }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
            resolve();
          });
        });
      }
    } catch (e) { /* storage unavailable — use memory only */ }
  }

  async function load() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await new Promise((resolve) => {
          chrome.storage.local.get([STATE_KEY], (r) => {
            if (chrome.runtime.lastError) { resolve(null); return; }
            resolve(r);
          });
        });
        const stored = result?.[STATE_KEY] || null;
        if (stored) { _memState = stored; return stored; }
      }
    } catch (e) { /* fall through */ }
    return _memState;
  }

  async function clear(keepSettings = true) {
    let safeNav = false;
    if (keepSettings) {
      const current = await load();
      safeNav = current?.safeNavigationEnabled || false;
    }
    _memState = null;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await new Promise((resolve) => {
          chrome.storage.local.remove([STATE_KEY], resolve);
        });
      }
    } catch (e) { /* ignore */ }
    if (keepSettings && safeNav) {
      await setSafeNavigation(true);
    }
  }

  // ── State mutations ──
  async function initialize(formId) {
    const current = await load();
    const existingSettings = {
      safeNavigationEnabled: current?.safeNavigationEnabled || false,
    };
    const state = createInitialState(formId, existingSettings);
    state.status = 'running';
    await save(state);
    return state;
  }

  async function addCapturedStep(stepData) {
    const state = await load() || createInitialState('auto');
    state.capturedSteps.push(stepData);
    state.currentStep = stepData.step;
    await save(state);
  }

  async function addVisitedSignature(sig) {
    const state = await load();
    if (!state) return false;
    if (state.visitedSignatures.includes(sig)) return false;
    state.visitedSignatures.push(sig);
    await save(state);
    return true;
  }

  async function isSignatureVisited(sig) {
    const state = await load();
    return state?.visitedSignatures?.includes(sig) || false;
  }

  async function addWarning(warning) {
    const state = await load();
    if (!state) return;
    state.warnings.push({ message: warning, step: state.currentStep, at: Date.now() });
    state.activeWarning = warning;
    await save(state);
  }

  async function setStatus(status, extra = {}) {
    const state = await load();
    if (!state) return;
    state.status = status;
    state.activeWarning = extra.warning || state.activeWarning || null;
    state.requiresManual = extra.requiresManual || false;
    await save(state);
  }

  async function setSafeNavigation(enabled) {
    let state = await load();
    if (!state) state = createInitialState('settings');
    state.safeNavigationEnabled = enabled;
    await save(state);
  }

  async function getSafeNavigation() {
    const state = await load();
    return state?.safeNavigationEnabled || false;
  }

  async function addUnvisitedStep(stepInfo) {
    const state = await load();
    if (!state) return;
    state.unvisitedSteps.push(stepInfo);
    await save(state);
  }

  async function setConditionalResults(results) {
    const state = await load();
    if (!state) return;
    state.conditionalResults = results;
    await save(state);
  }

  async function setTotalSteps(total) {
    const state = await load();
    if (!state) return;
    state.totalStepsDetected = total;
    await save(state);
  }

  async function buildExport() {
    const state = await load();
    if (!state) return null;
    const steps = state.capturedSteps.map((s) => ({
      step: s.step,
      title: s.title,
      url: s.url,
      fields: s.fields,
      sections: s.sections || [],
    }));
    return {
      formTitle: state.capturedSteps[0]?.formTitle || 'Untitled Form',
      extractionStatus: state.status === 'complete' ? 'complete' : 'partial',
      sourceUrl: state.startUrl,
      totalStepsDetected: state.totalStepsDetected,
      capturedStepCount: steps.length,
      steps,
      conditionalDependencies: state.conditionalResults || [],
      unvisitedSteps: state.unvisitedSteps || [],
      warnings: state.warnings || [],
      extractedAt: new Date(state.startedAt || Date.now()).toISOString(),
    };
  }

  return {
    initialize, load, save, clear,
    matchesCurrentFrame,
    addCapturedStep, addVisitedSignature, isSignatureVisited,
    addWarning, setStatus, setSafeNavigation, getSafeNavigation,
    addUnvisitedStep, setConditionalResults, setTotalSteps,
    buildExport,
  };
})();
