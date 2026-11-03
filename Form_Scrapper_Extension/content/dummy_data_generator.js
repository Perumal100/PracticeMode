/**
 * content/dummy_data_generator.js
 * Fictional, validation-compatible sample values for form fields.
 *
 * Independent of extraction and navigation: it only receives a plain field
 * descriptor and a context, and returns a value. It can be replaced or
 * disabled without touching the extraction engine.
 *
 *   generate(field, { attempt, environment, feedback })
 *     attempt      0 for the first try; higher values produce alternatives
 *     environment  'fixture' | 'production' (from the safety policy)
 *     feedback     validation message shown by the site for this field, if any
 *
 * Returns { value } or { value: null, requiresManual: true, reason, blocker }.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});
  const policy = PM.safetyPolicy;
  const sampler = PM.regexSampler;

  const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey'];
  const LAST_NAMES = ['Example', 'Sample', 'Demo', 'Placeholder', 'Testwell'];
  const PEOPLE = { first: FIRST_NAMES, last: LAST_NAMES };

  const TEXT_HINTS = [
    // [regex over label/name/autocomplete, value or (attempt) => value]
    [/given-name|first\s*name|fname|forename/i, (a) => PEOPLE.first[a % 5]],
    [/family-name|last\s*name|lname|surname/i, (a) => PEOPLE.last[a % 5]],
    [/additional-name|middle\s*(name|initial)/i, 'Q'],
    [/preferred\s*(first\s*)?name|nickname/i, 'Alex'],
    [/\bpronoun/i, 'they/them'],
    [/full\s*name|your\s*name|^name$|legal\s*name|\bname\b(?!.*(company|employer|school|business|organi[sz]ation|program|institution|reference))/i, (a) => `${PEOPLE.first[a % 5]} ${PEOPLE.last[a % 5]}`],
    [/username|user\s*name|login\s*id|handle/i, (a) => `alex_example${a ? a + 1 : ''}`],
    [/e-?mail/i, (a) => (a ? `alex.example${a}@example.com` : 'alex@example.com')],
    [/linkedin/i, 'https://www.linkedin.com/in/alex-example'],
    [/github/i, 'https://github.com/alex-example'],
    [/portfolio|website|personal\s*site|url|homepage|blog/i, 'https://example.com'],
    [/address-line2|address\s*(line\s*)?2|apt|apartment|suite|unit/i, 'Apt 4B'],
    [/street-address|address-line1|street|address\s*(line\s*)?1|mailing\s*address|^address$|home\s*address/i, '123 Main St'],
    [/address-level2|\bcity\b|town/i, 'New York'],
    [/address-level1|\bstate\b|province|region/i, 'NY'],
    [/postal-code|zip|postal|postcode/i, '10001'],
    [/country-name|\bcountry\b|nationality|citizenship/i, 'United States'],
    [/county/i, 'New York County'],
    [/organization-title|job\s*title|position|role|designation|occupation/i, 'Software Engineer'],
    [/organization|company|employer|business\s*name|organi[sz]ation/i, 'Example Corp'],
    [/school|university|college|institution|academy/i, 'State University'],
    [/major|field\s*of\s*study|discipline|concentration|program/i, 'Computer Science'],
    [/degree|qualification/i, "Bachelor's"],
    [/\bgpa\b|grade\s*point/i, '3.8'],
    [/how\s*did\s*you\s*hear|referr(al|ed)|source/i, 'Job board'],
    [/salary|compensation|pay\s*expectation/i, '60000'],
    [/notice\s*period/i, '2 weeks'],
    [/years?\s*of\s*experience|experience\s*\(years\)/i, '3'],
    [/reference/i, 'Jordan Sample'],
    [/skill/i, 'Communication, Teamwork'],
    [/language/i, 'English'],
    [/interest|hobb/i, 'Reading, Hiking'],
    [/promo|coupon|discount|referral\s*code/i, 'SAMPLE10'],
  ];

  const PARAGRAPH = 'This is fictional sample text written by PracticeMode to explore the form structure. It does not describe a real person.';

  function hayOf(field) {
    return [field.label, field.name, field.id, field.autocomplete, field.placeholder].filter(Boolean).join(' ');
  }

  function limits(field) {
    const v = field.validation || {};
    const num = (x) => (x === undefined || x === null || x === '' ? undefined : Number(x));
    return {
      minLength: num(v.minLength) || 0,
      maxLength: num(v.maxLength) || 0,
      min: v.min,
      max: v.max,
      step: v.step,
      pattern: v.pattern,
    };
  }

  function semanticText(field, attempt) {
    const hay = hayOf(field);
    for (const [re, value] of TEXT_HINTS) {
      if (re.test(hay)) return typeof value === 'function' ? value(attempt) : value;
    }
    return null;
  }

  function fitLength(value, { minLength, maxLength }) {
    let out = String(value);
    if (minLength && out.length < minLength) {
      const filler = ' sample text';
      while (out.length < minLength) out += filler;
      out = out.slice(0, Math.max(minLength, Math.min(out.length, maxLength || out.length)));
    }
    if (maxLength && out.length > maxLength) out = out.slice(0, maxLength).trimEnd() || out.slice(0, maxLength);
    return out;
  }

  // ── Dates ───────────────────────────────────────────────────────────
  function iso(d) {
    return d.toISOString().slice(0, 10);
  }

  function addDays(days) {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  function clampIso(value, min, max) {
    if (min && value < min) return min;
    if (max && value > max) return max;
    return value;
  }

  function preferredDate(field, feedback) {
    const hay = `${hayOf(field)} ${feedback || ''}`;
    if (/future|after\s+today|later\s+than\s+today|upcoming/i.test(feedback || '')) return iso(addDays(60));
    if (/past|before\s+today|earlier\s+than\s+today/i.test(feedback || '')) return '2020-01-15';
    if (/birth|dob|born|bday/i.test(hay)) return '1995-05-15';
    if (/anticipat|expected|availab|earliest|desired|move.?in|preferred\s*date/i.test(hay)) return iso(addDays(60));
    if (/graduat/i.test(hay)) return '2020-05-15';
    if (/end|until|through|to\s*date|last\s*employ/i.test(hay)) return '2022-12-31';
    if (/start|begin|from|since|hire/i.test(hay)) return '2019-01-15';
    return '2021-06-15';
  }

  function formatForPlaceholder(isoDate, placeholder) {
    const [y, m, d] = isoDate.split('-');
    const p = String(placeholder || '').toLowerCase();
    if (/dd[./-]mm[./-]yyyy/.test(p)) return `${d}/${m}/${y}`;
    if (/yyyy[./-]mm[./-]dd/.test(p)) return `${y}-${m}-${d}`;
    if (/mm[./-]yyyy/.test(p) || /month\s*\/\s*year/.test(p)) return `${m}/${y}`;
    if (/mm[./-]yy\b/.test(p)) return `${m}/${y.slice(2)}`;
    return `${m}/${d}/${y}`;
  }

  function looksLikeDateText(field) {
    return /\bdate\b|\bdob\b|birthday|mm\s*\/\s*dd|dd\s*\/\s*mm|yyyy|pick\s*date/i.test(hayOf(field));
  }

  // ── Numbers ─────────────────────────────────────────────────────────
  function numberValue(field, attempt) {
    const { min, max, step } = limits(field);
    const lo = min !== undefined && min !== '' && Number.isFinite(Number(min)) ? Number(min) : undefined;
    const hi = max !== undefined && max !== '' && Number.isFinite(Number(max)) ? Number(max) : undefined;
    const hay = hayOf(field);
    let preferred;
    if (/year/i.test(hay)) preferred = /expect|anticip|entry|start|future/i.test(hay) ? new Date().getFullYear() + 1 : 2020;
    else if (/\bage\b/i.test(hay)) preferred = 28;
    else if (/salary|income|compensation/i.test(hay)) preferred = 60000;
    else if (/gpa/i.test(hay)) preferred = 3.8;
    else if (/experience|years/i.test(hay)) preferred = 3;
    else if (/zip|postal/i.test(hay)) return '10001';
    else if (/phone|mobile/i.test(hay)) return '2125550100';
    else preferred = lo !== undefined && hi !== undefined ? (lo + hi) / 2 : lo !== undefined ? lo + 1 : hi !== undefined ? Math.min(hi, 5) : 5;
    let value = preferred + attempt;
    if (lo !== undefined && value < lo) value = lo;
    if (hi !== undefined && value > hi) value = hi;
    const stepNum = Number(step);
    if (step && step !== 'any' && Number.isFinite(stepNum) && stepNum > 0) {
      const base = lo ?? 0;
      value = base + Math.round((value - base) / stepNum) * stepNum;
      if (hi !== undefined && value > hi) value -= stepNum;
      const decimals = (String(step).split('.')[1] || '').length;
      return value.toFixed(decimals);
    }
    if (!Number.isInteger(value) && !/gpa/i.test(hay)) value = Math.round(value);
    return String(value);
  }

  // ── Choices ─────────────────────────────────────────────────────────
  function usableOptions(field) {
    return (field.options || []).filter((o) => !o.disabled && !o.isPlaceholder && String(o.value ?? o.label ?? '') !== '');
  }

  function chooseOption(field, attempt) {
    const options = usableOptions(field);
    if (!options.length) return null;
    const preferredText = semanticText({ ...field, placeholder: '' }, 0);
    if (preferredText && attempt === 0) {
      const match = options.find((o) => (o.label || '').toLowerCase() === preferredText.toLowerCase() || (o.value || '').toLowerCase() === preferredText.toLowerCase());
      if (match) return match;
    }
    // "Other" often reveals a mandatory free-text box; avoid it on the first try.
    const ordered = [...options.filter((o) => !/^other\b/i.test(o.label || '')), ...options.filter((o) => /^other\b/i.test(o.label || ''))];
    return ordered[attempt % ordered.length];
  }

  // ── Files (fixtures only) ───────────────────────────────────────────
  function sampleFile(field) {
    const accept = String(field.accept || '').toLowerCase();
    const minimalPdf = '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n';
    if (!accept || /pdf/.test(accept) || accept.includes('*')) {
      return { fileName: 'practicemode-sample.pdf', mimeType: 'application/pdf', text: minimalPdf };
    }
    if (/png|image/.test(accept)) {
      return { fileName: 'practicemode-sample.png', mimeType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' };
    }
    if (/txt|text\/plain/.test(accept)) return { fileName: 'practicemode-sample.txt', mimeType: 'text/plain', text: 'Fictional sample file from PracticeMode.' };
    return { fileName: 'practicemode-sample.pdf', mimeType: 'application/pdf', text: minimalPdf };
  }

  // ── Validation feedback refinement ──────────────────────────────────
  function refineWithFeedback(value, field, feedback) {
    if (!feedback || typeof value !== 'string') return value;
    let out = value;
    const f = feedback.toLowerCase();
    const atLeast = /at\s+least\s+(\d+)\s*(characters|chars|letters)/.exec(f) || /minimum\s+(of\s+)?(\d+)\s*char/.exec(f);
    if (atLeast) {
      const n = Number(atLeast[1] && /^\d+$/.test(atLeast[1]) ? atLeast[1] : atLeast[2]);
      while (out.length < n) out += 'x';
    }
    const atMost = /(no\s+more\s+than|at\s+most|maximum\s+of|up\s+to)\s+(\d+)\s*(characters|chars)/.exec(f);
    if (atMost) out = out.slice(0, Number(atMost[2]));
    if (/(number|digit|numeric)/.test(f) && !/only\s+(letters|alphabet)/.test(f) && !/\d/.test(out)) out += '7';
    if (/(upper\s*case|capital)/.test(f) && !/[A-Z]/.test(out)) out = out.charAt(0).toUpperCase() + out.slice(1) + (/[A-Z]/.test(out.charAt(0).toUpperCase()) ? '' : 'A');
    if (/lower\s*case/.test(f) && !/[a-z]/.test(out)) out += 'a';
    if (/(special\s*char|symbol|punctuation)/.test(f) && !/[^A-Za-z0-9\s]/.test(out)) out += '!';
    if (/(letters?\s+only|only\s+letters|alphabetic)/.test(f)) out = out.replace(/[^A-Za-z\s]/g, '') || 'Sample';
    if (/(no\s+spaces|without\s+spaces|cannot\s+contain\s+spaces)/.test(f)) out = out.replace(/\s+/g, '');
    if (/(alphanumeric|letters?\s*(and|,)\s*numbers)/.test(f)) out = out.replace(/[^A-Za-z0-9_]/g, '') || 'sample1';
    const digitsExact = /(\d+)[-\s]digit/.exec(f);
    if (digitsExact && /^\d*$/.test(out.replace(/\D/g, ''))) out = '1234567890123456'.slice(0, Number(digitsExact[1]));
    return out;
  }

  // ── Main entry ──────────────────────────────────────────────────────
  function manual(reason, blocker) {
    return { value: null, requiresManual: true, reason, blocker };
  }

  function generate(field, ctx = {}) {
    const attempt = ctx.attempt || 0;
    const environment = ctx.environment || 'production';
    const feedback = ctx.feedback || '';
    const label = field.label || field.name || 'this field';
    const type = field.type;
    const hay = hayOf(field);

    if (/one-time-code|verification\s*code|\botp\b|security\s*code\s*sent|captcha/i.test(hay)) {
      return manual(`"${label}" is a verification code. PracticeMode never fills verification or CAPTCHA fields.`, 'verification');
    }

    const sensitive = policy.sensitiveKind(field);
    if (sensitive) {
      if (environment === 'fixture') return { value: sensitive.testValue, designatedTestValue: true };
      return manual(`"${label}" looks identity-sensitive or financial (${sensitive.kind.replace(/_/g, ' ')}). Enter it yourself only if you choose to.`, 'sensitive');
    }

    if (type === 'file') {
      if (environment === 'fixture') return { value: sampleFile(field) };
      return manual(`"${label}" is a file upload. PracticeMode never uploads files to external sites — attach one yourself if you want to continue.`, 'file_upload');
    }

    if (type === 'password') {
      if (environment === 'fixture') return { value: attempt ? `SamplePass!${2025 + attempt}` : 'SamplePass!2025' };
      return manual(`"${label}" is a password field. PracticeMode does not create accounts on external sites.`, 'account_creation');
    }

    if (type === 'checkbox') {
      if (environment !== 'fixture' && policy.isAttestation(field)) {
        return manual(`"${label}" is a legal attestation or consent. Tick it yourself if you agree.`, 'attestation');
      }
      return { value: true };
    }

    if (['select', 'radio', 'button-group', 'checkbox-group'].includes(type)) {
      if (field.optionsSource === 'typeahead') {
        const typed = semanticText(field, attempt) || 'a';
        return { value: typed, typeahead: true };
      }
      const option = chooseOption(field, attempt);
      if (!option) return manual(`No selectable option was found for "${label}".`, 'no_options');
      return { value: option.value, optionLabel: option.label };
    }

    const lim = limits(field);
    let value;

    switch (type) {
      case 'email':
        value = semanticText({ label: 'email' }, attempt);
        break;
      case 'tel':
        value = attempt ? '(212) 555-0199' : '212-555-0100';
        break;
      case 'url':
        value = semanticText(field, attempt) || 'https://example.com';
        if (!/^https?:/.test(value)) value = 'https://example.com';
        break;
      case 'number':
      case 'range':
        value = numberValue(field, attempt);
        break;
      case 'date':
        value = clampIso(preferredDate(field, feedback), lim.min, lim.max);
        break;
      case 'datetime-local':
        value = `${clampIso(preferredDate(field, feedback), lim.min && lim.min.slice(0, 10), lim.max && lim.max.slice(0, 10))}T09:00`;
        break;
      case 'month':
        value = preferredDate(field, feedback).slice(0, 7);
        break;
      case 'week':
        value = '2021-W24';
        break;
      case 'time':
        value = '09:30';
        break;
      case 'color':
        value = '#4a90e2';
        break;
      case 'textarea':
      case 'richtext':
        value = fitLength(/cover\s*letter|statement|essay|why|motivation/i.test(hay)
          ? `${PARAGRAPH} I am interested in this opportunity to practise completing applications.`
          : PARAGRAPH, lim);
        break;
      default: {
        // text, search, and anything unrecognised
        if (looksLikeDateText(field)) {
          value = formatForPlaceholder(preferredDate(field, feedback), field.placeholder);
        } else if (/phone|mobile|cell|telephone|\btel\b/i.test(hay)) {
          value = attempt ? '(212) 555-0199' : '212-555-0100';
        } else {
          value = semanticText(field, attempt) ?? (attempt ? `Sample answer ${attempt + 1}` : 'Sample answer');
        }
      }
    }

    value = refineWithFeedback(String(value), field, feedback);

    if (lim.pattern) {
      const matched = sampler.generateMatching(lim.pattern, {
        minLength: lim.minLength,
        maxLength: lim.maxLength,
        preferred: [value, value.replace(/\s+/g, ''), value.replace(/[^0-9]/g, ''), value.replace(/[^A-Za-z0-9_]/g, '')],
        attempt,
      });
      if (matched === null) return manual(`Could not produce a value for "${label}" that matches its required format.`, 'pattern');
      return { value: matched };
    }

    if (['text', 'search', 'textarea', 'richtext', 'email', 'tel', 'url'].includes(type) || !type) {
      value = fitLength(value, lim);
    }
    return { value };
  }

  PM.dummyDataGenerator = { generate, refineWithFeedback, usableOptions };
})();
