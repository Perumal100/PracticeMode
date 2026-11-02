/**
 * Conditional branch discovery.
 *
 * A branch is recorded from the real fields exposed after selecting an option,
 * rather than from a type-only DOM diff. This lets the export include fields
 * that are not visible in the initial state (and their select options).
 */

window.PracticeMode = window.PracticeMode || {};

window.PracticeMode.conditionalTracker = (() => {
  const { sleep } = window.PracticeMode.utils;
  const { extractFields, sanitizeForExport } = window.PracticeMode.fieldExtractor;

  const PROBE_WAIT_MS = 350;
  const MAX_PROBE_FIELDS = 5;
  const MAX_OPTIONS_PER_FIELD = 8;

  function visibleFieldMap() {
    return new Map(extractFields().map(field => [field._fingerprint, field]));
  }

  function nonPlaceholderOptions(options) {
    return (options || []).filter(option =>
      option.value !== '' && !option.disabled && !/select|choose|pick|--|please/i.test(option.text || option.label || '')
    ).slice(0, MAX_OPTIONS_PER_FIELD);
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor?.set ? descriptor.set.call(el, value) : el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function selectRadio(name, value) {
    const radios = Array.from(document.querySelectorAll(`input[type="radio"]${name ? `[name="${CSS.escape(name)}"]` : ''}`));
    const chosen = radios.find(radio => radio.value === value);
    if (!chosen) return false;
    chosen.click();
    chosen.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function conditionDescriptor(field, option) {
    return {
      triggerField: field.label,
      triggerName: field.name,
      triggerValue: option.value,
      triggerLabel: option.text || option.label || option.value,
    };
  }

  async function probeField(field) {
    if (!field?._element || !['select', 'radio'].includes(field.type)) return [];
    const options = nonPlaceholderOptions(field.options);
    if (options.length < 2) return [];

    const baseline = visibleFieldMap();
    const originalValue = field.type === 'radio'
      ? document.querySelector(`input[type="radio"]${field.name ? `[name="${CSS.escape(field.name)}"]` : ''}:checked`)?.value || ''
      : field._element.value;
    const branches = [];

    for (const option of options) {
      try {
        if (field.type === 'radio') selectRadio(field.name, option.value);
        else setNativeValue(field._element, option.value);
        await sleep(PROBE_WAIT_MS);

        const now = visibleFieldMap();
        const revealed = [...now.entries()]
          .filter(([fingerprint]) => !baseline.has(fingerprint))
          .map(([, revealedField]) => ({
            ...sanitizeForExport([revealedField])[0],
            conditional: conditionDescriptor(field, option),
          }));

        if (revealed.length) branches.push({ ...conditionDescriptor(field, option), revealedFields: revealed });
      } catch (_) {
        // A widget may reject programmatic changes. Leave it unprobed and keep
        // the rest of the form extraction running.
      }
    }

    try {
      if (field.type === 'radio') {
        if (originalValue) selectRadio(field.name, originalValue);
        else document.querySelectorAll(`input[type="radio"]${field.name ? `[name="${CSS.escape(field.name)}"]` : ''}`).forEach(radio => { radio.checked = false; });
      } else {
        setNativeValue(field._element, originalValue);
      }
      await sleep(150);
    } catch (_) { /* best effort restoration */ }

    return branches;
  }

  async function discoverConditionals(fields) {
    const candidates = (fields || [])
      .filter(field => ['select', 'radio'].includes(field.type) && (field.options || []).length >= 2)
      .slice(0, MAX_PROBE_FIELDS);
    const results = [];
    for (const field of candidates) {
      const branches = await probeField(field);
      if (branches.length) results.push({ field: field.label, fieldType: field.type, branches });
    }
    return results;
  }

  function annotateWithConditionals(fields, conditionalResults) {
    const merged = new Map();
    for (const field of sanitizeForExport(fields)) merged.set(field._fingerprint || `${field.label}:${field.name}:${field.type}`, field);

    for (const result of conditionalResults || []) {
      for (const branch of result.branches || []) {
        for (const field of branch.revealedFields || []) {
          const key = field._fingerprint || `${field.label}:${field.name}:${field.type}`;
          const existing = merged.get(key);
          if (existing) {
            const dependencies = [...(existing.conditionalDependencies || []), field.conditional];
            merged.set(key, { ...existing, conditionalDependencies: dependencies });
          } else {
            merged.set(key, field);
          }
        }
      }
    }
    return [...merged.values()].map(field => {
      const clean = { ...field };
      delete clean._fingerprint;
      return clean;
    });
  }

  return { probeField, discoverConditionals, annotateWithConditionals };
})();
