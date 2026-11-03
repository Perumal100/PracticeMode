/**
 * content/safety_policy.js
 * Safety and user-approval rules. Pure functions with no DOM access so the
 * popup, the service worker and the content scripts all apply the same rules.
 *
 *  - Local test fixtures (file:, localhost, *.localhost, *.test, the extension's
 *    own pages) may be filled and navigated automatically.
 *  - Every other origin is treated as a production website: filling fictional
 *    data or clicking Next requires explicit, per-origin user consent, because
 *    even intermediate steps can transmit data to the site.
 *  - Some actions are never automated anywhere (final submission, payment,
 *    account creation on production, CAPTCHA, identity verification).
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});

  const CONSENT_KEY = 'pm_consent_v1';
  const SETTINGS_KEY = 'pm_settings_v1';

  const DEFAULT_SETTINGS = Object.freeze({
    autoNavigate: true,       // "Enable Safe Auto-Navigation"
    exploreBranches: true,    // probe conditional questions on authorised origins
    showLauncher: true,       // on-page copilot launcher on pages with forms
    maxSteps: 25,
    maxValidationRetries: 2,
    backendUrl: 'http://localhost:8000', // PracticeMode server that receives imports (API-15)
  });

  function parse(urlString) {
    try { return new URL(urlString); } catch (_) { return null; }
  }

  function originOf(urlString) {
    const url = parse(urlString);
    if (!url) return '';
    if (url.protocol === 'file:') return 'file://';
    return url.origin;
  }

  /**
   * 'fixture'    – local or reserved-for-testing host; automation allowed.
   * 'production' – anything else; automation needs consent.
   * 'unsupported'– browser-internal pages where content scripts cannot run.
   */
  function classifyOrigin(urlString) {
    const url = parse(urlString);
    if (!url) return 'unsupported';
    if (['chrome:', 'edge:', 'about:', 'view-source:', 'devtools:'].includes(url.protocol)) return 'unsupported';
    if (url.protocol === 'chrome-extension:' || url.protocol === 'file:') return 'fixture';
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') return 'fixture';
    if (host.endsWith('.localhost') || host.endsWith('.test')) return 'fixture';
    if (url.protocol === 'chrome-webstore:' || /(^|\.)chromewebstore\.google\.com$/.test(host)) return 'unsupported';
    return 'production';
  }

  /** Whether automatic filling/navigation may run on this URL right now. */
  function autoNavigationAllowed(urlString, consentMap) {
    const kind = classifyOrigin(urlString);
    if (kind === 'fixture') return { allowed: true, kind, reason: 'Local test fixture' };
    if (kind === 'unsupported') return { allowed: false, kind, reason: 'This page cannot be automated.' };
    const origin = originOf(urlString);
    if (consentMap && consentMap[origin]) return { allowed: true, kind, reason: 'Approved by you for this site', origin };
    return {
      allowed: false,
      kind,
      origin,
      reason: 'External site: automatic navigation needs your approval.',
    };
  }

  const CONSENT_EXPLANATION =
    'Automatic navigation types fictional sample data into this site and clicks Next/Continue buttons. ' +
    'Even intermediate steps can send that data to the website and may create a draft record. ' +
    'PracticeMode never clicks Submit, Apply, Pay, or similar final actions, never uploads files, ' +
    'never fills identity or payment numbers, and never bypasses CAPTCHA or sign-in.';

  // Identity-sensitive or financial fields. On production sites these always
  // need manual input; on fixtures a designated, never-issued test value is used.
  const SENSITIVE_FIELD_RULES = [
    { kind: 'ssn', re: /\b(ssn|social\s*security|social\s*insurance|\bsin\b)/i, testValue: '000-12-3456' },
    { kind: 'tax_id', re: /\b(tax\s*id|tin\b|ein\b|itin\b|vat\s*(number|id))/i, testValue: '00-0000000' },
    { kind: 'passport', re: /passport/i, testValue: 'X00000000' },
    { kind: 'drivers_license', re: /driver'?s?\s*licen[cs]e|\bdl\s*(number|#)/i, testValue: 'D0000000' },
    { kind: 'national_id', re: /national\s*(id|identity|insurance)|aadhaar|\bnin\b/i, testValue: 'TEST000000' },
    { kind: 'card_number', re: /(credit|debit)\s*card|card\s*(number|no\b|#)|\bcc[-_\s]?(num|number)\b|cc-number/i, testValue: '4111111111111111' },
    { kind: 'card_cvc', re: /\b(cvv|cvc|csc|security\s*code)\b|cc-csc/i, testValue: '123' },
    { kind: 'card_expiry', re: /expir(y|ation)\s*(date)?|cc-exp/i, testValue: '12/30' },
    { kind: 'bank_account', re: /(bank\s*)?account\s*(number|no\b|#)|\biban\b|routing\s*(number|no\b)|sort\s*code|swift|\bbic\b/i, testValue: '000123456789' },
  ];

  function sensitiveKind(field) {
    const hay = `${field.label || ''} ${field.name || ''} ${field.id || ''} ${field.autocomplete || ''}`;
    // "Account number" on its own is ambiguous (could be a membership number),
    // but it is still treated as sensitive: safety beats coverage.
    for (const rule of SENSITIVE_FIELD_RULES) if (rule.re.test(hay)) return rule;
    return null;
  }

  // Checkboxes that are legal attestations. On production they are left for
  // the user to tick themselves.
  const ATTESTATION_RE = /\b(i\s+(certify|attest|agree|accept|acknowledge|consent|confirm|declare|authori[sz]e)|terms|privacy\s*policy|consent|attest|certif(y|ication)|signature|e-?sign)/i;

  function isAttestation(field) {
    return ATTESTATION_RE.test(`${field.label || ''} ${field.helpText || ''}`);
  }

  // Action labels that must never be clicked automatically.
  const FINAL_ACTION_RE = new RegExp(
    [
      '\\bsubmit\\b', '\\bfinish(ed)?\\b', '\\bapply\\b', '\\bapply\\s+now\\b', '\\bconfirm\\b',
      '\\bpay\\b', '\\bpay\\s+now\\b', '\\bpayment\\b', '\\bpurchase\\b', '\\bplace\\s+(my\\s+)?order\\b',
      '\\bbuy\\b', '\\bcheckout\\b', '\\bcheck\\s*out\\b', '\\bbook\\b', '\\breserve\\b', '\\bdonate\\b',
      '\\bregister\\b', '\\bsign\\s*up\\b', '\\bcreate\\s+(my\\s+)?(account|profile)\\b', '\\bsend\\b',
      '\\bcomplete\\b', '\\bfinali[sz]e\\b', '\\bdone\\b', '\\bauthori[sz]e\\b', '\\bsign\\s+and\\b',
      '\\bagree\\s+and\\b', '\\bdelete\\b', '\\bwithdraw\\b', '\\bcancel\\s+(my\\s+)?(application|order|subscription)\\b',
    ].join('|'),
    'i'
  );

  PM.safetyPolicy = {
    CONSENT_KEY,
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
    CONSENT_EXPLANATION,
    originOf,
    classifyOrigin,
    autoNavigationAllowed,
    sensitiveKind,
    isAttestation,
    FINAL_ACTION_RE,
  };
})();
