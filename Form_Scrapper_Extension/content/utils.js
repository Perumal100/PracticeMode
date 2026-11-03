/**
 * content/utils.js
 * Shared DOM helpers used by every content-script module.
 * Shadow-DOM aware: open shadow roots are traversed in document order.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});

  // Our own UI (copilot panel, highlight overlay) is marked with this attribute
  // and must never be treated as part of the page's form.
  const IGNORE_ATTR = 'data-pm-ignore';

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isOwnUi(el) {
    return Boolean(el?.closest?.(`[${IGNORE_ATTR}]`));
  }

  /**
   * querySelectorAll that also descends into open shadow roots, preserving
   * document order (a host's shadow content is visited where the host sits).
   */
  function deepQueryAll(root, selector) {
    const out = [];
    const visit = (node) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
      let current = walker.currentNode;
      if (current.nodeType !== Node.ELEMENT_NODE) current = walker.nextNode();
      while (current) {
        if (current.hasAttribute(IGNORE_ATTR)) {
          // Skip our own UI subtree entirely.
          let next = walker.nextSibling();
          while (!next && walker.parentNode()) next = walker.nextSibling();
          current = next;
          continue;
        }
        if (current.matches(selector)) out.push(current);
        if (current.shadowRoot) visit(current.shadowRoot);
        current = walker.nextNode();
      }
    };
    visit(root || document);
    return out;
  }

  function byIdInScope(el, id) {
    if (!id) return null;
    const scope = el?.getRootNode?.() || document;
    return (scope.getElementById ? scope.getElementById(id) : null) || document.getElementById(id);
  }

  function cleanText(text) {
    return String(text || '')
      .replace(/ /g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Visible text of an element without the text of nested form controls. */
  function ownText(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('input, select, textarea, option, datalist, script, style, [aria-hidden="true"]').forEach((n) => n.remove());
    // innerText on a detached clone has no layout, so textContent is used.
    return cleanText(clone.textContent);
  }

  /**
   * Strip required markers and trailing punctuation from a label.
   * Returns { text, hadRequiredMarker }.
   */
  function normalizeLabel(raw) {
    let text = cleanText(raw);
    // An asterisk anywhere in a field label is a required marker in practice
    // ("Bio * (min 20 chars)").
    const hadRequiredMarker = /\*|\(required\)|\brequired\b$/i.test(text);
    text = cleanText(
      text
        .replace(/\(required\)/gi, ' ')
        .replace(/\*+/g, ' ')
    ).replace(/\s*[:：]\s*$/, '');
    return { text, hadRequiredMarker };
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('[hidden], [aria-hidden="true"]') && !el.matches('input[type="file"], input[type="radio"], input[type="checkbox"]')) {
      return false;
    }
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    // Hidden ancestors (display:none) make the element unrendered.
    if (el.getClientRects().length === 0) {
      return false;
    }
    if (style.opacity === '0' && !isToggleLike(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isToggleLike(el) {
    return el.matches?.('input[type="radio"], input[type="checkbox"], input[type="file"]');
  }

  /**
   * Custom radios/checkboxes/file inputs are often visually hidden (opacity 0,
   * 1px, clip) while their label is shown. Treat them as visible when a label or
   * the wrapping container is visible.
   */
  function isEffectivelyVisible(el) {
    if (isVisible(el)) return true;
    if (!isToggleLike(el)) return false;
    const labels = Array.from(el.labels || []);
    if (labels.some(isVisible)) return true;
    const parent = el.parentElement;
    return Boolean(parent && parent.getClientRects().length && isVisible(parent));
  }

  function domOrderCompare(a, b) {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    // Different trees (shadow roots): fall back to host comparison.
    const hostA = a.getRootNode().host;
    const hostB = b.getRootNode().host;
    if (hostA && hostA !== a) return domOrderCompare(hostA, b);
    if (hostB && hostB !== b) return domOrderCompare(a, hostB);
    return 0;
  }

  function slugify(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
  }

  /** origin + path only — query strings and fragments can carry tokens or PII. */
  function safeUrl(href) {
    try {
      const url = new URL(href, location.href);
      if (url.protocol === 'file:') return `file://${url.pathname}`;
      return `${url.origin}${url.pathname}`;
    } catch (_) {
      return '';
    }
  }

  /**
   * Resolves when no DOM mutation has happened for `quietMs`, or after `timeout`.
   */
  function waitForDOMStability(quietMs = 400, timeout = 4000) {
    return new Promise((resolve) => {
      let quietTimer = null;
      const done = (result) => {
        observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(hardTimer);
        resolve(result);
      };
      const observer = new MutationObserver((mutations) => {
        if (mutations.every((m) => isOwnUi(m.target))) return;
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => done('stable'), quietMs);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      quietTimer = setTimeout(() => done('stable'), quietMs);
      const hardTimer = setTimeout(() => done('timeout'), timeout);
    });
  }

  async function waitUntil(predicate, timeout = 3000, interval = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const value = await predicate();
        if (value) return value;
      } catch (_) { /* keep polling */ }
      await sleep(interval);
    }
    return null;
  }

  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) descriptor.set.call(el, value);
    else el.value = value;
  }

  function fire(el, type, init = {}) {
    let event;
    if (/^key/.test(type)) event = new KeyboardEvent(type, { bubbles: true, cancelable: true, composed: true, ...init });
    else if (/^(mouse|click|pointer)/.test(type)) {
      const Ctor = type.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
      event = new Ctor(type, { bubbles: true, cancelable: true, composed: true, view: window, button: 0, ...init });
    } else if (type === 'input') event = new InputEvent('input', { bubbles: true, cancelable: false, composed: true, ...init });
    else event = new Event(type, { bubbles: true, cancelable: true, composed: true, ...init });
    el.dispatchEvent(event);
  }

  /** A realistic pointer click sequence for custom widgets that ignore .click(). */
  function pointerClick(el) {
    fire(el, 'pointerdown');
    fire(el, 'mousedown');
    fire(el, 'pointerup');
    fire(el, 'mouseup');
    if (typeof el.click === 'function') el.click();
    else fire(el, 'click');
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  /**
   * Briefly outline elements on the page so the user can see what was
   * captured. Purely visual; uses its own shadow root and never touches page
   * styles.
   */
  function flashElements(elements, color = '#6366f1', duration = 1400) {
    try {
      const rects = elements
        .filter((el) => el?.isConnected)
        .map((el) => (isVisible(el) ? el : el.labels?.[0] || el.parentElement))
        .filter(Boolean)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length) return;
      const host = document.createElement('div');
      host.setAttribute(IGNORE_ATTR, 'highlight');
      host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
      const root = host.attachShadow({ mode: 'open' });
      for (const r of rects) {
        const box = document.createElement('div');
        box.style.cssText = `position:fixed;left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;` +
          `border:2px solid ${color};border-radius:6px;box-shadow:0 0 0 4px ${color}33;transition:opacity .4s;`;
        root.appendChild(box);
      }
      document.documentElement.appendChild(host);
      setTimeout(() => {
        root.querySelectorAll('div').forEach((d) => (d.style.opacity = '0'));
        setTimeout(() => host.remove(), 450);
      }, duration);
    } catch (_) { /* decoration only */ }
  }

  PM.utils = {
    IGNORE_ATTR,
    sleep,
    isOwnUi,
    deepQueryAll,
    byIdInScope,
    cleanText,
    ownText,
    normalizeLabel,
    isVisible,
    isEffectivelyVisible,
    domOrderCompare,
    slugify,
    safeUrl,
    waitForDOMStability,
    waitUntil,
    setNativeValue,
    fire,
    pointerClick,
    hashString,
    flashElements,
  };
})();
