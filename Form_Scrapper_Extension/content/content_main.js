/**
 * content/content_main.js  (v2 — robust orchestrator)
 * Fixes:
 *  1. Live DOM field references passed correctly to navigation
 *  2. Conditional probing is time-limited and non-blocking
 *  3. Scan Current Step works independently of all state
 *  4. Full error trapping with progress reporting at every step
 *  5. Extraction never hangs — every async op has a timeout
 */

window.PracticeMode = window.PracticeMode || {};

window.PracticeMode.main = (() => {
  const { extractFields, extractStep, sanitizeForExport } = window.PracticeMode.fieldExtractor;
  const { populateRequiredFields } = window.PracticeMode.fieldPopulator;
  const { advanceStep, getPageSignature, MAX_STEPS } = window.PracticeMode.navigationController;
  const { discoverConditionals, annotateWithConditionals } = window.PracticeMode.conditionalTracker;
  const { detectNavigationElements, detectStepIndicator, isFinalReviewPage, detectBarriers } = window.PracticeMode.stepDetector;
  const state = window.PracticeMode.extractionState;
  const { sleep } = window.PracticeMode.utils;

  // ── Progress reporting ──
  function reportProgress(info) {
    try {
      chrome.runtime.sendMessage({ type: 'EXTRACTION_PROGRESS', ...info });
    } catch (e) { /* popup may be closed */ }
  }

  // ── Single-step scan (standalone, no navigation) ──
  async function scanCurrentStep() {
    try {
      const rawFields = extractFields();
      const stepTitle = document.querySelector('h1, h2, [class*="title"]')?.innerText?.trim()
        || document.title || 'Current Step';
      const formTitle = document.querySelector('h1')?.innerText?.trim() || document.title || 'Form';

      // Skip conditional probing for scan — keep it instant
      const fields = sanitizeForExport(rawFields);

      return {
        formTitle,
        extractionStatus: 'single_step',
        sourceUrl: window.location.href,
        capturedStepCount: 1,
        steps: [{
          step: 1,
          title: stepTitle,
          url: window.location.href,
          fields,
        }],
        conditionalDependencies: [],
        unvisitedSteps: [],
        warnings: [],
        extractedAt: new Date().toISOString(),
      };
    } catch (e) {
      return {
        formTitle: 'Error',
        extractionStatus: 'error',
        error: e.message,
        steps: [],
        capturedStepCount: 0,
      };
    }
  }

  // ── Multi-step extraction ──
  async function runFullExtraction(isResume = false) {
    let currentState = await state.load();

    if (!isResume || !currentState || currentState.status !== 'running') {
      const formId = `form_${Date.now()}`;
      try {
        currentState = await state.initialize(formId);
      } catch (e) {
        reportProgress({ message: `Init error: ${e.message}`, error: true });
        return;
      }
    }

    let stepNumber = (currentState.capturedSteps?.length || 0) + 1;
    reportProgress({ message: `Extracting step ${stepNumber}…`, currentState, step: stepNumber });

    const visitedSigs = new Set(currentState.visitedSignatures || []);
    let retries = 0;
    const MAX_RETRIES = 2;

    // Detect total steps
    try {
      const indicator = detectStepIndicator();
      if (indicator?.total) await state.setTotalSteps(indicator.total);
    } catch (e) { /* non-critical */ }

    while (stepNumber <= MAX_STEPS) {
      // ── Check pause/stop ──
      try {
        currentState = await state.load();
        if (currentState && ['paused', 'stopped'].includes(currentState.status)) {
          reportProgress({ message: `Extraction ${currentState.status}.`, currentState });
          return;
        }
      } catch (e) { /* continue */ }

      // ── Loop detection ──
      let sig;
      try {
        sig = getPageSignature();
        if (visitedSigs.has(sig)) {
          await state.addWarning(`Loop detected at step ${stepNumber} — stopping.`);
          await state.setStatus('complete', { warning: 'Navigation loop detected.' });
          break;
        }
        visitedSigs.add(sig);
        await state.addVisitedSignature(sig);
      } catch (e) { sig = `step_${stepNumber}`; }

      reportProgress({ message: `Extracting step ${stepNumber}…`, currentState, step: stepNumber });

      // ── Extract current step ──
      let stepData;
      try {
        stepData = extractStep(stepNumber, window.location.href);
      } catch (e) {
        await state.addWarning(`Field extraction error at step ${stepNumber}: ${e.message}`);
        await state.setStatus('complete', { warning: e.message });
        break;
      }

      const rawFields = stepData._rawFields || [];

      // ── Discover conditionals (time-limited, non-blocking) ──
      try {
        const conditionals = await discoverConditionals(rawFields);
        if (conditionals.length > 0) {
          stepData.fields = sanitizeForExport(
            annotateWithConditionals(rawFields, conditionals)
          );
          // Merge into state
          const s = await state.load();
          const existing = s?.conditionalResults || [];
          await state.setConditionalResults([...existing, ...conditionals]);
        }
      } catch (e) {
        // Conditional probing failed — not critical
        await state.addWarning(`Conditional probing skipped at step ${stepNumber}: ${e.message}`);
      }

      // ── Save step (strip DOM refs before storage) ──
      const stepForStorage = {
        step: stepData.step,
        title: stepData.title,
        url: stepData.url,
        fields: stepData.fields,
        sections: stepData.sections || [],
        formTitle: stepData.formTitle,
      };

      try {
        await state.addCapturedStep(stepForStorage);
      } catch (e) {
        await state.addWarning(`Failed to save step ${stepNumber}: ${e.message}`);
      }

      currentState = await state.load();
      const fieldCount = stepData.fields?.length || 0;

      reportProgress({
        message: `Step ${stepNumber}: ${fieldCount} fields captured. Checking navigation…`,
        currentState,
        step: stepNumber,
        fieldsCount: fieldCount,
      });

      // ── Check for barriers ──
      let barriers = [];
      try { barriers = detectBarriers(); } catch (e) { /* ignore */ }
      if (barriers.length > 0) {
        const msg = barriers.map(b => b.message).join('; ');
        await state.addWarning(msg);
        await state.addUnvisitedStep({ title: `Step ${stepNumber + 1}`, reason: msg });
        await state.setStatus('complete', { warning: msg, requiresManual: true });
        break;
      }

      // ── Check if final review page ──
      let isFinal = false;
      try { isFinal = isFinalReviewPage(); } catch (e) { /* ignore */ }
      if (isFinal) {
        await state.addWarning('Final review/submission page detected — stopping before submission.');
        await state.addUnvisitedStep({ title: 'Final Submission', reason: 'Stopped to prevent form submission.' });
        await state.setStatus('complete');
        break;
      }

      // ── Detect navigation options ──
      let navEls;
      try { navEls = detectNavigationElements(); }
      catch (e) { navEls = { nextButtons: [], finalButtons: [], ambiguousButtons: [], barriers: [] }; }

      if (navEls.nextButtons.length === 0 && navEls.finalButtons.length > 0) {
        await state.addUnvisitedStep({ title: 'Final Submission', reason: 'Only submission buttons detected.' });
        await state.setStatus('complete');
        break;
      }

      if (navEls.nextButtons.length === 0) {
        // Unknown buttons (for example, "Save preferences") are not evidence
        // that another step exists. Do not click them just to chase coverage.
        if (navEls.ambiguousButtons.length > 0) {
          await state.addWarning('No recognized next-step action found; unrecognized controls were not clicked.');
        }
        await state.setStatus('complete');
        reportProgress({ message: `Extraction complete — ${stepNumber} step(s) captured.`, currentState: await state.load(), exportReady: true });
        return;
      }

      // ── Attempt navigation ──
      currentState = await state.load();
      const advResult = await advanceStep(rawFields, currentState || {});

      if (!advResult.advanced) {
        if (advResult.requiresManual || advResult.isFinal) {
          if (advResult.isFinal) {
            await state.addUnvisitedStep({ title: 'Final Submission', reason: advResult.warning || 'Stopped at final step.' });
          } else {
            await state.addUnvisitedStep({ title: `Step ${stepNumber + 1}`, reason: advResult.warning || 'Manual intervention required.' });
          }
          await state.setStatus('complete', { warning: advResult.warning, requiresManual: !advResult.isFinal });
          break;
        }

        // Transient failure — retry
        retries++;
        if (retries > MAX_RETRIES) {
          await state.addWarning(`Could not advance past step ${stepNumber}: ${advResult.warning}`);
          await state.setStatus('complete', { warning: advResult.warning });
          break;
        }
        reportProgress({ message: `Retry ${retries}/${MAX_RETRIES}: ${advResult.warning || 'Retrying…'}`, currentState });
        await sleep(1200);
        continue;
      }

      retries = 0;
      stepNumber++;
      await sleep(600);
    }

    if (stepNumber > MAX_STEPS) {
      await state.addWarning(`Reached maximum step limit (${MAX_STEPS}).`);
    }

    await state.setStatus('complete');
    const exportData = await state.buildExport();
    reportProgress({
      message: `Done — ${exportData?.capturedStepCount || 0} step(s) extracted.`,
      currentState: await state.load(),
      exportReady: true,
    });
  }

  // ── Message handler ──
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handle = async () => {
      try {
        switch (message.type) {
          case 'SCAN_CURRENT_STEP': {
            const result = await scanCurrentStep();
            sendResponse({ success: true, data: result });
            break;
          }
          case 'EXTRACT_COMPLETE_FORM': {
            sendResponse({ success: true, message: 'Extraction started.' });
            // Run async — don't await in message handler
            runFullExtraction().catch(async (e) => {
              console.error('[PracticeMode] Extraction error:', e);
              try {
                await state.addWarning(`Fatal error: ${e.message}`);
                await state.setStatus('error', { warning: e.message });
              } catch (_) {}
              reportProgress({ message: `Error: ${e.message}`, error: true });
            });
            break;
          }
          case 'PAUSE_EXTRACTION':
            await state.setStatus('paused');
            sendResponse({ success: true });
            break;
          case 'RESUME_EXTRACTION':
            sendResponse({ success: true });
            runFullExtraction(true).catch(async e => {
              await state.setStatus('error', { warning: e.message });
            });
            break;
          case 'STOP_EXTRACTION':
            await state.setStatus('stopped');
            sendResponse({ success: true });
            break;
          case 'SET_SAFE_NAVIGATION':
            await state.setSafeNavigation(message.enabled);
            sendResponse({ success: true });
            break;
          case 'GET_EXPORT': {
            const data = await state.buildExport();
            sendResponse({ success: true, data });
            break;
          }
          case 'GET_STATE': {
            const data = await state.load();
            sendResponse({ success: true, data });
            break;
          }
          case 'CLEAR_STATE':
            await state.clear();
            sendResponse({ success: true });
            break;
          default:
            sendResponse({ success: false, error: `Unknown: ${message.type}` });
        }
      } catch (e) {
        console.error('[PracticeMode] Message handler error:', e);
        sendResponse({ success: false, error: e.message });
      }
    };
    handle();
    return true; // keep channel open for async
  });

  // ── Auto-resume if page reloaded during extraction ──
  (async () => {
    try {
      await sleep(800); // wait for scripts to settle
      const s = await state.load();
      if (s && s.status === 'running' && state.matchesCurrentFrame(s)) {
        console.log('[PracticeMode] Resuming extraction after page reload…');
        runFullExtraction(true).catch(console.error);
      }
    } catch (e) { /* ignore */ }
  })();

  return { runFullExtraction, scanCurrentStep };
})();
