/**
 * content/content_main.js
 * Extraction engine: orchestrates capture → (explore branches) → fill →
 * advance for every step of a form, in the frame that holds the form.
 *
 * Modes
 *   auto      fill fictional data and click Next automatically (fixtures, or
 *             sites the user explicitly approved)
 *   assisted  the user fills and navigates; every new step is captured as it
 *             appears (works everywhere, sends nothing on the user's behalf)
 *   scan      capture only the current step
 *
 * Whenever automation cannot continue safely the engine switches to
 * `awaiting_user` and watches the page: as soon as the user moves to a new
 * step manually, extraction picks up again.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});
  if (PM.engine) return; // injected twice (e.g. manifest + programmatic)

  const U = PM.utils;
  const policy = PM.safetyPolicy;
  const store = PM.extractionState;
  const extractor = PM.fieldExtractor;
  const detector = PM.stepDetector;
  const tracker = PM.conditionalTracker;
  const nav = PM.navigationController;

  // element -> field key at capture time. Frameworks such as React reuse the
  // same DOM node for a different field on the next step, so an element only
  // counts as already captured while it still represents the same field.
  const capturedElements = new WeakMap();
  const wasCaptured = (f) => capturedElements.get(f._el) === f._key;
  const markCaptured = (f) => f?._el && capturedElements.set(f._el, f._key);
  let activeRun = 0;
  let loopRunning = false;
  let watcher = null;
  let ready = null;

  // ── Context ─────────────────────────────────────────────────────────
  function whoAmI() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'PM_WHOAMI' }, (response) => {
        if (chrome.runtime.lastError || !response) resolve(null);
        else resolve(response);
      });
    });
  }

  async function ensureContext() {
    if (!ready) {
      ready = whoAmI().then((me) => {
        if (me) store.setContext({ tabId: me.tabId, frameId: me.frameId });
        return me;
      });
    }
    return ready;
  }

  function environment() {
    return policy.classifyOrigin(location.href) === 'fixture' ? 'fixture' : 'production';
  }

  function setMessage(message) {
    return store.update((s) => { s.message = message; });
  }

  // ── Capture ─────────────────────────────────────────────────────────
  function allocateId(state, field) {
    const source = field.name && !/^[0-9a-f-]{20,}$/i.test(field.name) ? field.name.replace(/([a-z])([A-Z])/g, '$1_$2') : field.label;
    const base = U.slugify(source) || U.slugify(field.type) || 'field';
    let id = base;
    let n = 2;
    while (state.usedFieldIds.includes(id)) id = `${base}_${n++}`;
    state.usedFieldIds.push(id);
    return id;
  }

  function conditionToExport(condition, keyToId) {
    if (!condition) return undefined;
    return {
      fieldId: keyToId.get(condition.triggerKey),
      field: condition.triggerLabel,
      value: condition.value,
      valueLabel: condition.valueLabel,
      requires: conditionToExport(condition.parent, keyToId),
    };
  }

  /**
   * Turn live fields (+ optional exploration result) into exported field
   * objects in display order. Revealed conditional fields are placed right
   * after the question that reveals them.
   */
  function buildStepFields(state, baseFields, exploration, observedCondition) {
    const keyToId = new Map();
    const rows = [];
    for (const f of baseFields) {
      const fieldId = allocateId(state, f);
      keyToId.set(f._key, fieldId);
      rows.push({ key: f._key, data: { fieldId, ...extractor.toExport(f) } });
    }
    if (observedCondition) {
      for (const row of rows) {
        row.data.conditional = { visibleInitially: false, showWhen: [{ field: observedCondition.field, valueLabel: observedCondition.option, observed: true }] };
      }
    }
    for (const [key, record] of exploration?.revealed || []) {
      if (keyToId.has(key)) continue;
      const fieldId = allocateId(state, record.field);
      keyToId.set(key, fieldId);
      const triggerKeys = record.conditions.map((c) => c.triggerKey);
      let insertAt = rows.length;
      const triggerIndex = rows.findIndex((r) => triggerKeys.includes(r.key));
      if (triggerIndex >= 0) {
        // After the trigger and any fields it (or a nested trigger) already revealed.
        insertAt = triggerIndex + 1;
        while (insertAt < rows.length && rows[insertAt].record) insertAt++;
      }
      rows.splice(insertAt, 0, { key, record, data: { fieldId, ...extractor.toExport(record.field) } });
    }
    for (const row of rows) {
      if (!row.record) continue;
      row.data.conditional = {
        visibleInitially: false,
        showWhen: row.record.conditions.map((c) => conditionToExport(c, keyToId)),
      };
      if (row.data.required) row.data.requiredOnlyWhenShown = true;
    }
    const logic = (exploration?.logic || []).map((entry) => ({
      triggerFieldId: keyToId.get(entry.triggerKey),
      triggerLabel: entry.triggerLabel,
      triggerType: entry.triggerType,
      depth: entry.depth,
      requires: conditionToExport(entry.parent, keyToId),
      branches: entry.branches.map((b) => ({
        value: b.value,
        valueLabel: b.valueLabel,
        revealsFieldIds: b.revealsKeys.map((k) => keyToId.get(k)).filter(Boolean),
      })),
      exploredOptions: entry.explored,
      unexploredOptions: entry.unexplored,
      coverage: entry.coverage,
      note: entry.note,
    }));
    return { fields: rows.map((r, i) => ({ order: i + 1, ...r.data })), logic };
  }

  function sectionsOf(fields) {
    const sections = [];
    for (const f of fields) {
      if (!f.section) continue;
      let entry = sections.find((s) => s.title === f.section);
      if (!entry) sections.push((entry = { title: f.section, fieldIds: [] }));
      entry.fieldIds.push(f.fieldId);
    }
    return sections;
  }

  /**
   * Capture the current page as a step if it is a new one.
   * Returns { status: 'captured' | 'same' | 'cycle', fields, identity, matchedStep? }
   */
  async function captureCurrentStep({ explore } = {}) {
    let fields = extractor.extractFields();
    if (fields.some((f) => f._kind === 'custom-select')) {
      await setMessage('Opening custom dropdowns to read every option…');
      await extractor.harvestOptions(fields);
      fields = extractor.extractFields();
    }
    const indicator = detector.detectStepIndicator();
    const formTitle = detector.formTitle();
    const identity = detector.stepIdentity(fields, indicator.activeTitle || '');
    const state = await store.load();
    if (!state) return { status: 'none', fields, identity };

    const last = state.steps[state.steps.length - 1];
    if (last && detector.sameStep(last.identity, identity)) return { status: 'same', fields, identity };
    const earlier = state.steps.find((s) => detector.sameStep(s.identity, identity, 0.8));
    if (earlier) return { status: 'cycle', fields, identity, matchedStep: earlier.step };

    // Fields already captured on an earlier step of the same page (accordions,
    // forms that keep previous sections visible) are not repeated.
    const priorKeys = new Set(state.steps.filter((s) => s.identity.path === identity.path).flatMap((s) => s.identity.keys));
    const newFields = fields.filter((f) => !wasCaptured(f) && !(priorKeys.has(f._key) && (f.name || f.id)));
    const skipped = fields.length - newFields.length;

    let exploration = null;
    if (explore && newFields.some(tracker.isProbeable)) {
      await setMessage(`Exploring conditional questions on step ${state.steps.length + 1}…`);
      try {
        exploration = await tracker.explore(newFields);
      } catch (e) {
        exploration = null;
        await store.update((s) => store.addWarning(s, `Conditional exploration failed: ${e.message}`));
      }
    }

    const stepNumber = state.steps.length + 1;
    let captured = null;
    await store.update((s) => {
      if (s.runId !== state.runId) return false;
      const built = buildStepFields(s, newFields, exploration);
      const title = detector.stepTitle(fields, indicator, formTitle) || (stepNumber === 1 ? formTitle : `Step ${stepNumber}`);
      captured = {
        step: stepNumber,
        title,
        url: U.safeUrl(location.href),
        identity,
        fields: built.fields,
        sections: sectionsOf(built.fields),
        fieldCount: built.fields.length,
        conditionalFieldCount: built.fields.filter((f) => f.conditional).length,
        repeatedFieldsOmitted: skipped || undefined,
        indicator: indicator.total ? { current: indicator.current, total: indicator.total } : undefined,
        capturedAt: Date.now(),
      };
      s.steps.push(captured);
      s.formTitle = s.formTitle || formTitle;
      s.conditionalLogic.push(...built.logic.map((l) => ({ step: stepNumber, ...l })));
      if (indicator.total && indicator.total > (s.detected.total || 0)) s.detected.total = indicator.total;
      if (indicator.titles.length > s.detected.titles.length) s.detected.titles = indicator.titles;
      if (exploration?.skippedTriggers?.length) {
        store.addWarning(s, `Step ${stepNumber}: conditional questions not explored (time or count limit): ${exploration.skippedTriggers.join(', ')}.`, stepNumber);
      }
      if (fields.some((f) => f.optionsSource === 'typeahead')) {
        store.addWarning(s, `Step ${stepNumber}: some dropdowns load options as you type, so their full option list cannot be enumerated.`, stepNumber);
      }
      s.message = `Step ${stepNumber} captured: ${captured.fieldCount} field${captured.fieldCount === 1 ? '' : 's'}${captured.conditionalFieldCount ? ` (${captured.conditionalFieldCount} conditional)` : ''}.`;
    });
    fields.forEach(markCaptured);
    for (const record of exploration?.revealed?.values() || []) markCaptured(record.field);
    U.flashElements(newFields.map((f) => f._proxy || f._el));
    return { status: 'captured', fields, identity, step: captured };
  }

  /** Add fields the user revealed on the current step (assisted mode). */
  async function mergeObservedFields(fields, identity, observedCondition) {
    await store.update((s) => {
      const last = s.steps[s.steps.length - 1];
      if (!last) return false;
      const known = new Set(last.identity.keys);
      const fresh = fields.filter((f) => !known.has(f._key) && !wasCaptured(f));
      if (!fresh.length) return false;
      const built = buildStepFields(s, fresh, null, observedCondition || { field: 'an earlier answer', option: 'a specific choice' });
      last.fields.push(...built.fields.map((f, i) => ({ ...f, order: last.fields.length + i + 1 })));
      last.identity.keys = [...new Set([...last.identity.keys, ...fresh.map((f) => f._key)])];
      last.fieldCount = last.fields.length;
      last.conditionalFieldCount = last.fields.filter((f) => f.conditional).length;
      last.sections = sectionsOf(last.fields);
      s.message = `Recorded ${fresh.length} field${fresh.length === 1 ? '' : 's'} revealed by your answer on step ${last.step}.`;
      fresh.forEach(markCaptured);
    });
  }

  // ── Finishing ───────────────────────────────────────────────────────
  const REASON_TEXT = {
    reached_final_step: 'Stopped before final submission.',
    no_further_steps: 'No further step was found.',
    stopped_by_user: 'Stopped by you.',
    cycle_detected: 'Navigation returned to an earlier step.',
    max_steps: 'Reached the configured step limit.',
    single_step: 'Single step scanned.',
  };

  function addRemainingStepsAsUnvisited(s, reason) {
    const captured = s.steps.length;
    const total = s.detected.total || 0;
    const titles = s.detected.titles || [];
    const capturedTitles = new Set(s.steps.map((st) => st.title.toLowerCase()));
    for (let n = captured + 1; n <= total; n++) {
      const title = titles[n - 1] || `Step ${n}`;
      if (capturedTitles.has(title.toLowerCase())) continue;
      if (s.unvisitedSteps.some((u) => u.title === title)) continue;
      s.unvisitedSteps.push({ title, reason });
    }
  }

  async function finish(reason, { warning, unvisited, status = 'complete' } = {}) {
    stopWatcher();
    await store.update((s) => {
      s.status = status;
      s.completionReason = reason;
      s.finishedAt = Date.now();
      s.blocker = null;
      s.pendingNavigation = null;
      if (warning) store.addWarning(s, warning);
      if (unvisited) s.unvisitedSteps.push(unvisited);
      addRemainingStepsAsUnvisited(s, unvisited?.reason || REASON_TEXT[reason] || 'Not reached.');
      const fieldTotal = s.steps.reduce((n, st) => n + st.fieldCount, 0);
      s.message = `${status === 'stopped' ? 'Stopped' : 'Done'} — ${s.steps.length} step${s.steps.length === 1 ? '' : 's'}, ${fieldTotal} field${fieldTotal === 1 ? '' : 's'} captured. ${REASON_TEXT[reason] || ''}`.trim();
    });
  }

  async function waitForUser(blocker, { unvisitedReason } = {}) {
    const consent = blocker.type === 'consent';
    await store.update((s) => {
      s.status = consent ? 'awaiting_consent' : 'awaiting_user';
      s.blocker = blocker;
      s.message = blocker.message;
      if (unvisitedReason) store.addWarning(s, unvisitedReason);
    });
    if (!consent) startWatcher();
  }

  // ── Control (pause / stop) ──────────────────────────────────────────
  async function controlRequested() {
    const ctrl = await store.readControl();
    return Boolean(ctrl && (ctrl.command === 'pause' || ctrl.command === 'stop'));
  }

  /** Apply a pending pause/stop. Returns true when the loop must exit. */
  async function applyControl() {
    const ctrl = await store.readControl();
    if (!ctrl) return false;
    await store.clearControl();
    if (ctrl.command === 'stop') {
      await finish('stopped_by_user', { status: 'stopped' });
      return true;
    }
    if (ctrl.command === 'pause') {
      stopWatcher();
      await store.update((s) => {
        s.status = 'paused';
        s.message = 'Paused. Resume to continue from this step.';
      });
      return true;
    }
    return false;
  }

  // ── Main loop ───────────────────────────────────────────────────────
  async function waitForPageReady() {
    await U.waitForDOMStability(250, 2500);
    await U.waitUntil(() => extractor.extractFields().length > 0 || detector.findActions([]).some((a) => a.category !== 'other'), 2500, 150);
  }

  async function runLoop(run) {
    if (loopRunning) return;
    loopRunning = true;
    try {
      while (run === activeRun) {
        const s = await store.load();
        if (!s || s.status !== 'running') return;
        if (await applyControl()) return;

        await waitForPageReady();
        const env = environment();

        if (s.mode === 'auto') {
          const allowed = policy.autoNavigationAllowed(location.href, await store.loadConsent());
          if (!allowed.allowed) {
            await waitForUser({
              type: 'consent',
              origin: allowed.origin || policy.originOf(location.href),
              message: `Waiting for your approval before filling or navigating ${allowed.origin || 'this site'}.`,
            });
            return;
          }
        }

        // Record a full-page navigation that happened before this page loaded.
        if (s.pendingNavigation) {
          const pending = s.pendingNavigation;
          await store.update((st) => {
            st.navigation.push({ fromStep: pending.fromStep, toStep: pending.fromStep + 1, action: pending.action, kind: 'full-page', choicesMade: pending.choices });
            st.pendingNavigation = null;
          });
        }

        // Auto mode only reaches this point on an authorised origin, so
        // exploring branches (which changes answers) is allowed here.
        const capture = await captureCurrentStep({ explore: s.mode === 'auto' && s.settings.exploreBranches });
        if (run !== activeRun) return;
        if (capture.status === 'cycle') {
          await store.update((st) => {
            const edge = st.navigation[st.navigation.length - 1];
            if (edge && edge.toStep === st.steps.length + 1) {
              edge.toStep = capture.matchedStep;
              edge.returnsToEarlierStep = true;
            }
          });
          await finish('cycle_detected', { warning: `The form returned to step ${capture.matchedStep}; stopping to avoid a navigation loop.` });
          return;
        }
        const current = await store.load();
        const stepNo = current.steps.length;

        const barriers = detector.detectBarriers(capture.fields);
        if (barriers.length) {
          await waitForUser({ type: barriers[0].type, message: barriers[0].message }, { unvisitedReason: `Step ${stepNo}: ${barriers[0].message}` });
          return;
        }

        const actions = detector.summarize(detector.findActions(capture.fields));
        if (!actions.next.length && actions.final.length && !actions.ambiguous.length) {
          await finish('reached_final_step', {
            unvisited: { title: 'Final submission', reason: `Stopped before "${actions.final[0].text}" — PracticeMode never performs final submission.` },
          });
          return;
        }
        if (current.steps.length >= (current.settings.maxSteps || 25)) {
          await finish('max_steps', { warning: `Reached the limit of ${current.settings.maxSteps} steps.` });
          return;
        }

        if (current.mode === 'assisted') {
          if (!actions.next.length && !actions.ambiguous.length && !actions.final.length) {
            await finish('no_further_steps');
            return;
          }
          await waitForUser({
            type: 'assisted',
            message: `Step ${stepNo} captured. Fill it in and move to the next step yourself — PracticeMode records each new step automatically.`,
          });
          return;
        }

        const result = await nav.advance({
          environment: env,
          maxRetries: current.settings.maxValidationRetries ?? 2,
          checkpoint: controlRequested,
          onProgress: (message) => setMessage(`Step ${stepNo}: ${message}`),
          onBeforeClick: ({ action }) => store.update((st) => {
            st.pendingNavigation = { fromStep: stepNo, action, at: Date.now() };
          }),
        });
        if (run !== activeRun) return;

        if (result.warnings?.length) await store.update((st) => result.warnings.forEach((w) => store.addWarning(st, `Step ${stepNo}: ${w}`, stepNo)));

        switch (result.status) {
          case 'advanced':
            await store.update((st) => {
              st.navigation.push({ fromStep: stepNo, toStep: stepNo + 1, action: result.action, kind: result.kind, choicesMade: result.choices.length ? result.choices : undefined });
              st.pendingNavigation = null;
              st.message = `Moved past step ${stepNo} via "${result.action}". Waiting for the next step…`;
            });
            continue;
          case 'final':
            await finish('reached_final_step', {
              unvisited: { title: 'Final submission', reason: `Stopped before "${result.action}" — PracticeMode never performs final submission.` },
            });
            return;
          case 'no_action':
            await finish('no_further_steps');
            return;
          case 'aborted':
            await store.update((st) => { st.pendingNavigation = null; });
            await applyControl();
            return;
          case 'confirm':
            await waitForUser({ type: 'ambiguous_action', message: result.reason, action: result.action });
            return;
          case 'manual':
            await waitForUser({ type: result.blocker || 'manual_input', message: `${result.reason} Then press Continue — or move to the next step yourself.`, fields: result.fields });
            return;
          default:
            await store.update((st) => { st.pendingNavigation = null; });
            await waitForUser({ type: 'validation', message: result.reason || 'Could not move to the next step.' });
            return;
        }
      }
    } catch (e) {
      console.error('[PracticeMode] extraction error', e);
      await store.update((s) => {
        s.status = 'error';
        s.message = `Error: ${e.message}`;
        store.addWarning(s, `Unexpected error: ${e.message}`);
      });
    } finally {
      loopRunning = false;
    }
  }

  // ── Watching for manual progress ────────────────────────────────────
  function stopWatcher() {
    if (!watcher) return;
    watcher.observer.disconnect();
    clearInterval(watcher.interval);
    document.removeEventListener('change', watcher.onChange, true);
    window.removeEventListener('popstate', watcher.schedule);
    window.removeEventListener('hashchange', watcher.schedule);
    clearTimeout(watcher.timer);
    watcher = null;
  }

  function startWatcher() {
    stopWatcher();
    let lastChoice = null;
    let busy = false;

    const check = async () => {
      if (busy || loopRunning) return;
      busy = true;
      try {
        const s = await store.load();
        if (!s || s.status !== 'awaiting_user') return;
        const fields = extractor.extractFields();
        const identity = detector.stepIdentity(fields, nav.quickTitle());
        const last = s.steps[s.steps.length - 1];
        if (!last || !detector.sameStep(last.identity, identity)) {
          stopWatcher();
          await store.update((st) => {
            if (st.pendingNavigation) st.pendingNavigation = null;
            st.navigation.push({ fromStep: st.steps.length, toStep: st.steps.length + 1, action: 'manual', kind: 'by-user' });
            st.status = 'running';
            st.blocker = null;
            st.message = 'New step detected — capturing…';
          });
          runLoop(++activeRun);
        } else if (s.mode === 'assisted' || s.blocker?.type === 'assisted') {
          await mergeObservedFields(fields, identity, lastChoice);
        }
      } finally {
        busy = false;
      }
    };

    const schedule = () => {
      clearTimeout(watcher?.timer);
      if (watcher) watcher.timer = setTimeout(tick, 450);
    };

    // Remember which choice the user made last, so a revealed field can be
    // attributed to it. Only option labels of choice fields are kept.
    const onChange = (event) => {
      const t = event.target;
      if (!(t instanceof Element) || U.isOwnUi(t)) return;
      if (t.matches('select')) lastChoice = { field: extractorLabel(t), option: U.cleanText(t.selectedOptions?.[0]?.label || '') };
      else if (t.matches('input[type="radio"], input[type="checkbox"]')) lastChoice = { field: extractorLabel(t), option: U.cleanText(t.labels?.[0]?.textContent || t.value) };
      schedule();
    };

    const observer = new MutationObserver((mutations) => {
      if (mutations.every((m) => U.isOwnUi(m.target))) return;
      schedule();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-expanded', 'aria-selected', 'disabled'] });
    document.addEventListener('change', onChange, true);
    window.addEventListener('popstate', schedule);
    window.addEventListener('hashchange', schedule);
    const tick = () => {
      if (!chrome.runtime?.id) { stopWatcher(); return; } // extension reloaded
      check().catch(() => {});
    };
    watcher = { observer, onChange, schedule, interval: setInterval(tick, 1500), timer: null };
    schedule();
  }

  function extractorLabel(input) {
    const field = extractor.extractFields().find((f) => f._el === input || f._optionEls?.includes(input));
    return field?.label || 'a previous question';
  }

  // ── Commands ────────────────────────────────────────────────────────
  async function start({ mode = 'auto', page } = {}) {
    await ensureContext();
    activeRun++;
    stopWatcher();
    await store.clearControl();
    const settings = await store.loadSettings();
    const state = store.createState({
      mode,
      settings,
      environment: environment(),
      frameId: store.context.frameId,
      isTopFrame: window.top === window,
      page,
    });
    state.message = mode === 'auto' ? 'Starting automatic extraction…' : 'Starting assisted extraction…';
    await store.replace(state);
    runLoop(activeRun);
    return { started: true };
  }

  async function scan({ page } = {}) {
    await ensureContext();
    activeRun++;
    stopWatcher();
    await store.clearControl();
    const settings = await store.loadSettings();
    const state = store.createState({ mode: 'scan', settings, environment: environment(), frameId: store.context.frameId, isTopFrame: window.top === window, page });
    state.message = 'Scanning the current step…';
    await store.replace(state);
    const allowed = policy.autoNavigationAllowed(location.href, await store.loadConsent()).allowed;
    await captureCurrentStep({ explore: allowed && settings.exploreBranches });
    await finish('single_step');
    return store.load();
  }

  async function resume({ mode } = {}) {
    await ensureContext();
    await store.clearControl();
    const s = await store.load();
    if (!s) return { resumed: false, reason: 'No extraction to resume.' };
    if (['complete', 'stopped'].includes(s.status)) return { resumed: false, reason: 'This extraction has finished.' };
    stopWatcher();
    await store.update((st) => {
      if (mode) st.mode = mode;
      st.status = 'running';
      st.blocker = null;
      st.message = 'Resuming…';
    });
    runLoop(++activeRun);
    return { resumed: true };
  }

  async function onControl() {
    // When no loop is running (waiting for the user, paused) apply pause/stop now.
    if (!loopRunning) {
      const s = await store.load();
      if (s && ['awaiting_user', 'awaiting_consent', 'paused', 'running'].includes(s.status)) await applyControl();
    }
    return { ok: true };
  }

  function probe() {
    const fields = extractor.extractFields();
    return {
      fieldCount: fields.length,
      isTop: window.top === window,
      title: detector.formTitle(),
      environment: policy.classifyOrigin(location.href),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'PM_ENGINE') return false;
    const handle = async () => {
      switch (message.action) {
        case 'probe': return probe();
        case 'start': return start(message);
        case 'scan': return scan(message);
        case 'resume': return resume(message);
        case 'control': return onControl();
        case 'discard':
          activeRun++;
          stopWatcher();
          return { ok: true };
        default: return { error: `Unknown engine action ${message.action}` };
      }
    };
    handle().then((value) => sendResponse({ success: true, value }), (e) => sendResponse({ success: false, error: e.message }));
    return true;
  });

  // ── Resume after a page load inside the same tab ────────────────────
  (async () => {
    const me = await ensureContext();
    if (!me) return;
    const s = await store.load();
    if (!s || s.frameId !== me.frameId) return;
    if (s.status === 'running') {
      runLoop(++activeRun);
    } else if (s.status === 'awaiting_user') {
      startWatcher();
    }
  })();

  PM.engine = { start, scan, resume, probe };
})();
