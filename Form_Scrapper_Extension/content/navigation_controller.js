/**
 * content/navigation_controller.js
 * Step-navigation engine: fills required fields, triggers next-step actions,
 * waits for DOM changes, detects loops, and enforces safety rules.
 */

window.PracticeMode = window.PracticeMode || {};

window.PracticeMode.navigationController = (() => {
  const { waitForDOMStability, sleep } = window.PracticeMode.utils;
  const {
    detectNavigationElements,
    detectValidationErrors,
    detectBarriers,
    isFinalReviewPage,
    detectStepIndicator,
  } = window.PracticeMode.stepDetector;
  const { populateRequiredFields } = window.PracticeMode.fieldPopulator;

  // ──────────────────────────────────────────────
  // Loop detection
  // ──────────────────────────────────────────────

  const MAX_STEPS = 20;
  const MAX_RETRIES_PER_STEP = 2;

  function getPageSignature() {
    // URL + step title + visible field fingerprints as step identity
    const heading = document.querySelector('h1, h2, [class*="step-title"], [class*="section-title"], [class*="title"]')?.innerText?.trim() || '';
    const fields = window.PracticeMode.fieldExtractor.extractFields();
    const fingerprints = fields.map((f) => f._fingerprint).sort().join('|');
    return `${window.location.href}::${heading}::${fingerprints}`;
  }

  // ──────────────────────────────────────────────
  // Safety gate
  // ──────────────────────────────────────────────

  /**
   * Determine if auto-navigation is safe on this page.
   * Returns { safe, reason }
   */
  function checkSafetyPermission(state) {
    // The user explicitly starts extraction, so advance through ordinary form
    // steps on any origin. The hard stops below still protect final submission,
    // auth/CAPTCHA barriers, uploads, and sensitive identifiers.
    return { safe: true };
  }

  // ──────────────────────────────────────────────
  // Navigation action
  // ──────────────────────────────────────────────

  /**
   * Click the best next-step button found.
   * Returns { clicked, button, isFinal }
   */
  function clickNextButton(navEls) {
    // Prefer explicitly labeled next buttons (prefer non-disabled)
    if (navEls.nextButtons.length > 0) {
      const btn = navEls.nextButtons.find(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
      if (!btn) return { clicked: false, isFinal: false };
      btn.click();
      return { clicked: true, button: btn, isFinal: false };
    }

    // Ambiguous submit in a wizard context — use with caution
    const wizardSubmit = navEls.ambiguousButtons.find((b) => b.category === 'next_submit');
    if (wizardSubmit) {
      const btn = wizardSubmit.button;
      btn.click();
      return { clicked: true, button: btn, isFinal: false };
    }

    return { clicked: false, isFinal: false };
  }

  // ──────────────────────────────────────────────
  // Per-step advancement
  // ──────────────────────────────────────────────

  /**
   * Attempt to advance from the current step to the next.
   * Returns { advanced, warning, requiresManual, isFinal }
   */
  async function advanceStep(currentStepFields, state) {
    // 1. Safety check
    const safety = checkSafetyPermission(state);
    if (!safety.safe) {
      return { advanced: false, warning: safety.reason, requiresManual: true };
    }

    // 2. Check for barriers
    const barriers = detectBarriers();
    if (barriers.length > 0) {
      return {
        advanced: false,
        warning: `Barrier detected: ${barriers.map((b) => b.message).join('; ')}`,
        requiresManual: true,
      };
    }

    // 3. Check if this is the final page — do NOT auto-submit
    if (isFinalReviewPage()) {
      return { advanced: false, isFinal: true, warning: 'Final review page reached — stopping to prevent submission.' };
    }

    // 4. Initial check for navigation elements
    let navEls = detectNavigationElements();

    if (navEls.nextButtons.length === 0 && navEls.ambiguousButtons.length === 0 && navEls.finalButtons.length > 0) {
      return { advanced: false, isFinal: true, warning: 'Only submission buttons detected — stopping.' };
    }

    // 5. Populate required fields
    const popResult = await populateRequiredFields(currentStepFields);
    const warnings = [];

    if (popResult.requiresManual.length > 0) {
      return {
        advanced: false,
        warning: `Manual input needed: ${popResult.requiresManual.map((r) => r.reason).join('; ')}`,
        requiresManual: true,
      };
    }

    if (popResult.failed.length > 0) {
      warnings.push(`Some fields could not be populated: ${popResult.failed.map((f) => f.field).join(', ')}`);
    }

    // A required choice can reveal more required controls. Re-read the live
    // page after filling the initial snapshot so those controls are included
    // before we attempt to advance.
    await sleep(200);
    const newlyVisibleFields = window.PracticeMode.fieldExtractor.extractFields();
    const revealedPopResult = await populateRequiredFields(newlyVisibleFields);
    if (revealedPopResult.requiresManual.length > 0) {
      return {
        advanced: false,
        warning: `Manual input needed: ${revealedPopResult.requiresManual.map((r) => r.reason).join('; ')}`,
        requiresManual: true,
      };
    }
    if (revealedPopResult.failed.length > 0) {
      warnings.push(`Some revealed fields could not be populated: ${revealedPopResult.failed.map((f) => f.field).join(', ')}`);
    }

    // 6. Re-detect navigation elements after populating required fields
    // Frameworks like React/Angular dynamically unlock or render the Next button upon input
    await sleep(200);
    navEls = detectNavigationElements();

    if (navEls.nextButtons.length > 0 && navEls.nextButtons.every(button => button.disabled || button.getAttribute('aria-disabled') === 'true')) {
      await sleep(500);
      navEls = detectNavigationElements();
    }

    if (navEls.nextButtons.length === 0 && navEls.ambiguousButtons.length === 0) {
      if (navEls.finalButtons.length > 0) {
        return { advanced: false, isFinal: true, warning: 'Only submission buttons detected — stopping.' };
      }
      return { advanced: false, warning: 'No next-step button found.', requiresManual: true };
    }

    // 7. Click next
    const preSignature = getPageSignature();
    const clickResult = clickNextButton(navEls);

    if (!clickResult.clicked) {
      return { advanced: false, warning: 'Could not click next button.', requiresManual: true };
    }

    // 9. Wait for DOM to stabilize
    await waitForDOMStability(700, 8000);
    await sleep(300);

    // 10. Validate errors didn't appear
    const errors = detectValidationErrors();
    if (errors.length > 0) {
      return {
        advanced: false,
        warning: `Validation errors after clicking next: ${errors.slice(0, 3).join('; ')}`,
        validationErrors: errors,
        requiresManual: false, // might retry
      };
    }

    // 11. Loop detection
    const postSignature = getPageSignature();
    if (preSignature === postSignature) {
      return {
        advanced: false,
        warning: 'Page did not change after clicking next — possible loop or failed navigation.',
        requiresManual: true,
      };
    }

    return { advanced: true, warnings };
  }

  return {
    advanceStep,
    checkSafetyPermission,
    getPageSignature,
    MAX_STEPS,
    MAX_RETRIES_PER_STEP,
  };
})();
