/**
 * content/step_detector.js
 * Detects next-step navigation actions on the current page.
 * Distinguishes safe step navigation from final form submission.
 * Never treats a button as safe merely because it is labeled "Next."
 */

window.PracticeMode = window.PracticeMode || {};

window.PracticeMode.stepDetector = (() => {
  const { isVisible } = window.PracticeMode.utils;

  // ──────────────────────────────────────────────
  // Label patterns
  // ──────────────────────────────────────────────

  // ──────────────────────────────────────────────
  // Label patterns
  // ──────────────────────────────────────────────

  const NEXT_PATTERNS = [
    /\bnext\b/i,
    /\bcontinue\b/i,
    /\bproceed\b/i,
    /\bforward\b/i,
    /\bgo\s+(to\s+)?next/i,
    /\bstep\s*\d+\b/i,
    /\bweiter\b/i,       // German: Continue
    /\bsuivant\b/i,      // French: Next
    /\bsiguiente\b/i,    // Spanish: Next
  ];

  const FINAL_PATTERNS = [
    /\bsubmit\b/i,
    /\bfinish\b/i,
    /\bapply(\s+now)?\b/i,
    /\bconfirm\b/i,
    /\bpay(\s+now)?\b/i,
    /\bcomplete\b/i,
    /\bsend(\s+application)?\b/i,
    /\bregister\b/i,
    /\bsign\s*up\b/i,
    /\bcreate\s+(account|profile)\b/i,
    /\bplace\s+order\b/i,
    /\bbuy\s+now\b/i,
    /\bcheckout\b/i,
    /\bdone\b/i,
    /\bfinalize\b/i,
  ];

  const BACK_PATTERNS = [
    /\bback\b/i,
    /\bprevious\b/i,
    /\bprev\b/i,
    /\bgo\s+back\b/i,
    /\breturn\b/i,
    /^[←«<]/,
  ];

  // ──────────────────────────────────────────────
  // Button candidate scoring
  // ──────────────────────────────────────────────

  function getButtonText(btn) {
    if (!btn) return '';
    const text = (btn.innerText || btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim();
    return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  }

  function classifyButton(btn) {
    const rawText = getButtonText(btn);
    const ariaLabel = (btn.getAttribute('aria-label') || '').trim();
    const title = (btn.getAttribute('title') || '').trim();
    const combined = `${rawText} ${ariaLabel} ${title}`.trim();
    const idAndClass = `${btn.id || ''} ${btn.className || ''} ${btn.getAttribute('data-action') || ''} ${btn.getAttribute('data-step') || ''}`.toLowerCase();

    // 1. Back button check (highest priority to avoid misclassifying back button with arrow)
    if (BACK_PATTERNS.some((p) => p.test(combined)) || /btn-back|back-btn|prev-btn|go-back/i.test(idAndClass)) {
      return 'back';
    }

    // 2. Next / Continue check (takes precedence over generic submit if "continue" or "next" is present)
    const hasNextWord = NEXT_PATTERNS.some((p) => p.test(combined));
    const hasNextArrow = /[→›»>]/.test(rawText) && !/back|prev/i.test(combined);
    const hasNextClass = /btn-next|next-btn|btn-continue|continue-btn|wizard-next|forward-btn/i.test(idAndClass);
    const hasNextAction = /next|continue|proceed|forward/i.test(btn.getAttribute?.('data-action') || '') || Boolean(btn.hasAttribute ? btn.hasAttribute('data-next') : btn.getAttribute?.('data-next'));

    if (hasNextWord || hasNextClass || hasNextAction || (hasNextArrow && combined.length < 30)) {
      return 'next';
    }

    // Review step navigation (e.g. "Review Application →") before submission
    if (/\breview\b/i.test(combined) && !/\bsubmit\b/i.test(combined)) {
      return 'next';
    }

    // 3. Final submission check
    if (FINAL_PATTERNS.some((p) => p.test(combined)) || /btn-submit|final-submit|submit-btn/i.test(idAndClass)) {
      return 'final';
    }

    // Check data attributes
    const dataAction = btn.getAttribute('data-action') || btn.getAttribute('data-step') || '';
    if (/next|continue|proceed/i.test(dataAction)) return 'next';
    if (/submit|finish|final/i.test(dataAction)) return 'final';

    // 4. Form submit type context
    if (btn.type === 'submit') {
      const form = btn.closest('form');
      if (form) {
        const formClasses = `${form.className} ${form.getAttribute('data-type') || ''} ${form.id || ''}`.toLowerCase();
        if (/wizard|multi.?step|step/i.test(formClasses)) return 'next_submit';
      }
      return 'ambiguous_submit';
    }

    return 'unknown';
  }

  // ──────────────────────────────────────────────
  // Tab/accordion navigation
  // ──────────────────────────────────────────────

  function detectTabs() {
    const tabSelectors = [
      '[role="tab"]',
      '[class*="tab-item"]',
      '[class*="wizard-step"]',
      '[class*="step-indicator"]',
    ];

    const tabs = [];
    for (const sel of tabSelectors) {
      const found = Array.from(document.querySelectorAll(sel)).filter(isVisible);
      if (found.length > 1) {
        tabs.push(...found);
        break;
      }
    }
    return tabs;
  }

  // ──────────────────────────────────────────────
  // Validation error detection
  // ──────────────────────────────────────────────

  function detectValidationErrors() {
    const errorSelectors = [
      '[class*="error"]:not(style)',
      '[class*="invalid"]:not(style)',
      '[aria-invalid="true"]',
      '.field-error',
      '.validation-error',
      '.form-error',
      '[role="alert"]',
    ];

    const errors = [];
    for (const sel of errorSelectors) {
      const els = Array.from(document.querySelectorAll(sel)).filter(isVisible);
      for (const el of els) {
        const text = el.innerText.trim();
        if (text && text.length < 500) errors.push(text);
      }
    }
    return [...new Set(errors)];
  }

  // ──────────────────────────────────────────────
  // Progression barrier detection
  // ──────────────────────────────────────────────

  function detectBarriers() {
    const barriers = [];

    // CAPTCHA
    const captchaIndicators = [
      '[class*="captcha"]',
      '[class*="recaptcha"]',
      '#g-recaptcha',
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
    ];
    for (const sel of captchaIndicators) {
      if (document.querySelector(sel)) {
        barriers.push({ type: 'captcha', message: 'CAPTCHA detected — manual completion required.' });
        break;
      }
    }

    // Auth wall
    if (document.querySelector('[class*="login-wall"], [class*="auth-required"], #login-modal')) {
      barriers.push({ type: 'auth', message: 'Authentication required — manual login needed.' });
    }

    // Identity verification
    if (/identity\s*verification|verify\s*your\s*identity/i.test(document.body.innerText)) {
      barriers.push({ type: 'identity_verification', message: 'Identity verification required — manual completion required.' });
    }

    return barriers;
  }

  // ──────────────────────────────────────────────
  // Primary detection API
  // ──────────────────────────────────────────────

  /**
   * Scan the page and find all navigation-relevant buttons.
   */
  function detectNavigationElements() {
    const candidates = Array.from(
      document.querySelectorAll(
        'button, input[type="submit"], input[type="button"], [role="button"]'
      )
    ).filter(isVisible);

    const result = {
      nextButtons: [],
      finalButtons: [],
      backButtons: [],
      ambiguousButtons: [],
      tabs: detectTabs(),
      barriers: detectBarriers(),
      validationErrors: detectValidationErrors(),
    };

    for (const btn of candidates) {
      const category = classifyButton(btn);
      switch (category) {
        case 'next':
        case 'next_submit':
          result.nextButtons.push(btn);
          break;
        case 'final':
          result.finalButtons.push(btn);
          break;
        case 'back':
          result.backButtons.push(btn);
          break;
        case 'ambiguous_submit':
        case 'unknown':
          result.ambiguousButtons.push({ button: btn, text: getButtonText(btn), category });
          break;
      }
    }

    return result;
  }

  /**
   * Detect step indicator to understand how many total steps exist.
   */
  function detectStepIndicator() {
    // Common step counter patterns
    const indicators = [
      { pattern: /step\s*(\d+)\s*of\s*(\d+)/i, source: document.body.innerText },
    ];

    for (const { pattern, source } of indicators) {
      const match = source.match(pattern);
      if (match) {
        return { current: parseInt(match[1]), total: parseInt(match[2]) };
      }
    }

    // Progress bar with aria attributes
    const progressBar = document.querySelector('[role="progressbar"], [class*="progress"]');
    if (progressBar) {
      const now = progressBar.getAttribute('aria-valuenow');
      const max = progressBar.getAttribute('aria-valuemax');
      if (now && max) {
        return { current: parseInt(now), total: parseInt(max) };
      }
    }

    return null;
  }

  /**
   * Check if the current page looks like a final review/confirmation page.
   */
  function isFinalReviewPage() {
    const reviewKeywords = /review\s*your|summary|confirmation|you('re|\s+are)\s+almost|final\s*step/i;
    const heading = document.querySelector('h1, h2');
    if (heading && reviewKeywords.test(heading.innerText)) return true;

    const navEls = detectNavigationElements();
    // If there are final submit buttons and no next buttons, likely final page
    if (navEls.finalButtons.length > 0 && navEls.nextButtons.length === 0) return true;

    return false;
  }

  return {
    detectNavigationElements,
    detectStepIndicator,
    detectValidationErrors,
    detectBarriers,
    isFinalReviewPage,
    classifyButton,
    getButtonText,
    detectTabs,
  };
})();
