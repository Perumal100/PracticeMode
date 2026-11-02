/**
 * content/navigation_controller.js
 * Advances a form by one step: fill the required fields with fictional data,
 * choose a safe "Next"-type action, click it, and wait for the page to
 * meaningfully change (in-page re-render, client-side route change, or a
 * full page load). When the site rejects the sample values, the visible
 * validation feedback is read and alternative values are tried a small,
 * configurable number of times.
 *
 * It never clicks an action classified as final or ambiguous.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});
  const U = PM.utils;
  const { extractFields, harvestOptions } = PM.fieldExtractor;
  const populator = PM.fieldPopulator;
  const detector = PM.stepDetector;

  function quickTitle() {
    try { return detector.detectStepIndicator().activeTitle || ''; } catch (_) { return ''; }
  }

  function currentIdentity() {
    const fields = extractFields();
    return detector.stepIdentity(fields, quickTitle());
  }

  /**
   * Wait until the page shows a different step than `before`.
   * Resolves { changed: boolean, kind: 'in-page' | 'route-change' | 'full-page' }.
   * A full page load destroys this script; the pending navigation recorded
   * in the extraction state lets the next page continue.
   */
  function waitForStepChange(before, timeout = 10000) {
    return new Promise((resolve) => {
      const startHref = location.href;
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        clearInterval(poller);
        clearTimeout(timer);
        window.removeEventListener('pagehide', onHide);
        window.removeEventListener('beforeunload', onHide);
        resolve(value);
      };
      const onHide = () => finish({ changed: true, kind: 'full-page' });
      window.addEventListener('pagehide', onHide);
      window.addEventListener('beforeunload', onHide);

      let checking = false;
      const poller = setInterval(async () => {
        if (checking || finished) return;
        checking = true;
        try {
          const routeChanged = location.href !== startHref;
          const now = currentIdentity();
          if (routeChanged || !detector.sameStep(before, now)) {
            await U.waitForDOMStability(300, 3000);
            const settled = currentIdentity();
            if (routeChanged || !detector.sameStep(before, settled)) {
              finish({ changed: true, kind: routeChanged ? 'route-change' : 'in-page' });
            }
          }
        } finally {
          checking = false;
        }
      }, 200);
      const timer = setTimeout(() => finish({ changed: false }), timeout);
    });
  }

  async function fillUntilStable(environment, attempt, feedback, result) {
    let live = extractFields();
    if (live.some((f) => f._kind === 'custom-select' && !f.options?.length)) {
      await harvestOptions(live);
      live = extractFields();
    }
    const mergeOutcome = (outcome) => {
      result.filled.push(...outcome.filled);
      result.manual.push(...outcome.manual);
      result.failed.push(...outcome.failed);
      result.choices.push(...outcome.choices);
    };
    mergeOutcome(await populator.fillStep(live, {
      environment,
      attempt,
      targetKeys: feedback.invalidKeys,
      feedbackByKey: feedback.byKey,
    }));
    // A chosen answer can reveal further required questions; fill those too.
    for (let pass = 0; pass < 3 && !result.manual.length; pass++) {
      await U.waitForDOMStability(150, 900);
      const again = extractFields();
      const known = new Set(live.map((f) => f._key));
      const fresh = again.filter((f) => !known.has(f._key));
      if (!fresh.length) break;
      if (fresh.some((f) => f._kind === 'custom-select' && !f.options?.length)) await harvestOptions(fresh);
      mergeOutcome(await populator.fillStep(extractFields().filter((f) => !known.has(f._key)), { environment, attempt }));
      live = extractFields();
    }
    return live;
  }

  /**
   * Try to move from the current step to the next one.
   *
   * options:
   *   environment    'fixture' | 'production'
   *   maxRetries     validation retries after the first attempt
   *   checkpoint     async () => true when the user paused/stopped
   *   onBeforeClick  async ({ action }) => void, persisted before navigating
   *   onProgress     (message) => void
   *
   * Returns { status, reason?, blocker?, action?, kind?, choices, warnings }
   *   status: advanced | final | no_action | confirm | manual | unchanged |
   *           validation_blocked | aborted
   */
  async function advance({ environment, maxRetries = 2, checkpoint = async () => false, onBeforeClick = async () => {}, onProgress = () => {} }) {
    const warnings = [];
    const choices = [];
    let feedback = { byKey: new Map(), invalidKeys: new Set(), messages: [] };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (await checkpoint()) return { status: 'aborted', choices, warnings };

      onProgress(attempt === 0 ? 'Filling required fields with fictional data…' : `Retrying with different sample values (${attempt}/${maxRetries})…`);
      const fill = { filled: [], manual: [], failed: [], choices: [] };
      const live = await fillUntilStable(environment, attempt, feedback, fill);
      choices.push(...fill.choices);
      if (fill.failed.length) warnings.push(`Could not fill: ${fill.failed.map((f) => `"${f.field}" (${f.reason})`).join(', ')}`);
      if (fill.manual.length) {
        return {
          status: 'manual',
          reason: fill.manual.map((m) => m.reason).join(' '),
          blocker: fill.manual[0].blocker || 'manual_input',
          fields: fill.manual.map((m) => m.field),
          choices,
          warnings,
        };
      }

      if (await checkpoint()) return { status: 'aborted', choices, warnings };

      const actions = detector.summarize(detector.findActions(live));
      if (!actions.next.length) {
        if (actions.ambiguous.length) {
          return {
            status: 'confirm',
            action: actions.ambiguous[0].text,
            reason: `The only way forward is "${actions.ambiguous[0].text}", which might submit or save data. Click it yourself if you are sure it only moves to the next step.`,
            choices,
            warnings,
          };
        }
        if (actions.final.length) return { status: 'final', action: actions.final[0].text, choices, warnings };
        return { status: 'no_action', choices, warnings };
      }

      let target = actions.next[0];
      if (target.disabled) {
        // Dynamic forms enable Next once their own validation passes.
        const enabled = await U.waitUntil(() => !detector.isDisabled(target.el), 2500, 100);
        if (!enabled) {
          feedback = detector.validationFeedback(extractFields());
          // Treat every empty field as a candidate on the retry.
          warnings.push(`"${target.text}" stayed disabled after filling required fields.`);
          continue;
        }
      }

      const before = detector.stepIdentity(live, quickTitle());
      await onBeforeClick({ action: target.text });
      onProgress(`Clicking "${target.text}"…`);
      target.el.click();

      let change = await waitForStepChange(before, 9000);
      if (change.changed) return { status: 'advanced', action: target.text, kind: change.kind, choices, warnings };

      const afterFields = extractFields();
      feedback = detector.validationFeedback(afterFields);
      if (!feedback.messages.length && !feedback.invalidKeys.size) {
        change = await waitForStepChange(before, 4000);
        if (change.changed) return { status: 'advanced', action: target.text, kind: change.kind, choices, warnings };
        return {
          status: 'unchanged',
          action: target.text,
          reason: `Clicking "${target.text}" did not change the page and no validation message was shown. Continue manually if the form needs something PracticeMode cannot see.`,
          choices,
          warnings,
        };
      }
      warnings.push(`The site rejected the sample values: ${feedback.messages.slice(0, 3).join(' | ') || 'fields marked invalid'}`);
    }

    return {
      status: 'validation_blocked',
      reason: `The site still rejects the sample values after ${maxRetries} ${maxRetries === 1 ? 'retry' : 'retries'}: ${feedback.messages.slice(0, 2).join(' | ') || 'some fields remain invalid'}. Correct them yourself and press Continue.`,
      blocker: 'validation',
      choices,
      warnings,
    };
  }

  PM.navigationController = { advance, waitForStepChange, currentIdentity, quickTitle };
})();
