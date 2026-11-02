/**
 * content/utils.js
 * Shared utility functions used across all content script modules.
 */

window.PracticeMode = window.PracticeMode || {};

window.PracticeMode.utils = (() => {
  /**
   * Wait for a DOM element matching selector to appear within timeout ms.
   */
  function waitForElement(selector, timeout = 5000, root = document) {
    return new Promise((resolve, reject) => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(root.body || root, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for: ${selector}`));
      }, timeout);
    });
  }

  /**
   * Wait for meaningful DOM change after an action.
   * Resolves when the DOM stops mutating for stableMs ms.
   */
  function waitForDOMStability(stableMs = 600, timeout = 8000) {
    return new Promise((resolve) => {
      let timer = null;
      let elapsed = 0;
      const interval = 50;

      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          observer.disconnect();
          resolve('stable');
        }, stableMs);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      // Seed the stability timer
      timer = setTimeout(() => {
        observer.disconnect();
        resolve('stable');
      }, stableMs);

      // Hard cap
      setTimeout(() => {
        observer.disconnect();
        clearTimeout(timer);
        resolve('timeout');
      }, timeout);
    });
  }

  /**
   * Dispatch framework-compatible native input events.
   */
  function triggerNativeEvents(element, value) {
    if (!element) return;
    try {
      let proto = window.HTMLInputElement.prototype;
      if (element instanceof HTMLTextAreaElement) {
        proto = window.HTMLTextAreaElement.prototype;
      } else if (element instanceof HTMLSelectElement) {
        proto = window.HTMLSelectElement.prototype;
      }
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (nativeInputValueSetter && nativeInputValueSetter.set) {
        nativeInputValueSetter.set.call(element, value);
      } else {
        element.value = value;
      }
    } catch (e) {
      try { element.value = value; } catch (_) {}
    }

    ['input', 'change', 'blur', 'keyup'].forEach((eventName) => {
      try {
        element.dispatchEvent(
          new Event(eventName, { bubbles: true, cancelable: true })
        );
      } catch (_) {}
    });
  }

  /**
   * Safely get visible text from an element or its associated label.
   */
  function getLabel(element) {
    // aria-label
    if (element.getAttribute('aria-label')) return element.getAttribute('aria-label').trim();

    // aria-labelledby
    const labelledById = element.getAttribute('aria-labelledby');
    if (labelledById) {
      const labelEl = document.getElementById(labelledById);
      if (labelEl) return labelEl.innerText.trim();
    }

    // <label for="id">
    if (element.id) {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) return label.innerText.trim();
    }

    // Closest wrapping label
    const closestLabel = element.closest('label');
    if (closestLabel) {
      return closestLabel.innerText.replace(element.value || '', '').trim();
    }

    // Component libraries commonly put a question label alongside an input
    // that intentionally has no id/name (for example, date pickers and
    // autocomplete inputs). Prefer that question label over a placeholder.
    const fieldContainer = element.closest(
      '[data-field-path], [data-field-entry-id], .form-group, .field-wrapper, [class*="fieldEntry"], [class*="field-entry"]'
    );
    if (fieldContainer) {
      const labels = Array.from(fieldContainer.querySelectorAll('label'));
      const questionLabel = labels.find(label =>
        !label.contains(element) &&
        !label.querySelector('input, select, textarea') &&
        (label.className?.toString().toLowerCase().includes('question') ||
          label.className?.toString().toLowerCase().includes('heading') ||
          label.getAttribute('for') || labels.length === 1)
      );
      if (questionLabel?.innerText?.trim()) return questionLabel.innerText.trim();
    }

    // Placeholder
    if (element.placeholder) return element.placeholder.trim();

    // Name attribute as fallback
    if (element.name) return element.name.replace(/[_\-]/g, ' ').trim();

    return '';
  }

  /**
   * Check if an element is visible and interactable.
   */
  function isVisible(element) {
    if (!element) return false;
    if (element.closest('[hidden], [aria-hidden="true"]')) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    // Custom checkboxes, radio buttons, and file inputs are often styled with opacity: 0
    // or tiny width/height while their parent container or label is visible.
    const isSpecialInput = ['radio', 'checkbox', 'file'].includes(element.type);
    if (isSpecialInput) {
      const parent = element.parentElement;
      if (parent) {
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') return false;
        const parentRect = parent.getBoundingClientRect();
        if (parentRect.width > 0 && parentRect.height > 0) return true;
      }
    }

    if (style.opacity === '0' && !isSpecialInput) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Get a stable fingerprint for an element to detect duplicate fields.
   */
  function fieldFingerprint(field) {
    return `${field.label}__${field.type}__${field.name || ''}`.toLowerCase().replace(/\s+/g, '_');
  }

  /**
   * Deep clone a plain object safely (no circular refs).
   */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Slugify a string for use as an ID or key.
   */
  function slugify(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  /**
   * Sleep for ms milliseconds.
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return {
    waitForElement,
    waitForDOMStability,
    triggerNativeEvents,
    getLabel,
    isVisible,
    fieldFingerprint,
    deepClone,
    slugify,
    sleep,
  };
})();
