/**
 * content/field_extractor.js
 * Extracts the structure of every visible form control on the page.
 *
 * Fields are returned in document order (including open shadow roots) and
 * cover native inputs, selects (with every option and optgroup), textareas,
 * radio and checkbox groups, datalists, ARIA comboboxes / listboxes /
 * radiogroups / checkboxes / switches, contenteditable text boxes and
 * button-style choice groups.
 *
 * Only structure is extracted. Current values typed by a person are never
 * read; for options only the page's declared defaults are recorded.
 *
 * Each internal field keeps `_el` (live DOM reference) and `_key` (stable
 * identity) for population and deduplication. `toExport()` strips them.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});
  const U = PM.utils;
  const harvester = PM.optionHarvester;

  const CONTROL_SELECTOR = [
    'input', 'select', 'textarea',
    '[contenteditable=""]', '[contenteditable="true"]', '[role="textbox"]',
    '[role="combobox"]', '[aria-haspopup="listbox"]',
    '[role="radiogroup"]', '[role="radio"]', '[role="checkbox"]', '[role="switch"]',
    'button[data-option]',
  ].join(', ');

  const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'reset', 'button', 'image']);
  const PLACEHOLDER_OPTION_RE = /^(-+|select|choose|pick|please\s+(select|choose)|--)/i;
  const LABELISH = 'label, legend, h1, h2, h3, h4, h5, h6, p, span, div, strong, b, dt, th, td, [role="heading"]';
  const INLINE_TAGS = new Set(['SPAN', 'STRONG', 'B', 'I', 'EM', 'SMALL', 'SUP', 'SUB', 'ABBR', 'A', 'BR', 'CODE', 'MARK', 'U']);
  const HEADINGISH = 'h2, h3, h4, h5, h6, legend, [role="heading"], [class*="section-title" i], [class*="section-header" i], [class*="sectionTitle"], [class*="section-label" i], [class*="branch-label" i], [class*="group-title" i]';
  const CAPTCHA_RE = /captcha|robot|recaptcha|hcaptcha|turnstile/i;

  // ── Small helpers ───────────────────────────────────────────────────
  function isControl(node) {
    return node.matches?.(CONTROL_SELECTOR) && !(node.matches('input') && SKIP_INPUT_TYPES.has((node.type || '').toLowerCase()));
  }

  // Climbs out of elements and into a shadow root (whose top-level children
  // have no parentElement), but never past it.
  function parentOf(node) {
    if (node.parentElement) return node.parentElement;
    const parent = node.parentNode;
    return parent && parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? parent : null;
  }

  function hasInlineChildrenOnly(el) {
    return Array.from(el.children).every((c) => INLINE_TAGS.has(c.tagName) && !c.querySelector('input, select, textarea, [role="combobox"]'));
  }

  function humanize(name) {
    return U.cleanText(String(name || '')
      .replace(/^_+|_+$/g, '')
      .replace(/[_\-.[\]]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2'))
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  function looksMachineGenerated(name) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-|^[a-z0-9]{20,}$/i.test(String(name || ''));
  }

  function textFromIds(el, attr) {
    // Listbox buttons often list themselves ("label button") to announce the
    // current value; that value is not part of the question.
    const ids = (el.getAttribute(attr) || '').split(/\s+/).filter((id) => id && id !== el.id);
    return U.cleanText(ids.map((id) => U.ownText(U.byIdInScope(el, id))).filter(Boolean).join(' '));
  }

  // ── Label discovery ─────────────────────────────────────────────────
  /**
   * Find the closest label-like text that precedes `anchor` inside a
   * container that holds no other field. `group` is the set of elements that
   * belong to the field being labelled (radio members, combobox parts...).
   */
  function findContainerLabel(anchor, group) {
    const groupSet = new Set(group || [anchor]);
    const belongsToGroup = (node) => [...groupSet].some((g) => g === node || g.contains(node) || node.contains(g));
    let node = parentOf(anchor);
    for (let depth = 0; node && depth < 6 && node !== document.body; depth++, node = parentOf(node)) {
      const others = Array.from(node.querySelectorAll(CONTROL_SELECTOR)).filter((c) => isControl(c) && !belongsToGroup(c) && !U.isOwnUi(c));
      const preceding = others.filter((c) => U.domOrderCompare(c, anchor) < 0);
      const lastPrecedingControl = preceding[preceding.length - 1];
      const candidates = Array.from(node.querySelectorAll(LABELISH)).filter((cand) => {
        if (belongsToGroup(cand) || cand.contains(anchor)) return false;
        if (U.domOrderCompare(cand, anchor) >= 0) return false;
        if (lastPrecedingControl && U.domOrderCompare(cand, lastPrecedingControl) <= 0) return false;
        if (cand.querySelector('input, select, textarea, [role="combobox"], [role="radio"], button')) return false;
        if (cand.tagName === 'LABEL' && cand.htmlFor) {
          const target = U.byIdInScope(cand, cand.htmlFor);
          if (target && !belongsToGroup(target)) return false;
        }
        if (!hasInlineChildrenOnly(cand)) return false;
        const text = U.ownText(cand);
        return text.length > 0 && text.length <= 250 && U.isVisible(cand);
      });
      if (candidates.length) {
        // Prefer an explicit <label>/<legend> over generic text.
        const explicit = candidates.filter((c) => /^(LABEL|LEGEND)$/.test(c.tagName) || /label|question|title|prompt/i.test(c.className?.toString() || ''));
        const chosen = (explicit.length ? explicit : candidates)[(explicit.length ? explicit : candidates).length - 1];
        return { text: U.ownText(chosen), el: chosen, container: node };
      }
      if (others.length) break; // the next level up belongs to other fields too
    }
    return null;
  }

  function labelForControl(el) {
    const viaIds = textFromIds(el, 'aria-labelledby');
    if (viaIds) return { text: viaIds, el: U.byIdInScope(el, (el.getAttribute('aria-labelledby') || '').split(/\s+/)[0]) };
    const aria = el.getAttribute('aria-label');
    if (aria && U.cleanText(aria)) return { text: U.cleanText(aria), el: null };
    const labels = Array.from(el.labels || []).filter((l) => !U.isOwnUi(l));
    if (labels.length) {
      const text = U.cleanText(labels.map((l) => U.ownText(l)).join(' '));
      if (text) return { text, el: labels[0] };
    }
    const contextual = findContainerLabel(el, [el]);
    if (contextual) return contextual;
    if (el.title) return { text: U.cleanText(el.title), el: null };
    if (el.placeholder) return { text: U.cleanText(el.placeholder), el: null, fromPlaceholder: true };
    const name = el.getAttribute('name') || el.id;
    if (name && !looksMachineGenerated(name)) return { text: humanize(name), el: null, fromName: true };
    return { text: '', el: null };
  }

  function labelForGroup(members, container) {
    const first = members[0];
    const fieldset = first.closest('fieldset');
    if (fieldset && members.every((m) => fieldset.contains(m))) {
      const legend = fieldset.querySelector(':scope > legend');
      const othersInFieldset = Array.from(fieldset.querySelectorAll(CONTROL_SELECTOR)).filter((c) => isControl(c) && !members.includes(c));
      if (legend && othersInFieldset.length === 0) return { text: U.ownText(legend), el: legend };
    }
    if (container) {
      const viaIds = textFromIds(container, 'aria-labelledby');
      if (viaIds) return { text: viaIds, el: null };
      const aria = container.getAttribute?.('aria-label');
      if (aria) return { text: U.cleanText(aria), el: null };
    }
    const optionLabels = new Set(members.flatMap((m) => Array.from(m.labels || [])));
    const contextual = findContainerLabel(first, [...members, ...optionLabels, ...(container ? [container] : [])]);
    if (contextual) return contextual;
    const name = first.getAttribute('name');
    if (name && !looksMachineGenerated(name)) return { text: humanize(name), el: null, fromName: true };
    return { text: '', el: null };
  }

  function optionLabelFor(input) {
    const labels = Array.from(input.labels || []);
    if (labels.length) return U.ownText(labels[0]) || U.cleanText(labels[0].textContent);
    const aria = input.getAttribute('aria-label') || textFromIds(input, 'aria-labelledby');
    if (aria) return U.cleanText(aria);
    let sib = input.nextSibling;
    while (sib && sib.nodeType === Node.TEXT_NODE && !sib.textContent.trim()) sib = sib.nextSibling;
    if (sib) return U.cleanText(sib.nodeType === Node.TEXT_NODE ? sib.textContent : U.ownText(sib));
    return input.value || '';
  }

  // ── Metadata ────────────────────────────────────────────────────────
  function validationOf(el) {
    const v = {};
    if (el.minLength > 0) v.minLength = el.minLength;
    if (el.maxLength > 0 && el.maxLength < 524288) v.maxLength = el.maxLength;
    if (el.getAttribute?.('min')) v.min = el.getAttribute('min');
    if (el.getAttribute?.('max')) v.max = el.getAttribute('max');
    const step = el.getAttribute?.('step');
    if (step && step !== '1') v.step = step;
    if (el.getAttribute?.('pattern')) v.pattern = el.getAttribute('pattern');
    const type = (el.type || '').toLowerCase();
    if (type === 'email' || type === 'url') v.format = type;
    if (el.getAttribute?.('inputmode')) v.inputMode = el.getAttribute('inputmode');
    if (el.getAttribute?.('accept')) v.accept = el.getAttribute('accept');
    return Object.keys(v).length ? v : undefined;
  }

  function helpTextFor(el, labelInfo) {
    const described = textFromIds(el, 'aria-describedby');
    if (described && !/error|invalid|required\.?$/i.test(described)) return described.slice(0, 300);
    const container = labelInfo?.container || el.closest('.form-group, .field, [class*="field" i], fieldset');
    if (!container) return undefined;
    const hint = Array.from(container.querySelectorAll('.hint, .help, .help-text, .helper-text, small, [class*="hint" i], [class*="help" i], [class*="description" i], [class*="helper" i], [class*="instruction" i]'))
      .find((node) => !node.contains(el) && !node.querySelector('input, select, textarea') && !/error|invalid/i.test(node.className?.toString() || '') && U.isVisible(node));
    const text = hint ? U.ownText(hint) : '';
    return text ? text.slice(0, 300) : undefined;
  }

  function sectionFor(el, fieldLabel) {
    const fieldset = el.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector(':scope > legend');
      const text = legend ? U.ownText(legend) : '';
      const controls = Array.from(fieldset.querySelectorAll(CONTROL_SELECTOR)).filter(isControl);
      if (text && text !== fieldLabel && controls.length > 1) return text;
    }
    let node = el.parentElement;
    for (let depth = 0; node && depth < 8 && node !== document.body; depth++, node = node.parentElement) {
      const headings = Array.from(node.querySelectorAll(HEADINGISH)).filter((h) =>
        !h.contains(el) && U.domOrderCompare(h, el) < 0 && !h.querySelector('input, select, textarea') && U.isVisible(h));
      if (headings.length) {
        const text = U.ownText(headings[headings.length - 1]);
        if (text && text !== fieldLabel && text.length < 120) return text;
      }
    }
    return undefined;
  }

  function isRequired(el, labelInfo, label) {
    if (el.required || el.getAttribute?.('aria-required') === 'true') return true;
    if (label?.hadRequiredMarker) return true;
    const lab = labelInfo?.el;
    if (lab && (/\brequired\b/i.test(lab.className?.toString() || '') || lab.querySelector?.('[class*="required" i], abbr[title*="required" i]'))) return true;
    return false;
  }

  function finalizeLabel(labelInfo, fallback) {
    const normalized = U.normalizeLabel(labelInfo.text || '');
    return {
      text: (normalized.text || fallback || '').slice(0, 200),
      hadRequiredMarker: normalized.hadRequiredMarker,
    };
  }

  function keyOf(field) {
    return [field.type, field.name || '', field.id || '', field.label].join('|').toLowerCase();
  }

  // ── Builders per control kind ───────────────────────────────────────
  function buildNative(el, consumed) {
    const tag = el.tagName;
    let type = tag === 'SELECT' ? 'select' : tag === 'TEXTAREA' ? 'textarea' : (el.type || 'text').toLowerCase();
    if (SKIP_INPUT_TYPES.has(type)) return null;

    // Inputs that are parts of a custom combobox are handled by that combobox.
    const comboHost = el.closest('[role="combobox"]');
    if (comboHost && comboHost !== el) return null;

    if (type === 'radio') return buildRadioGroup(el, consumed);
    if (type === 'checkbox') {
      const group = checkboxGroupMembers(el);
      if (group.length > 1) return buildCheckboxGroup(group, consumed);
    }

    let visibleProxy = null;
    if (tag === 'SELECT' && !U.isVisible(el)) {
      visibleProxy = findSelectProxy(el);
      if (!visibleProxy) return null;
      U.deepQueryAll(visibleProxy, CONTROL_SELECTOR).forEach((n) => consumed.add(n));
      consumed.add(visibleProxy);
    } else if (!U.isEffectivelyVisible(el)) {
      return null;
    }

    const labelInfo = labelForControl(el);
    const label = finalizeLabel(labelInfo, type === 'checkbox' ? optionLabelFor(el) : `Unlabeled ${type}`);
    const field = {
      label: label.text,
      name: el.getAttribute('name') || undefined,
      id: el.id || undefined,
      type,
      required: isRequired(el, labelInfo, label),
      disabled: el.disabled || undefined,
      readOnly: el.readOnly || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      autocomplete: el.getAttribute('autocomplete') && el.getAttribute('autocomplete') !== 'off' ? el.getAttribute('autocomplete') : undefined,
      validation: validationOf(el),
      helpText: helpTextFor(el, labelInfo),
      _el: el,
      _proxy: visibleProxy || undefined,
      _kind: 'native',
    };

    if (type === 'select') {
      field.options = selectOptions(el);
      field.optionsSource = 'native';
      if (el.multiple) field.multiple = true;
      if (visibleProxy) field.widget = 'enhanced-select';
    } else if (type === 'file') {
      field.accept = el.getAttribute('accept') || undefined;
      if (el.multiple) field.multiple = true;
    } else if (type === 'checkbox') {
      field.defaultChecked = el.defaultChecked || undefined;
    }

    const listId = el.getAttribute('list');
    if (listId) {
      const datalist = U.byIdInScope(el, listId);
      if (datalist) {
        field.options = Array.from(datalist.querySelectorAll('option')).map((o) => ({
          value: o.value || U.cleanText(o.textContent),
          label: U.cleanText(o.label || o.textContent || o.value),
        }));
        field.optionsSource = 'datalist';
        field.allowsFreeText = true;
      }
    }
    return field;
  }

  function selectOptions(select) {
    return Array.from(select.options).map((o, index) => {
      const group = o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement : null;
      const label = U.cleanText(o.label || o.textContent);
      const option = { value: o.value, label };
      if (group) option.group = group.label;
      if (o.disabled || group?.disabled) option.disabled = true;
      if (index === 0 && (o.value === '' || PLACEHOLDER_OPTION_RE.test(label))) option.isPlaceholder = true;
      else if (o.value === '' && !label) option.isPlaceholder = true;
      if (o.defaultSelected && !option.isPlaceholder) option.defaultSelected = true;
      return option;
    });
  }

  function findSelectProxy(select) {
    let node = select.parentElement;
    for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
      const proxy = Array.from(node.querySelectorAll('[role="combobox"], .select2-container, .chosen-container, [class*="selectize"], [aria-haspopup="listbox"]'))
        .find((p) => !p.contains(select) && U.isVisible(p));
      if (proxy) return proxy;
    }
    return null;
  }

  function scopeRoot(el) {
    return el.form || el.closest('form') || el.getRootNode();
  }

  function radioGroupMembers(el) {
    const name = el.getAttribute('name');
    if (name) {
      const root = scopeRoot(el);
      return Array.from(root.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`));
    }
    const container = el.closest('fieldset, [role="radiogroup"], [class*="radio-group" i], [class*="radiogroup" i]') || el.parentElement?.parentElement;
    return Array.from(container?.querySelectorAll('input[type="radio"]:not([name])') || [el]);
  }

  function checkboxGroupMembers(el) {
    const name = el.getAttribute('name');
    if (!name) return [el];
    return Array.from(scopeRoot(el).querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`));
  }

  function buildRadioGroup(el, consumed) {
    const members = radioGroupMembers(el);
    members.forEach((m) => consumed.add(m));
    if (!members.some(U.isEffectivelyVisible)) return null;
    const container = el.closest('[role="radiogroup"]');
    const labelInfo = labelForGroup(members, container);
    const label = finalizeLabel(labelInfo, 'Unlabeled choice');
    return {
      label: label.text,
      name: el.getAttribute('name') || undefined,
      id: container?.id || undefined,
      type: 'radio',
      required: members.some((m) => m.required) || container?.getAttribute('aria-required') === 'true' || isRequired(el, labelInfo, label),
      disabled: members.every((m) => m.disabled) || undefined,
      options: members.map((m) => ({
        value: m.value && m.value !== 'on' ? m.value : optionLabelFor(m) || m.id,
        label: optionLabelFor(m) || m.value,
        disabled: m.disabled || undefined,
        defaultSelected: m.defaultChecked || undefined,
      })),
      optionsSource: 'native',
      helpText: helpTextFor(el, labelInfo),
      _el: el,
      _optionEls: members,
      _kind: 'native',
    };
  }

  function buildCheckboxGroup(members, consumed) {
    members.forEach((m) => consumed.add(m));
    if (!members.some(U.isEffectivelyVisible)) return null;
    const labelInfo = labelForGroup(members, members[0].closest('[role="group"]'));
    const label = finalizeLabel(labelInfo, 'Unlabeled checkboxes');
    return {
      label: label.text,
      name: members[0].getAttribute('name') || undefined,
      type: 'checkbox-group',
      multiple: true,
      required: members.some((m) => m.required) || label.hadRequiredMarker || undefined,
      options: members.map((m) => ({
        value: m.value && m.value !== 'on' ? m.value : optionLabelFor(m),
        label: optionLabelFor(m) || m.value,
        disabled: m.disabled || undefined,
        defaultSelected: m.defaultChecked || undefined,
      })),
      optionsSource: 'native',
      helpText: helpTextFor(members[0], labelInfo),
      _el: members[0],
      _optionEls: members,
      _kind: 'native',
    };
  }

  function buildAriaRadioGroup(group, consumed) {
    const radios = Array.from(group.querySelectorAll('[role="radio"]'));
    radios.forEach((r) => consumed.add(r));
    U.deepQueryAll(group, CONTROL_SELECTOR).forEach((n) => consumed.add(n));
    if (!radios.length || !U.isVisible(group)) return null;
    const labelInfo = labelForGroup(radios, group);
    const label = finalizeLabel(labelInfo, 'Unlabeled choice');
    return {
      label: label.text,
      id: group.id || undefined,
      type: 'radio',
      required: group.getAttribute('aria-required') === 'true' || label.hadRequiredMarker || undefined,
      options: radios.map((r) => ({
        value: r.getAttribute('data-value') || r.getAttribute('value') || U.cleanText(r.getAttribute('aria-label') || r.textContent),
        label: U.cleanText(r.getAttribute('aria-label') || r.textContent),
        disabled: r.getAttribute('aria-disabled') === 'true' || undefined,
      })),
      optionsSource: 'aria',
      widget: 'aria-radiogroup',
      _el: group,
      _optionEls: radios,
      _kind: 'aria-radio',
    };
  }

  function buildAriaToggle(el, consumed) {
    consumed.add(el);
    if (!U.isVisible(el)) return null;
    const hay = `${el.className} ${el.getAttribute('aria-label') || ''} ${el.id}`;
    if (CAPTCHA_RE.test(hay)) return null;
    const labelInfo = labelForControl(el);
    const label = finalizeLabel(labelInfo.text ? labelInfo : { text: U.ownText(el) }, 'Unlabeled checkbox');
    return {
      label: label.text,
      id: el.id || undefined,
      type: 'checkbox',
      required: el.getAttribute('aria-required') === 'true' || label.hadRequiredMarker || undefined,
      widget: el.getAttribute('role') === 'switch' ? 'aria-switch' : 'aria-checkbox',
      _el: el,
      _kind: 'aria-toggle',
    };
  }

  function buildButtonGroup(button, consumed) {
    const container = button.closest('[data-field-path]') || button.parentElement;
    const buttons = Array.from(container.querySelectorAll('button[data-option]'));
    buttons.forEach((b) => consumed.add(b));
    container.querySelectorAll('input').forEach((i) => consumed.add(i));
    if (buttons.length < 2 || !buttons.some(U.isVisible)) return null;
    const labelInfo = labelForGroup(buttons, container);
    const label = finalizeLabel(labelInfo.text ? labelInfo : { text: container.dataset?.fieldPath || '' }, 'Unlabeled choice');
    const backing = container.querySelector('input[type="checkbox"], input[type="hidden"]');
    return {
      label: label.text,
      name: backing?.getAttribute('name') || container.dataset?.fieldPath || undefined,
      type: 'button-group',
      required: label.hadRequiredMarker || Boolean(container.querySelector('[required], [aria-required="true"]')) || undefined,
      options: buttons.map((b) => ({
        value: b.dataset.option,
        label: U.cleanText(b.textContent),
        disabled: b.disabled || b.getAttribute('aria-disabled') === 'true' || undefined,
      })),
      optionsSource: 'native',
      _el: container,
      _optionEls: buttons,
      _kind: 'button-group',
    };
  }

  function buildCustomSelect(el, consumed) {
    // Treat the outermost combobox-like element as the field.
    U.deepQueryAll(el, CONTROL_SELECTOR).forEach((n) => consumed.add(n));
    consumed.add(el);
    if (!U.isVisible(el)) return null;
    const hay = `${el.className} ${el.getAttribute('aria-label') || ''}`;
    if (CAPTCHA_RE.test(hay)) return null;

    const inner = el.querySelector('[aria-haspopup="listbox"], input[role="combobox"], input') || el;
    let labelInfo = labelForControl(el);
    if (!labelInfo.text || labelInfo.fromPlaceholder || labelInfo.fromName) {
      const fromInner = inner !== el ? labelForControl(inner) : null;
      if (fromInner?.text && !fromInner.fromPlaceholder) labelInfo = fromInner;
    }
    const label = finalizeLabel(labelInfo, 'Unlabeled dropdown');
    const cached = harvester.getCached(el);
    const present = cached ? null : harvester.readPresentOptions(el);
    const options = cached?.options?.length ? cached.options : present || [];
    const source = cached?.source || (options.length ? 'aria-listbox' : 'unharvested');
    const backing = el.querySelector('input[type="hidden"][name]') || el.parentElement?.querySelector(':scope > input[type="hidden"][name]');
    const autocomplete = el.getAttribute('aria-autocomplete') || inner.getAttribute?.('aria-autocomplete');

    const field = {
      label: label.text,
      name: backing?.getAttribute('name') || el.getAttribute('name') || inner.getAttribute?.('name') || undefined,
      id: el.id || inner.id || undefined,
      type: 'select',
      required: el.getAttribute('aria-required') === 'true' || inner.getAttribute?.('aria-required') === 'true' ||
        backing?.getAttribute('aria-required') === 'true' || backing?.required || isRequired(inner, labelInfo, label) || undefined,
      disabled: el.getAttribute('aria-disabled') === 'true' || inner.disabled || undefined,
      options: options.map((o) => ({ ...o })),
      optionsSource: options.length ? source : (source === 'typeahead' ? 'typeahead' : 'unharvested'),
      optionsComplete: cached ? cached.complete : options.length > 0,
      widget: 'custom-select',
      helpText: helpTextFor(el, labelInfo),
      _el: el,
      _valueEl: backing || undefined,
      _kind: 'custom-select',
    };
    if (autocomplete) field.allowsFreeText = autocomplete !== 'none';
    if (el.getAttribute('aria-multiselectable') === 'true' || el.querySelector('[aria-multiselectable="true"]')) field.multiple = true;
    return field;
  }

  function buildRichText(el, consumed) {
    consumed.add(el);
    if (el.closest('[role="combobox"]') || !U.isVisible(el)) return null;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return null;
    const labelInfo = labelForControl(el);
    const label = finalizeLabel(labelInfo, 'Unlabeled text');
    return {
      label: label.text,
      id: el.id || undefined,
      type: 'richtext',
      required: el.getAttribute('aria-required') === 'true' || label.hadRequiredMarker || undefined,
      helpText: helpTextFor(el, labelInfo),
      _el: el,
      _kind: 'richtext',
    };
  }

  // ── Main entry ──────────────────────────────────────────────────────
  /**
   * Extract all visible fields, in document order. Synchronous: custom
   * dropdown options are taken from the harvester cache (fill it first with
   * `harvestOptions()` for complete option lists).
   */
  function extractFields(root = document) {
    const consumed = new WeakSet();
    const fields = [];
    const candidates = U.deepQueryAll(root, CONTROL_SELECTOR);

    for (const el of candidates) {
      if (consumed.has(el)) continue;
      let field = null;
      try {
        const role = el.getAttribute('role');
        if (el.matches('button[data-option]')) field = buildButtonGroup(el, consumed);
        else if (role === 'radiogroup') field = buildAriaRadioGroup(el, consumed);
        else if (role === 'radio') {
          const host = el.parentElement;
          field = host ? buildAriaRadioGroup(host, consumed) : null;
        } else if (role === 'checkbox' || role === 'switch') {
          field = el.matches('input') ? buildNative(el, consumed) : buildAriaToggle(el, consumed);
        } else if (role === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') {
          field = el.tagName === 'SELECT' ? buildNative(el, consumed) : buildCustomSelect(el, consumed);
        } else if (el.matches('input, select, textarea')) {
          // Backing inputs of button groups are represented by the group.
          if (el.matches('input[type="checkbox"], input[type="hidden"]') && el.closest('[data-field-path]')?.querySelector('button[data-option]')) continue;
          field = buildNative(el, consumed);
        } else if (el.isContentEditable || role === 'textbox') {
          field = buildRichText(el, consumed);
        }
      } catch (e) {
        field = null;
      }
      consumed.add(el);
      if (!field) continue;
      field.section = sectionFor(field._proxy || field._el, field.label);
      field._key = keyOf(field);
      fields.push(field);
    }

    // Drop accidental duplicates of a named control. Unnamed lookalikes (two
    // unlabeled "Start date" boxes) are distinct fields and are kept.
    const seen = new Set();
    return fields.filter((f) => {
      if (!f.name && !f.id) return true;
      if (seen.has(f._key)) return false;
      seen.add(f._key);
      return true;
    });
  }

  /** Open custom dropdowns to read their full option lists (async). */
  async function harvestOptions(fields) {
    const list = fields || extractFields();
    const count = await harvester.harvestAll(list);
    return count;
  }

  /** Strip live references and empty properties for storage/export. */
  function toExport(field) {
    const out = {};
    for (const [k, v] of Object.entries(field)) {
      if (k.startsWith('_') || v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) out[k] = v.map((item) => (item && typeof item === 'object' ? stripUndefined(item) : item));
      else if (v && typeof v === 'object') out[k] = stripUndefined(v);
      else out[k] = v;
    }
    if (out.options) out.optionCount = out.options.length;
    return out;
  }

  // Nested objects (options, validation) keep empty strings: a placeholder
  // option's value "" is meaningful.
  function stripUndefined(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) out[k] = v;
    return out;
  }

  PM.fieldExtractor = { extractFields, harvestOptions, toExport, CONTROL_SELECTOR, keyOf };
})();
