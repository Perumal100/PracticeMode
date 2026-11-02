/**
 * content/field_populator.js
 * Enters generated fictional values into live form controls, dispatching the
 * events React, Angular and Vue listen for. Contains no generation or
 * navigation logic: values come from the dummy-data generator and the
 * navigation controller decides when to call it.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});
  const U = PM.utils;
  const generator = PM.dummyDataGenerator;
  const harvester = PM.optionHarvester;

  const PLACEHOLDER_TEXT_RE = /^(select|choose|pick|search|type|start\s+typing|--|please)/i;
  const CHOICE_TYPES = new Set(['select', 'radio', 'button-group', 'checkbox-group']);

  // ── Value presence ──────────────────────────────────────────────────
  function hasValue(field) {
    const el = field._el;
    if (!el?.isConnected) return false;
    switch (field._kind) {
      case 'custom-select': {
        if (field._valueEl && String(field._valueEl.value || '').trim()) return true;
        if (el.querySelector?.('[class*="singleValue"], [class*="single-value" i], [class*="multiValue"], [class*="selected-value" i], [class*="tag" i]')) return true;
        const shown = U.cleanText(el.matches('input') ? el.value : el.textContent);
        return Boolean(shown) && !PLACEHOLDER_TEXT_RE.test(shown) && shown !== field.label;
      }
      case 'aria-radio':
        return (field._optionEls || []).some((r) => r.getAttribute('aria-checked') === 'true');
      case 'aria-toggle':
        return el.getAttribute('aria-checked') === 'true';
      case 'button-group':
        return (field._optionEls || []).some((b) => b.getAttribute('aria-pressed') === 'true' || /\b(selected|active|checked)\b/i.test(b.className));
      case 'richtext':
        return U.cleanText(el.textContent).length > 0;
      default:
        break;
    }
    if (field.type === 'radio' || field.type === 'checkbox-group') return (field._optionEls || []).some((r) => r.checked);
    if (field.type === 'checkbox') return el.checked;
    if (field.type === 'file') return (el.files?.length || 0) > 0;
    if (field.type === 'select') {
      if (el.multiple) return el.selectedOptions.length > 0;
      const opt = el.selectedOptions?.[0];
      return Boolean(opt && opt.value !== '' && !(field.options?.[opt.index]?.isPlaceholder));
    }
    return String(el.value ?? '').trim().length > 0;
  }

  /** Whether the browser's own constraint validation rejects the control. */
  function isNativelyInvalid(field) {
    const el = field._el;
    return Boolean(el?.validity && el.willValidate && !el.validity.valid);
  }

  // ── Writers ─────────────────────────────────────────────────────────
  function writeText(el, value) {
    try { el.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    U.fire(el, 'keydown', { key: 'a' });
    U.setNativeValue(el, value);
    U.fire(el, 'input', { data: String(value), inputType: 'insertText' });
    U.fire(el, 'keyup', { key: 'a' });
    U.fire(el, 'change');
    try { el.blur(); } catch (_) { /* ignore */ }
    U.fire(el, 'focusout');
  }

  function writeSelect(el, value) {
    try { el.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    if (el.multiple) {
      Array.from(el.options).forEach((o) => { o.selected = o.value === value; });
    } else {
      U.setNativeValue(el, value);
    }
    U.fire(el, 'input');
    U.fire(el, 'change');
    try { el.blur(); } catch (_) { /* ignore */ }
  }

  function clickToggle(input, shouldBeChecked) {
    if (input.checked === shouldBeChecked) return;
    input.click();
    if (input.checked !== shouldBeChecked) {
      input.checked = shouldBeChecked;
      U.fire(input, 'input');
      U.fire(input, 'change');
    }
  }

  function findOptionElement(field, value, optionLabel) {
    const els = field._optionEls || [];
    const idx = (field.options || []).findIndex((o) => String(o.value) === String(value) || (optionLabel && o.label === optionLabel));
    if (idx >= 0 && els[idx]) return els[idx];
    return els.find((e) => !e.disabled && e.getAttribute?.('aria-disabled') !== 'true') || null;
  }

  function writeFile(el, descriptor) {
    let bytes;
    if (descriptor.base64) {
      const bin = atob(descriptor.base64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(descriptor.text || '');
    }
    const file = new File([bytes], descriptor.fileName, { type: descriptor.mimeType });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    el.files = transfer.files;
    U.fire(el, 'input');
    U.fire(el, 'change');
  }

  function writeRichText(el, value) {
    el.focus();
    let inserted = false;
    try { inserted = document.execCommand('insertText', false, value); } catch (_) { inserted = false; }
    if (!inserted) {
      el.textContent = value;
      U.fire(el, 'input');
    }
    el.blur();
  }

  // ── Public API ──────────────────────────────────────────────────────
  /**
   * Fill one field. Returns
   *   { status: 'filled' | 'manual' | 'failed' | 'skipped', reason?, blocker?, choice? }
   */
  async function fillField(field, ctx = {}) {
    if (field.disabled || field.readOnly) return { status: 'skipped', reason: 'disabled or read-only' };
    const el = field._el;
    if (!el?.isConnected) return { status: 'failed', reason: 'control is no longer on the page' };

    const generated = generator.generate(field, ctx);
    if (generated.requiresManual) return { status: 'manual', reason: generated.reason, blocker: generated.blocker };
    const { value, optionLabel } = generated;

    try {
      switch (field._kind) {
        case 'custom-select': {
          const ok = await harvester.choose(el, optionLabel || String(value), { typed: generated.typeahead ? String(value) : undefined });
          if (!ok) return { status: 'failed', reason: `could not choose an option in "${field.label}"` };
          break;
        }
        case 'aria-radio':
        case 'button-group': {
          const target = findOptionElement(field, value, optionLabel);
          if (!target) return { status: 'failed', reason: `no option to choose in "${field.label}"` };
          U.pointerClick(target);
          break;
        }
        case 'aria-toggle':
          if (el.getAttribute('aria-checked') !== 'true') U.pointerClick(el);
          break;
        case 'richtext':
          writeRichText(el, String(value));
          break;
        default:
          if (field.type === 'radio') {
            const target = findOptionElement(field, value, optionLabel);
            if (!target) return { status: 'failed', reason: `no option to choose in "${field.label}"` };
            clickToggle(target, true);
          } else if (field.type === 'checkbox-group') {
            const target = findOptionElement(field, value, optionLabel);
            if (target) clickToggle(target, true);
          } else if (field.type === 'checkbox') {
            clickToggle(el, Boolean(value));
          } else if (field.type === 'select') {
            writeSelect(el, String(value));
          } else if (field.type === 'file') {
            writeFile(el, value);
          } else {
            writeText(el, String(value));
          }
      }
    } catch (e) {
      return { status: 'failed', reason: e.message };
    }

    await U.sleep(40);
    const choice = CHOICE_TYPES.has(field.type) ? { field: field.label, option: optionLabel || String(value) } : undefined;
    return { status: 'filled', choice, designatedTestValue: generated.designatedTestValue };
  }

  /**
   * Fill the fields of one step.
   *  attempt 0 : required fields that are still empty
   *  attempt >0: additionally every field the site flagged as invalid
   *              (`targetKeys`) and every other empty visible field, with
   *              alternative values informed by the site's feedback.
   */
  async function fillStep(fields, { environment, attempt = 0, targetKeys = new Set(), feedbackByKey = new Map() } = {}) {
    const result = { filled: [], manual: [], failed: [], choices: [] };
    for (const field of fields) {
      const targeted = targetKeys.has(field._key);
      const empty = !hasValue(field);
      const wanted = targeted || (empty && (field.required || attempt > 0) && !(isFileOrSensitiveOptional(field)));
      if (!wanted) continue;
      const outcome = await fillField(field, { environment, attempt: targeted ? attempt : 0, feedback: feedbackByKey.get(field._key) });
      if (outcome.status === 'filled') {
        result.filled.push(field.label);
        if (outcome.choice) result.choices.push(outcome.choice);
      } else if (outcome.status === 'manual') {
        // Optional fields we cannot fill safely are simply left empty.
        if (field.required || targeted) result.manual.push({ field: field.label, reason: outcome.reason, blocker: outcome.blocker });
      } else if (outcome.status === 'failed') {
        result.failed.push({ field: field.label, reason: outcome.reason });
      }
    }
    return result;
  }

  // Optional uploads and sensitive fields are never filled on retries; they
  // are only touched when the site marks them as required.
  function isFileOrSensitiveOptional(field) {
    return !field.required && (field.type === 'file' || Boolean(PM.safetyPolicy.sensitiveKind(field)));
  }

  PM.fieldPopulator = { fillField, fillStep, hasValue, isNativelyInvalid };
})();
