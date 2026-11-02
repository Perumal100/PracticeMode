/**
 * content/step_detector.js
 * Understands the page around the fields: which buttons advance a step and
 * which would submit, the step indicator / stepper, step titles, barriers
 * (CAPTCHA, sign-in, identity verification) and visible validation errors.
 *
 * A button is never considered safe merely because it says "Next": labels
 * that also contain a completion word ("Submit and continue", "Continue to
 * payment") are classified as ambiguous and require the user.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});
  const U = PM.utils;
  const policy = PM.safetyPolicy;

  const ACTION_SELECTOR = 'button, input[type="submit"], input[type="button"], input[type="image"], [role="button"], a[href]';
  const NEXT_RE = /\b(next|continue|proceed|forward|go\s+to\s+(the\s+)?next|next\s+step|save\s*(&|and)\s*(continue|next)|weiter|suivant|siguiente|pr[oó]ximo|avanti)\b/i;
  const BACK_RE = /^\s*[←‹«<]|\b(back|previous|prev|go\s+back|return|edit|start\s+over)\b/i;
  const REVIEW_RE = /\breview\b/i;
  const NOISE_CONTAINER = '[class*="carousel" i], [class*="slider" i], [class*="swiper" i], [class*="slick" i], [class*="datepicker" i], [class*="date-picker" i], [class*="calendar" i], nav[aria-label*="pagination" i], [class*="pagination" i], [role="listbox"], [role="menu"], [role="combobox"]';
  const NOISE_TEXT = /\b(slide|month|year|page\s*\d|photo|image|gallery|cookie|accept\s+all|close|dismiss|menu|search|filter|sort|share|print|help|chat|language)\b/i;

  // ── Actions ─────────────────────────────────────────────────────────
  function actionText(el) {
    const raw = el.matches('input') ? el.value || el.getAttribute('aria-label') || el.alt : el.innerText || el.textContent;
    const text = U.cleanText(raw);
    const extra = U.cleanText(`${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`);
    return { text: text || extra, combined: U.cleanText(`${text} ${extra}`) };
  }

  function isDisabled(el) {
    return el.disabled || el.getAttribute('aria-disabled') === 'true' || /\bdisabled\b/.test(el.className?.toString() || '');
  }

  function classify(el) {
    const { text, combined } = actionText(el);
    const meta = `${el.id || ''} ${el.className?.toString() || ''} ${el.getAttribute('data-action') || ''} ${el.getAttribute('data-testid') || ''} ${el.name || ''}`.toLowerCase();
    if (el.matches('input[type="reset"], button[type="reset"]')) return 'other';

    if (BACK_RE.test(combined) || /\b(btn-back|back-btn|prev-btn|btn-prev|go-back|previous)\b/.test(meta)) return 'back';

    // The visible label decides; class names and data attributes are only
    // used when the label says nothing (they are often copy-pasted styling).
    const textFinal = policy.FINAL_ACTION_RE.test(combined);
    const textNext = NEXT_RE.test(combined) || (/[→›»]\s*$/.test(text) && text.length < 30 && !textFinal);
    const metaFinal = /\b(btn-submit|submit-btn|final-submit|submit-application)\b/.test(meta);
    const metaNext = /\b(btn-next|next-btn|wizard-next|step-next|btn-continue|continue-btn|next-step)\b/.test(meta) ||
      /\b(next|continue|proceed)\b/.test(el.getAttribute('data-action') || '');

    if (textNext && textFinal) return 'ambiguous';
    if (textFinal) return 'final';
    if (textNext) return 'next';
    if (REVIEW_RE.test(combined)) return 'next';
    if (metaNext && metaFinal) return 'ambiguous';
    if (metaFinal) return 'final';
    if (metaNext) return 'next';
    if (el.matches('a[href]')) return 'other';
    if (el.form && (el.type === 'submit' || el.type === 'image')) return 'ambiguous';
    return 'other';
  }

  function commonAncestor(elements) {
    const els = elements.filter((e) => e?.isConnected);
    if (!els.length) return null;
    let node = els[0];
    while (node && !els.every((e) => node.contains(e))) node = node.parentElement;
    return node;
  }

  function fieldElements(fields) {
    return (fields || []).map((f) => f._proxy || f._el).filter(Boolean);
  }

  /** Every visible action on the page with its category and a relevance score. */
  function findActions(fields) {
    const els = fieldElements(fields);
    const container = commonAncestor(els);
    const forms = new Set(els.map((e) => e.form || e.closest?.('form')).filter(Boolean));
    const actions = [];
    for (const el of U.deepQueryAll(document, ACTION_SELECTOR)) {
      if (!U.isVisible(el) || el.closest(NOISE_CONTAINER)) continue;
      if (el.matches('[data-option], [aria-haspopup]')) continue;
      const { text, combined } = actionText(el);
      if (!combined) continue;
      const category = classify(el);
      if (el.matches('a[href]') && category === 'other') continue;
      if (category === 'other' && NOISE_TEXT.test(combined)) continue;
      if ((category === 'next' || category === 'ambiguous') && NOISE_TEXT.test(combined) && !NEXT_RE.test(text)) continue;
      let score = 0;
      if (container && container.contains(el)) score += 3;
      if (el.form && forms.has(el.form)) score += 3;
      if (container?.parentElement?.contains(el)) score += 1;
      if (/^(next|continue)\b/i.test(text)) score += 1;
      if (/\b(primary|main|cta)\b/i.test(el.className?.toString() || '')) score += 1;
      if (isDisabled(el)) score -= 2;
      actions.push({ el, text: text.slice(0, 80), category, score, disabled: isDisabled(el) });
    }
    return actions;
  }

  function summarize(actions) {
    const by = (c) => actions.filter((a) => a.category === c).sort((a, b) => b.score - a.score);
    return { next: by('next'), final: by('final'), back: by('back'), ambiguous: by('ambiguous'), other: by('other') };
  }

  // ── Step indicator & stepper ────────────────────────────────────────
  const STEPPER_SELECTOR = '[role="tablist"], ol[class*="step" i], ul[class*="step" i], [class*="stepper" i], [class*="progress-steps" i], [class*="wizard-steps" i], [class*="steps-nav" i], nav[aria-label*="step" i], [class*="breadcrumb" i][class*="step" i]';

  function cleanStepTitle(text) {
    return U.cleanText(text).replace(/^(step\s*)?\d+\s*[.):\-–—]?\s*/i, '').replace(/\s*(✓|✔|completed|current)$/i, '').slice(0, 80);
  }

  function detectStepper() {
    for (const host of U.deepQueryAll(document, STEPPER_SELECTOR)) {
      if (!U.isVisible(host)) continue;
      let items = Array.from(host.querySelectorAll(':scope [role="tab"]'));
      if (items.length < 2) items = Array.from(host.querySelectorAll(':scope > li, :scope > * > li'));
      if (items.length < 2) items = Array.from(host.children).filter((c) => /step|tab/i.test(c.className?.toString() || ''));
      if (items.length < 2 || items.length > 15) continue;
      const titles = items.map((i) => cleanStepTitle(i.textContent));
      if (titles.some((t) => !t || t.length > 60)) continue;
      const activeIndex = items.findIndex((i) => i.getAttribute('aria-selected') === 'true' || i.getAttribute('aria-current') === 'step' ||
        i.getAttribute('aria-current') === 'true' || /\b(active|current|is-active|selected)\b/i.test(i.className?.toString() || ''));
      return { titles, activeIndex };
    }
    return null;
  }

  function detectStepCounter() {
    const re = /\bstep\s*(\d+)\s*(?:of|\/)\s*(\d+)\s*(?:[—–\-:·|]\s*(.+))?/i;
    const nodes = U.deepQueryAll(document, 'p, span, div, h1, h2, h3, h4, small, li, legend, label, strong');
    let best = null;
    for (const node of nodes) {
      if (node.children.length > 3) continue;
      const text = U.cleanText(node.textContent);
      if (text.length > 120) continue;
      const m = re.exec(text);
      if (m && U.isVisible(node)) {
        if (!best || text.length < best.text.length) best = { text, current: Number(m[1]), total: Number(m[2]), title: m[3] ? cleanStepTitle(m[3]) : null };
      }
    }
    if (best) return best;
    const bar = U.deepQueryAll(document, '[role="progressbar"][aria-valuemax]').find(U.isVisible);
    if (bar) {
      const max = Number(bar.getAttribute('aria-valuemax'));
      const now = Number(bar.getAttribute('aria-valuenow'));
      if (max > 1 && max <= 20 && Number.isFinite(now)) return { current: now, total: max, title: null };
    }
    return null;
  }

  function detectStepIndicator() {
    const counter = detectStepCounter();
    const stepper = detectStepper();
    const total = Math.max(counter?.total || 0, stepper?.titles.length || 0) || null;
    const current = counter?.current || (stepper && stepper.activeIndex >= 0 ? stepper.activeIndex + 1 : null);
    const activeTitle = (stepper && stepper.activeIndex >= 0 ? stepper.titles[stepper.activeIndex] : null) || counter?.title || null;
    return { total, current, titles: stepper?.titles || [], activeTitle };
  }

  // ── Titles ──────────────────────────────────────────────────────────
  function formTitle() {
    for (const sel of ['h1', '[class*="form-title" i]', '[class*="page-title" i]', 'h2']) {
      const el = U.deepQueryAll(document, sel).find((e) => U.isVisible(e) && U.ownText(e));
      if (el) return U.ownText(el).slice(0, 120);
    }
    return U.cleanText(document.title).slice(0, 120) || location.hostname || 'Untitled form';
  }

  function stepTitle(fields, indicator, theFormTitle) {
    const title = rawStepTitle(fields, indicator, theFormTitle);
    // Drop decorative leading symbols ("✅ Review Complete").
    return title ? title.replace(/^[^\p{L}\p{N}]+/u, '').trim() || title : null;
  }

  function rawStepTitle(fields, indicator, theFormTitle) {
    if (indicator?.activeTitle) return indicator.activeTitle;
    const container = commonAncestor(fieldElements(fields));
    const headingSel = 'h1, h2, h3, h4, legend, [class*="step-title" i], [class*="section-title" i], [class*="title" i], [role="heading"]';
    const isUseful = (h) => {
      const text = U.ownText(h);
      return text && text !== theFormTitle && text.length < 100 && !/subtitle|subheading|description/i.test(h.className?.toString() || '') &&
        !h.querySelector('input, select, textarea') && U.isVisible(h);
    };
    if (container) {
      const inside = Array.from(container.querySelectorAll(headingSel)).find(isUseful);
      if (inside) return U.ownText(inside);
      // Nearest heading before the fields (e.g. a page section header).
      const before = U.deepQueryAll(document, headingSel).filter((h) => U.domOrderCompare(h, container) < 0 && isUseful(h));
      if (before.length) return U.ownText(before[before.length - 1]);
    } else {
      const any = U.deepQueryAll(document, headingSel).find(isUseful);
      if (any) return U.ownText(any);
    }
    return null;
  }

  // ── Barriers ────────────────────────────────────────────────────────
  const CAPTCHA_SELECTOR = 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], iframe[title*="captcha" i], .g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey], [class*="captcha" i], [id*="captcha" i]';

  function detectBarriers(fields) {
    const barriers = [];
    const captcha = U.deepQueryAll(document, CAPTCHA_SELECTOR).find((el) => !el.closest('.grecaptcha-badge') && U.isVisible(el));
    if (captcha) barriers.push({ type: 'captcha', message: 'A CAPTCHA is shown. PracticeMode never solves or bypasses CAPTCHAs — complete it yourself to continue.' });

    const password = (fields || []).some((f) => f.type === 'password');
    const signInButton = U.deepQueryAll(document, 'button, input[type="submit"], [role="button"]')
      .some((b) => U.isVisible(b) && /^(sign|log)\s*in\b/i.test(actionText(b).text));
    if (password && signInButton) barriers.push({ type: 'auth', message: 'This step asks you to sign in. PracticeMode does not sign in or bypass authentication.' });

    const headingText = U.deepQueryAll(document, 'h1, h2, h3, h4, legend, p')
      .filter((n) => U.isVisible(n) && n.textContent.length < 300)
      .map((n) => n.textContent).join(' ');
    if (/verify\s+your\s+identity|identity\s+verification|upload\s+(a\s+)?(photo\s+)?(of\s+your\s+)?(government\s+)?id\b/i.test(headingText)) {
      barriers.push({ type: 'identity_verification', message: 'This step requires identity verification, which PracticeMode never automates.' });
    }
    return barriers;
  }

  // ── Validation feedback ─────────────────────────────────────────────
  const ERROR_SELECTOR = '[role="alert"], [aria-live="assertive"], .error, .errors, .error-msg, .error-message, .field-error, .invalid-feedback, .validation-error, .validation-message, .form-error, .help-block.error, [class*="error" i], [class*="invalid" i], [id*="error" i]';

  /**
   * Visible validation messages, each linked to a field key when possible.
   * Returns { messages: string[], byKey: Map<fieldKey, message>, invalidKeys: Set }.
   */
  function validationFeedback(fields) {
    const byKey = new Map();
    const invalidKeys = new Set();
    const messages = [];
    const fieldContainers = (fields || []).map((f) => ({
      field: f,
      container: (f._proxy || f._el)?.closest?.('.field, .form-group, .form-field, [class*="field" i], [class*="form-row" i], fieldset, li') || null,
    }));

    for (const f of fields || []) {
      const el = f._el;
      if (el?.getAttribute?.('aria-invalid') === 'true' || PM.fieldPopulator.isNativelyInvalid(f)) invalidKeys.add(f._key);
      if (el?.validationMessage && el.willValidate && !el.validity?.valid) byKey.set(f._key, el.validationMessage);
    }

    for (const node of U.deepQueryAll(document, ERROR_SELECTOR)) {
      if (!U.isVisible(node) || node.matches('input, select, textarea, button, form, body, html')) continue;
      if (node.querySelector('input, select, textarea')) continue;
      const text = U.ownText(node);
      if (!text || text.length > 300) continue;
      if (messages.includes(text)) continue;
      messages.push(text);

      const describedOwner = (fields || []).find((f) => {
        const ids = `${f._el?.getAttribute?.('aria-describedby') || ''} ${f._el?.getAttribute?.('aria-errormessage') || ''}`.split(/\s+/);
        return node.id && ids.includes(node.id);
      });
      const containerOwner = describedOwner ? null : fieldContainers.find(({ container }) => container && container.contains(node))?.field;
      const owner = describedOwner || containerOwner;
      if (owner) {
        byKey.set(owner._key, text);
        invalidKeys.add(owner._key);
      }
    }
    return { messages, byKey, invalidKeys };
  }

  // ── Step identity ───────────────────────────────────────────────────
  function stepIdentity(fields, title) {
    const actions = findActions(fields).filter((a) => a.category !== 'other').map((a) => a.text).sort().join('|');
    return {
      path: `${location.pathname}${location.hash && location.hash.length < 40 ? location.hash : ''}`,
      title: title || '',
      keys: (fields || []).map((f) => f._key).sort(),
      actions,
    };
  }

  function jaccard(a, b) {
    const A = new Set(a);
    const B = new Set(b);
    if (!A.size && !B.size) return 1;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return inter / (A.size + B.size - inter);
  }

  /**
   * Whether two identities describe the same step. Revealing a conditional
   * question keeps most fields in place, so it is the same step; moving to a
   * new step replaces most of them.
   */
  function sameStep(a, b, threshold = 0.5) {
    if (!a || !b) return false;
    if (a.path !== b.path) return false;
    const j = jaccard(a.keys, b.keys);
    if (!a.keys.length && !b.keys.length) return a.title === b.title && a.actions === b.actions;
    if (a.title && b.title && a.title !== b.title && j < 0.8) return false;
    return j >= threshold;
  }

  PM.stepDetector = {
    findActions,
    summarize,
    classify,
    detectStepIndicator,
    formTitle,
    stepTitle,
    detectBarriers,
    validationFeedback,
    stepIdentity,
    sameStep,
    jaccard,
    commonAncestor,
    isDisabled,
  };
})();
