/**
 * content/field_extractor.js  (v2 — robust, SPA-safe)
 * Extracts all visible form controls from the current page.
 * Works on native HTML forms, React/Angular/Vue SPAs, and shadow-less custom components.
 */

window.PracticeMode = window.PracticeMode || {};

window.PracticeMode.fieldExtractor = (() => {
  const { getLabel, isVisible, fieldFingerprint } = window.PracticeMode.utils;

  // ── Option extraction ──
  function extractOptions(selectEl) {
    return Array.from(selectEl.options).map(opt => ({
      value: opt.value,
      text: opt.text.trim(),
      selected: opt.selected,
      disabled: opt.disabled,
    }));
  }

  function extractRadioOptions(name) {
    const radios = Array.from(
      document.querySelectorAll(`input[type="radio"]${name ? `[name="${CSS.escape(name)}"]` : ''}`)
    ).filter(isVisible);
    return radios.map((r, index) => ({
      // Some component libraries leave value empty and encode identity in id.
      // Keep each choice distinct in the exported structure.
      value: r.value || r.id || String(index),
      label: getLabel(r),
      checked: r.checked,
    }));
  }

  function getGroupLabel(el) {
    const container = el.closest('fieldset, [role="radiogroup"], [data-field-path], .form-group, [class*="radio-group"]');
    if (!container) return '';
    const labels = Array.from(container.querySelectorAll('label'));
    const question = labels.find(label =>
      !label.contains(el) &&
      !label.querySelector('input, select, textarea') &&
      (label.className?.toString().toLowerCase().includes('question') ||
        label.className?.toString().toLowerCase().includes('heading') ||
        label.getAttribute('for') || labels.length > 1)
    );
    return question?.innerText?.trim() || '';
  }

  function hasRequiredMarker(el) {
    if (el.required || el.getAttribute('aria-required') === 'true') return true;
    const container = el.closest('[data-field-path], [data-field-entry-id], fieldset, .form-group, [class*="fieldEntry"]');
    return Boolean(container?.querySelector('[required], [aria-required="true"], [class*="required" i]'));
  }

  function getLabelledText(el) {
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const text = ids.map(id => document.getElementById(id)?.innerText?.trim()).filter(Boolean).join(' ');
    return text || getLabel(el);
  }

  // ARIA comboboxes are widely used in place of native <select> controls.  Their
  // options may be hidden until opened, so visibility is deliberately not used
  // when reading the listbox descendants.
  function extractCustomOptions(combobox) {
    const listboxId = combobox.getAttribute('aria-controls') || combobox.getAttribute('aria-owns');
    const listbox = listboxId ? document.getElementById(listboxId) : combobox.querySelector('[role="listbox"]');
    const scope = listbox || combobox.parentElement || combobox;
    return Array.from(scope.querySelectorAll('[role="option"]')).map((option, index) => ({
      value: option.getAttribute('data-value') || option.getAttribute('value') || option.dataset?.value || String(index),
      text: (option.innerText || option.textContent || '').trim(),
      selected: option.getAttribute('aria-selected') === 'true' || option.classList.contains('selected'),
      disabled: option.getAttribute('aria-disabled') === 'true' || option.hasAttribute('disabled'),
    })).filter(option => option.text);
  }

  function getValidation(el) {
    const v = {};
    if (el.required || el.getAttribute('aria-required') === 'true') v.required = true;
    if (el.minLength > 0) v.minLength = el.minLength;
    if (el.maxLength > 0 && el.maxLength < 524288) v.maxLength = el.maxLength;
    if (el.min !== undefined && el.min !== '') v.min = el.min;
    if (el.max !== undefined && el.max !== '') v.max = el.max;
    if (el.pattern) v.pattern = el.pattern;
    return Object.keys(v).length > 0 ? v : undefined;
  }

  function getHelpText(el) {
    const describedById = el.getAttribute('aria-describedby');
    if (describedById) {
      const texts = describedById.split(/\s+/).map(id => {
        const helper = document.getElementById(id);
        return helper ? helper.innerText.trim() : null;
      }).filter(Boolean);
      if (texts.length) return texts.join(' ');
    }
    const parent = el.closest('.form-group, .field-wrapper, fieldset, [class*="field"]');
    if (parent) {
      const hint = parent.querySelector('.hint, .help-text, [class*="hint"], [class*="help"], [class*="description"]');
      if (hint && !hint.contains(el)) return hint.innerText.trim().slice(0, 200);
    }
    return undefined;
  }

  // ── Single field extraction ──
  function extractSingleField(el, seenNames) {
    if (!isVisible(el)) return null;

    const tagName = el.tagName.toUpperCase();
    let type = tagName === 'SELECT' ? 'select'
      : tagName === 'TEXTAREA' ? 'textarea'
      : (el.type || 'text').toLowerCase();

    // Skip non-interactive types
    if (['hidden', 'submit', 'reset', 'button', 'image'].includes(type)) return null;

    const name = el.name || el.id || '';
    const label = (type === 'radio' && getGroupLabel(el)) || getLabel(el) || el.placeholder || `Unlabeled ${type}`;

    // De-duplicate radio groups by name
    if (type === 'radio' && name) {
      const key = `radio__${name}`;
      if (seenNames.has(key)) return null;
      seenNames.add(key);
    }

    // De-duplicate checkbox groups
    if (type === 'checkbox' && name) {
      const siblings = document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`);
      if (siblings.length > 1) {
        const key = `checkboxgroup__${name}`;
        if (seenNames.has(key)) return null;
        seenNames.add(key);
        type = 'checkbox-group';
      }
    }

    const field = {
      id: el.id || undefined,
      name: name || undefined,
      label: label.slice(0, 120),
      type,
      required: hasRequiredMarker(el),
      disabled: el.disabled || false,
      readOnly: el.readOnly || false,
    };

    // Type-specific enrichment
    if (type === 'select') {
      field.options = extractOptions(el);
      if (el.multiple) field.multiple = true;
    } else if (type === 'radio') {
      field.options = extractRadioOptions(name);
      field.required = Array.from(document.querySelectorAll(`input[type="radio"]${name ? `[name="${CSS.escape(name)}"]` : ''}`))
        .some(hasRequiredMarker);
    } else if (type === 'checkbox-group') {
      const checks = Array.from(
        document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`)
      ).filter(isVisible);
      field.options = checks.map(c => ({ value: c.value, label: getLabel(c), checked: c.checked }));
    } else if (type === 'file') {
      if (el.accept) field.accept = el.accept;
      if (el.multiple) field.multiple = true;
    }

    // Datalist support for search/text inputs
    if (el.getAttribute && el.getAttribute('list')) {
      const datalist = document.getElementById(el.getAttribute('list'));
      if (datalist) {
        field.options = Array.from(datalist.querySelectorAll('option')).map(opt => ({
          value: opt.value || opt.text,
          text: (opt.text || opt.value || '').trim(),
        }));
      }
    }

    const validation = getValidation(el);
    if (validation) field.validation = validation;
    const helpText = getHelpText(el);
    if (helpText) field.helpText = helpText;
    if (el.placeholder) field.placeholder = el.placeholder;

    // Keep live DOM reference for population (stripped before export)
    field._element = el;
    field._fingerprint = fieldFingerprint(field);

    return field;
  }

  function extractCustomCombobox(el, seenFingerprints) {
    if (!isVisible(el)) return null;
    const options = extractCustomOptions(el);
    // A role=combobox can be an autocomplete text input. Only treat it as a
    // select-like field when it exposes choices.
    if (!options.length) return null;

    const labelled = getLabelledText(el);
    const hiddenValue = el.parentElement?.querySelector('input[type="hidden"][name], input[type="hidden"][id]');
    const field = {
      id: el.id || hiddenValue?.id || undefined,
      name: hiddenValue?.name || el.getAttribute('name') || el.id || undefined,
      label: (labelled || el.getAttribute('aria-label') || 'Unlabeled select').slice(0, 120),
      type: 'select',
      custom: true,
      required: el.getAttribute('aria-required') === 'true' || hiddenValue?.getAttribute('aria-required') === 'true' || false,
      disabled: el.getAttribute('aria-disabled') === 'true',
      readOnly: false,
      options,
      _element: el,
      _valueElement: hiddenValue || undefined,
    };
    field._fingerprint = fieldFingerprint(field);
    if (seenFingerprints.has(field._fingerprint)) return null;
    return field;
  }

  // Ashby and similar application systems render Yes/No questions as two
  // buttons backed by a hidden checkbox. The buttons are the real control;
  // export one field with both choices instead of an unlabeled checkbox.
  function extractOptionButtonGroup(container, seenFingerprints) {
    const buttons = Array.from(container.querySelectorAll('button[data-option]'));
    if (buttons.length < 2) return null;

    const label = Array.from(container.querySelectorAll('label')).find(candidate =>
      !candidate.querySelector('input, select, textarea') && candidate.innerText.trim()
    )?.innerText.trim() || container.dataset.fieldPath || 'Unlabeled choice';
    const backingInput = container.querySelector('input[type="checkbox"], input[type="hidden"]');
    const field = {
      id: container.dataset.fieldPath || backingInput?.id || undefined,
      name: backingInput?.name || container.dataset.fieldPath || undefined,
      label: label.slice(0, 120),
      type: 'button-group',
      required: hasRequiredMarker(container),
      disabled: buttons.every(button => button.disabled || button.getAttribute('aria-disabled') === 'true'),
      readOnly: false,
      options: buttons.map(button => ({
        value: button.dataset.option,
        label: (button.innerText || button.textContent || '').trim(),
        checked: button.getAttribute('aria-pressed') === 'true',
        disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
      })),
      _element: container,
      _optionElements: buttons,
      _valueElement: backingInput || undefined,
    };
    field._fingerprint = fieldFingerprint(field);
    if (seenFingerprints.has(field._fingerprint)) return null;
    return field;
  }

  // ── Step title detection ──
  function detectStepTitle() {
    // Try common heading selectors in priority order
    const selectors = [
      '[class*="step-title"]', '[class*="section-title"]', '[class*="wizard-title"]',
      '[class*="form-title"]', 'h1', 'h2', 'legend',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && isVisible(el) && el.innerText.trim()) return el.innerText.trim().slice(0, 100);
    }
    return document.title.slice(0, 100) || 'Step';
  }

  function detectFormTitle() {
    const el = document.querySelector('h1, [class*="form-title"], [class*="page-title"]');
    return el && isVisible(el) ? el.innerText.trim().slice(0, 100) : (document.title || 'Form');
  }

  // ── Main extraction entry point ──
  function extractFields(container) {
    const root = container || document;
    const seenNames = new Set();
    const seenFingerprints = new Set();
    const fields = [];

    // Get all candidate elements
    let candidates;
    try {
      candidates = Array.from(root.querySelectorAll('input, select, textarea'));
    } catch (e) {
      return [];
    }

    for (const el of candidates) {
      try {
        // It is an implementation detail of a button group, not a standalone
        // field. The semantic group is added below.
        if (el.matches('input[type="checkbox"], input[type="hidden"]') && el.closest('[data-field-path]')?.querySelector('button[data-option]')) continue;
        const field = extractSingleField(el, seenNames);
        if (!field) continue;
        if (seenFingerprints.has(field._fingerprint)) continue;
        seenFingerprints.add(field._fingerprint);
        fields.push(field);
      } catch (e) { /* skip problematic elements */ }
    }

    for (const container of Array.from(root.querySelectorAll('[data-field-path]'))) {
      try {
        const field = extractOptionButtonGroup(container, seenFingerprints);
        if (!field) continue;
        seenFingerprints.add(field._fingerprint);
        fields.push(field);
      } catch (e) { /* skip malformed button group */ }
    }

    // Include select-like controls implemented with ARIA rather than native
    // elements. This also preserves every declared option for export.
    for (const el of Array.from(root.querySelectorAll('[role="combobox"]'))) {
      try {
        const field = extractCustomCombobox(el, seenFingerprints);
        if (!field) continue;
        seenFingerprints.add(field._fingerprint);
        fields.push(field);
      } catch (e) { /* skip malformed widgets */ }
    }

    return fields;
  }

  function sanitizeForExport(fields) {
    return (fields || []).map(f => {
      const clean = { ...f };
      delete clean._element;
      delete clean._valueElement;
      delete clean._optionElements;
      delete clean._fingerprint;
      return clean;
    });
  }

  function extractStep(stepNumber, url) {
    const rawFields = extractFields();
    const stepTitle = detectStepTitle();
    const formTitle = detectFormTitle();

    return {
      step: stepNumber,
      title: stepTitle,
      url: url || window.location.href,
      fields: sanitizeForExport(rawFields),
      sections: [],
      formTitle,
      _rawFields: rawFields, // kept for population — stripped before storage
    };
  }

  return { extractFields, extractStep, sanitizeForExport };
})();
