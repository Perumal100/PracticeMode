/**
 * content/conditional_tracker.js
 * Discovers conditional questions by trying each option of a choice field
 * and recording which fields appear.
 *
 *  - Records which option revealed which field, so conditional fields are
 *    never treated as simultaneously required.
 *  - Explores nested branches up to two levels deep.
 *  - Reports coverage honestly: options that were not tried (time or count
 *    limits, custom widgets) are listed as unexplored.
 *  - Restores each trigger to its original value afterwards when the widget
 *    allows it.
 *
 * Only runs where automatic interaction is allowed (local fixtures or sites
 * the user approved), because changing a value can trigger page scripts.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});
  const U = PM.utils;
  const { extractFields } = PM.fieldExtractor;

  const DEFAULTS = { budgetMs: 9000, maxTriggers: 12, maxOptions: 12, maxDepth: 2 };

  function usableOptions(field) {
    return (field.options || []).map((o, index) => ({ ...o, index })).filter((o) => !o.disabled && !o.isPlaceholder && String(o.value ?? '') !== '');
  }

  function isProbeable(field) {
    if (field.disabled || field.readOnly) return false;
    if (field.type === 'checkbox' && field._kind === 'native') return true;
    if (field._kind === 'custom-select') return false; // opening/choosing is too invasive to repeat per option
    if (!['select', 'radio', 'button-group'].includes(field.type)) return false;
    if (field.type === 'select' && field._el?.multiple) return false;
    return usableOptions(field).length >= 2;
  }

  // ── Reading and writing a trigger's state ───────────────────────────
  function snapshot(field) {
    const el = field._el;
    if (field.type === 'select') return { value: el.value };
    if (field.type === 'checkbox') return { checked: el.checked };
    if (field._kind === 'aria-radio') return { index: (field._optionEls || []).findIndex((r) => r.getAttribute('aria-checked') === 'true') };
    if (field._kind === 'button-group') return { index: (field._optionEls || []).findIndex((b) => b.getAttribute('aria-pressed') === 'true') };
    return { index: (field._optionEls || []).findIndex((r) => r.checked) };
  }

  function apply(field, option) {
    const el = field._el;
    if (field.type === 'select') {
      U.setNativeValue(el, option.value);
      U.fire(el, 'input');
      U.fire(el, 'change');
      return;
    }
    if (field.type === 'checkbox') {
      if (el.checked !== option.checked) el.click();
      return;
    }
    const target = field._optionEls?.[option.index];
    if (!target) return;
    if (field._kind === 'native') {
      if (!target.checked) target.click();
    } else {
      U.pointerClick(target);
    }
  }

  function restore(field, snap) {
    try {
      const el = field._el;
      if (field.type === 'select') {
        if (el.value !== snap.value) { U.setNativeValue(el, snap.value); U.fire(el, 'input'); U.fire(el, 'change'); }
      } else if (field.type === 'checkbox') {
        if (el.checked !== snap.checked) el.click();
      } else if (snap.index >= 0) {
        apply(field, { index: snap.index });
      } else if (field._kind === 'native') {
        // Nothing was chosen originally: clear the group again.
        (field._optionEls || []).forEach((r) => { if (r.checked) { r.checked = false; U.fire(r, 'change'); } });
      }
    } catch (_) { /* best effort */ }
  }

  function optionsToTry(field) {
    if (field.type === 'checkbox') return [{ label: 'Checked', value: 'checked', checked: true }];
    return usableOptions(field);
  }

  async function settle() {
    await U.waitForDOMStability(120, 700);
  }

  // ── Exploration ─────────────────────────────────────────────────────
  /**
   * Explore the choice fields in `fields`.
   * Returns {
   *   revealed: Map<fieldKey, { field, conditions: [condition] }>,
   *   logic:    [{ triggerKey, triggerLabel, triggerType, depth, branches, explored, unexplored, coverage }]
   * }
   * where condition = { triggerKey, triggerLabel, value, valueLabel, parent? }.
   */
  async function explore(fields, options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    const deadline = Date.now() + cfg.budgetMs;
    const revealed = new Map();
    const logic = [];

    async function probe(trigger, depth, parentCondition) {
      const tryList = optionsToTry(trigger);
      const limited = tryList.slice(0, cfg.maxOptions);
      const entry = {
        triggerKey: trigger._key,
        triggerLabel: trigger.label,
        triggerType: trigger.type,
        depth,
        parent: parentCondition || undefined,
        branches: [],
        explored: [],
        unexplored: tryList.slice(cfg.maxOptions).map((o) => o.label),
      };
      const baseline = new Set(extractFields().map((f) => f._key));
      const snap = snapshot(trigger);

      for (const option of limited) {
        if (Date.now() > deadline) {
          entry.unexplored.push(option.label);
          continue;
        }
        try {
          apply(trigger, option);
          await settle();
        } catch (_) {
          entry.unexplored.push(option.label);
          continue;
        }
        entry.explored.push(option.label);
        const condition = {
          triggerKey: trigger._key,
          triggerLabel: trigger.label,
          value: String(option.value),
          valueLabel: option.label,
          parent: parentCondition || undefined,
        };
        const now = extractFields();
        const fresh = now.filter((f) => !baseline.has(f._key));
        entry.branches.push({ value: String(option.value), valueLabel: option.label, revealsKeys: fresh.map((f) => f._key) });
        for (const f of fresh) {
          const record = revealed.get(f._key) || { field: f, conditions: [] };
          record.field = f;
          record.conditions.push(condition);
          revealed.set(f._key, record);
        }
        if (depth < cfg.maxDepth) {
          for (const nested of fresh.filter(isProbeable).slice(0, 3)) {
            if (Date.now() > deadline) break;
            await probe(nested, depth + 1, condition);
          }
        }
      }

      restore(trigger, snap);
      await settle();
      entry.coverage = entry.unexplored.length ? 'partial' : 'complete';
      // Only triggers that changed something are conditional logic.
      if (entry.branches.some((b) => b.revealsKeys.length)) logic.push(entry);
      else if (entry.unexplored.length) logic.push({ ...entry, branches: [], note: 'Some options were not tried; their effect is unknown.' });
    }

    const triggers = fields.filter(isProbeable);
    const probed = new Set();
    for (const trigger of triggers.slice(0, cfg.maxTriggers)) {
      if (Date.now() > deadline) break;
      probed.add(trigger._key);
      await probe(trigger, 1, null);
    }
    const skipped = triggers.filter((t) => !probed.has(t._key)).map((t) => t.label);
    return { revealed, logic, skippedTriggers: skipped, timedOut: Date.now() > deadline };
  }

  PM.conditionalTracker = { explore, isProbeable };
})();
