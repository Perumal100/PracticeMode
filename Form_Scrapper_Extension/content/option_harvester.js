/**
 * content/option_harvester.js
 * Reads every option of custom (non-native) dropdowns.
 *
 * Many component libraries (react-select, MUI, Headless UI, Downshift, ...)
 * only render their options while the menu is open, and virtualised lists
 * only render the options currently scrolled into view. To export all
 * choices the harvester opens the menu, scrolls through the list collecting
 * options, then closes it with Escape without selecting anything.
 *
 * Opening a dropdown is a local UI interaction: no value is chosen and no
 * data is entered, so it is allowed on every origin.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});
  const { deepQueryAll, byIdInScope, cleanText, sleep, waitUntil, pointerClick, fire, isOwnUi } = PM.utils;

  const cache = new WeakMap(); // trigger element -> { options, source, complete }
  const OPTION_SELECTOR = '[role="option"], [id*="-option-"], [class*="__option"]';
  const EMPTY_MENU_RE = /^(no\s+(options|results|matches)|type\s+to\s+search|start\s+typing|search\s+for|loading)/i;
  const MAX_OPTIONS = 1000;

  function listboxFor(el) {
    const ids = `${el.getAttribute('aria-controls') || ''} ${el.getAttribute('aria-owns') || ''}`.split(/\s+/).filter(Boolean);
    for (const id of ids) {
      const node = byIdInScope(el, id);
      if (node) return node;
    }
    const inner = el.querySelector('[role="listbox"]');
    if (inner) return inner;
    // Wrapper pattern: combobox and listbox are siblings under a common parent.
    const parent = el.parentElement;
    const sibling = parent?.querySelector(':scope > [role="listbox"], :scope > * > [role="listbox"]');
    return sibling || null;
  }

  function optionValue(node, index) {
    return node.getAttribute('data-value') ?? node.getAttribute('value') ?? node.dataset?.value ?? cleanText(node.textContent) ?? String(index);
  }

  function readOptionNodes(nodes) {
    const seen = new Set();
    const out = [];
    nodes.forEach((node, index) => {
      if (isOwnUi(node)) return;
      const label = cleanText(node.getAttribute('aria-label') || node.textContent);
      if (!label || seen.has(label)) return;
      seen.add(label);
      const group = node.closest('[role="group"]');
      out.push({
        value: optionValue(node, index),
        label,
        group: group ? cleanText(group.getAttribute('aria-label') || group.querySelector('[role="presentation"], [class*="group-heading"], [class*="GroupHeading"]')?.textContent) || undefined : undefined,
        disabled: node.getAttribute('aria-disabled') === 'true' || node.hasAttribute('disabled') || undefined,
      });
    });
    return out;
  }

  /** Options readable without opening (already in the DOM, even if hidden). */
  function readPresentOptions(el) {
    const listbox = listboxFor(el);
    if (!listbox) return [];
    return readOptionNodes(Array.from(listbox.querySelectorAll(OPTION_SELECTOR)).filter((n) => n.matches('[role="option"]') || !n.querySelector('[role="option"]')));
  }

  function getCached(el) {
    return cache.get(el) || null;
  }

  function interactiveTarget(el) {
    // Prefer the element that actually opens the menu.
    return el.querySelector?.('[aria-haspopup="listbox"], input[role="combobox"], [role="button"]') || el;
  }

  async function open(el) {
    const target = interactiveTarget(el);
    const before = new Set(deepQueryAll(document, OPTION_SELECTOR));
    const found = () => {
      const fromListbox = readPresentOptions(el);
      if (fromListbox.length) return { nodes: null, options: fromListbox };
      const fresh = deepQueryAll(document, OPTION_SELECTOR).filter((n) => !before.has(n) && !n.querySelector(OPTION_SELECTOR));
      return fresh.length ? { nodes: fresh, options: readOptionNodes(fresh) } : null;
    };

    try { target.focus({ preventScroll: true }); } catch (_) { /* not focusable */ }
    // Try one opener at a time: firing several at once can toggle a menu
    // open and immediately closed again.
    const control = target.closest?.('[class*="control"], [class*="Control"]');
    const openers = [
      control && control !== target ? () => fire(control, 'mousedown') : null, // react-select
      () => pointerClick(target),
      () => fire(target, 'keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40 }),
    ].filter(Boolean);
    let result = null;
    for (const opener of openers) {
      opener();
      result = await waitUntil(found, 500, 50);
      if (result) break;
    }
    return { target, result, before };
  }

  async function close(el, target) {
    fire(target, 'keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 });
    if (document.activeElement && document.activeElement !== target) {
      fire(document.activeElement, 'keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 });
    }
    await sleep(60);
    if (target.getAttribute('aria-expanded') === 'true' || el.getAttribute('aria-expanded') === 'true') {
      pointerClick(target);
      await sleep(60);
    }
    try { target.blur(); } catch (_) { /* ignore */ }
  }

  /** Scroll a (possibly virtualised) list to collect every option. */
  async function collectAll(el, initial) {
    const options = new Map(initial.options.map((o) => [o.label, o]));
    const anyNode = initial.nodes?.[0] || listboxFor(el)?.querySelector('[role="option"]');
    const scroller = anyNode ? findScrollable(anyNode) : null;
    let complete = true;
    if (scroller) {
      for (let i = 0; i < 40 && options.size < MAX_OPTIONS; i++) {
        const prev = scroller.scrollTop;
        scroller.scrollTop = prev + Math.max(scroller.clientHeight, 120);
        await sleep(70);
        const nodes = Array.from(scroller.querySelectorAll(OPTION_SELECTOR));
        let added = 0;
        for (const option of readOptionNodes(nodes)) {
          if (!options.has(option.label)) { options.set(option.label, option); added++; }
        }
        if (scroller.scrollTop === prev && !added) break;
      }
      scroller.scrollTop = 0;
      if (options.size >= MAX_OPTIONS) complete = false;
    }
    return { options: [...options.values()], complete };
  }

  function findScrollable(node) {
    let current = node.parentElement;
    for (let depth = 0; current && depth < 6; depth++, current = current.parentElement) {
      const style = getComputedStyle(current);
      if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 4) return current;
    }
    return null;
  }

  /**
   * Open a custom dropdown, read all options, close it again.
   * Returns { options, source, complete }.
   */
  async function harvest(el) {
    const present = readPresentOptions(el);
    if (present.length) {
      const entry = { options: present, source: 'aria-listbox', complete: true };
      cache.set(el, entry);
      return entry;
    }
    const { target, result } = await open(el);
    let entry;
    if (!result || (result.options.length === 1 && EMPTY_MENU_RE.test(result.options[0].label))) {
      entry = { options: [], source: 'typeahead', complete: false };
    } else {
      const all = await collectAll(el, result);
      entry = { options: all.options.filter((o) => !EMPTY_MENU_RE.test(o.label)), source: 'aria-listbox-opened', complete: all.complete };
    }
    await close(el, target);
    cache.set(el, entry);
    return entry;
  }

  /** Harvest every custom dropdown on the page whose options are not cached. */
  async function harvestAll(fields) {
    let harvested = 0;
    for (const field of fields || []) {
      if (field._kind !== 'custom-select' || !field._el?.isConnected) continue;
      if (cache.has(field._el) && cache.get(field._el).options.length) continue;
      try {
        await harvest(field._el);
        harvested++;
      } catch (_) { /* leave this widget unharvested */ }
    }
    return harvested;
  }

  /**
   * Choose an option in a custom dropdown by its label. Used by the populator.
   * For typeahead widgets, `typed` text is entered first to load options.
   */
  async function choose(el, optionLabel, { typed } = {}) {
    const { target, result } = await open(el);
    if (typed && target.matches('input')) {
      PM.utils.setNativeValue(target, typed);
      fire(target, 'input');
      await waitUntil(() => deepQueryAll(document, '[role="option"]').length > 0, 1500, 80);
    }
    const nodes = result?.nodes || deepQueryAll(document, OPTION_SELECTOR).filter((n) => !n.querySelector(OPTION_SELECTOR));
    const pool = nodes.length ? nodes : Array.from(listboxFor(el)?.querySelectorAll('[role="option"]') || []);
    const wanted = cleanText(optionLabel).toLowerCase();
    const pick = (nodes) => nodes.find((n) => cleanText(n.textContent).toLowerCase() === wanted) ||
      nodes.find((n) => cleanText(n.textContent).toLowerCase().includes(wanted));
    let match = pick(pool);
    if (!match && pool[0]) {
      // Virtualised list: scroll until the wanted option is rendered.
      const scroller = findScrollable(pool[0]);
      for (let i = 0; scroller && !match && i < 40; i++) {
        const prev = scroller.scrollTop;
        scroller.scrollTop = prev + Math.max(scroller.clientHeight, 120);
        await sleep(70);
        match = pick(Array.from(scroller.querySelectorAll(OPTION_SELECTOR)));
        if (scroller.scrollTop === prev) break;
      }
    }
    if (!match && typed) match = pool.find((n) => !EMPTY_MENU_RE.test(cleanText(n.textContent)));
    if (!match) {
      await close(el, target);
      return false;
    }
    match.scrollIntoView?.({ block: 'nearest' });
    pointerClick(match);
    await sleep(120);
    if (target.getAttribute('aria-expanded') === 'true') await close(el, target);
    return true;
  }

  PM.optionHarvester = { harvest, harvestAll, choose, getCached, readPresentOptions, listboxFor };
})();
