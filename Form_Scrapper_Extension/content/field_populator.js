/**
 * content/field_populator.js
 * Populates form fields with generated fictional data.
 * Triggers framework-compatible events for React/Angular/Vue.
 * Completely separate from the extraction and navigation engines.
 */

window.PracticeMode = window.PracticeMode || {};

window.PracticeMode.fieldPopulator = (() => {
  const { triggerNativeEvents, isVisible, sleep } = window.PracticeMode.utils;
  const { generate } = window.PracticeMode.dummyDataGenerator;

  // ──────────────────────────────────────────────
  // Low-level field population
  // ──────────────────────────────────────────────

  function populateText(el, value) {
    el.focus();
    // React/Vue/Angular native value override
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const nativeDesc = Object.getOwnPropertyDescriptor(proto, 'value');

    if (nativeDesc && nativeDesc.set) {
      nativeDesc.set.call(el, value);
    } else {
      el.value = value;
    }

    triggerNativeEvents(el, value);
    el.blur();
    return true;
  }

  function populateSelect(el, value) {
    el.focus();
    const nativeDesc = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value'
    );
    if (nativeDesc && nativeDesc.set) {
      nativeDesc.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.blur();
    return true;
  }

  function populateCustomSelect(field, value) {
    const trigger = field._element;
    const option = Array.from((trigger.parentElement || document).querySelectorAll('[role="option"]'))
      .find(item => (item.getAttribute('data-value') || item.getAttribute('value') || item.dataset?.value) === value)
      || Array.from((trigger.parentElement || document).querySelectorAll('[role="option"]'))[0];
    if (!trigger || !option) return false;
    trigger.click();
    option.click();
    if (field._valueElement && field._valueElement.value !== value) {
      const nativeDesc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      nativeDesc?.set ? nativeDesc.set.call(field._valueElement, value) : field._valueElement.value = value;
      triggerNativeEvents(field._valueElement, value);
    }
    trigger.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function populateCheckbox(el, shouldCheck) {
    if (el.checked !== shouldCheck) {
      el.click();
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  function populateRadio(name, value) {
    const radio = document.querySelector(
      `input[type="radio"][name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`
    );
    if (!radio) {
      // Try first visible option
      const firstRadio = document.querySelector(
        `input[type="radio"][name="${CSS.escape(name)}"]`
      );
      if (firstRadio) {
        firstRadio.click();
        firstRadio.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }
    radio.click();
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function populateCheckboxGroup(name, value) {
    // Check the first option in the group
    const checkbox = document.querySelector(
      `input[type="checkbox"][name="${CSS.escape(name)}"]`
    );
    if (checkbox && !checkbox.checked) {
      checkbox.click();
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  function populateButtonGroup(field, value) {
    const button = (field._optionElements || []).find(option => option.dataset.option === value && !option.disabled)
      || (field._optionElements || []).find(option => !option.disabled);
    if (!button) return false;
    button.click();
    button.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Custom dropdown detection (non-native selects)
  function tryPopulateCustomDropdown(field) {
    const label = (field.label || '').toLowerCase();
    // Look for common custom dropdown patterns
    const wrapper = document.querySelector(
      `[aria-label="${field.label}"], [data-testid="${field.name}"], [class*="dropdown"][aria-expanded]`
    );
    // Too risky to automate unknown custom dropdowns — skip
    return false;
  }

  function hasValue(field) {
    const el = field._element;
    if (!el) return false;
    if (field.type === 'radio') {
      return Boolean(document.querySelector(`input[type="radio"]${field.name ? `[name="${CSS.escape(field.name)}"]` : ''}:checked`));
    }
    if (field.type === 'button-group') return Boolean(field._optionElements || []).some(option => option.getAttribute('aria-pressed') === 'true');
    if (field.type === 'checkbox' || field.type === 'checkbox-group') return Boolean(el.checked);
    if (field.custom) return Boolean(field._valueElement?.value);
    return String(el.value || '').trim().length > 0;
  }

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  /**
   * Populate a single field with its generated value.
   * Returns { success, requiresManual, reason }
   */
  async function populateField(field) {
    if (field.disabled || field.readOnly) {
      return { success: false, requiresManual: false, reason: 'Field is disabled or read-only' };
    }

    const generated = generate(field);
    if (generated.requiresManual) {
      return { success: false, requiresManual: true, reason: generated.reason };
    }

    const el = field._element;
    if (!el || !isVisible(el)) {
      return { success: false, requiresManual: false, reason: 'Element not visible or detached' };
    }

    try {
      const { value } = generated;
      const type = field.type;

      if (type === 'select') {
        if (field.custom) {
          if (!populateCustomSelect(field, value)) throw new Error('Could not select a custom dropdown option');
        } else {
          populateSelect(el, value);
        }
      } else if (type === 'radio') {
        populateRadio(field.name, value);
      } else if (type === 'checkbox') {
        populateCheckbox(el, value === true || value === 'true');
      } else if (type === 'checkbox-group') {
        populateCheckboxGroup(field.name, value);
      } else if (type === 'button-group') {
        if (!populateButtonGroup(field, value)) throw new Error('Could not choose an option');
      } else if (type === 'file') {
        return {
          success: false,
          requiresManual: true,
          reason: `File upload "${field.label}" requires manual input.`,
        };
      } else {
        // text, email, tel, number, date, textarea, etc.
        populateText(el, value);
      }

      await sleep(80); // brief yield for framework reactivity
      return { success: true, requiresManual: false, populatedValue: value };
    } catch (e) {
      return { success: false, requiresManual: false, reason: `Population error: ${e.message}` };
    }
  }

  /**
   * Populate all required fields in an array with retry.
   * Returns { populated: [], failed: [], requiresManual: [] }
   */
  async function populateRequiredFields(fields, maxRetries = 2) {
    const populated = [];
    const failed = [];
    const requiresManualList = [];

    const required = fields.filter((f) => f.required && !f.disabled && !f.readOnly && !hasValue(f));

    for (const field of required) {
      let result;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        result = await populateField(field);
        if (result.success || result.requiresManual) break;
        await sleep(300);
      }

      if (result.requiresManual) {
        requiresManualList.push({ field: field.label, reason: result.reason });
      } else if (result.success) {
        populated.push({ field: field.label, value: result.populatedValue });
      } else {
        failed.push({ field: field.label, reason: result.reason });
      }
    }

    return { populated, failed, requiresManual: requiresManualList };
  }

  return { populateField, populateRequiredFields };
})();
