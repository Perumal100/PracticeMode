/**
 * shared/copilot_ui.js
 * The copilot interface, rendered from the extraction state. Used by the
 * toolbar popup and by the on-page panel so both show exactly the same
 * progress, prompts and controls.
 *
 *   const ui = PracticeMode.copilotUI.mount(rootElement, { variant, actions });
 *   ui.render(model);
 *
 * model = {
 *   state,                      // extraction state for this tab (or null)
 *   page: { url, origin, kind } // kind: fixture | production | unsupported
 *   consent,                    // { [origin]: { grantedAt } }
 *   settings,                   // user settings
 *   ui: { consentPrompt, busy, error, notice }
 * }
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ACTIVE = new Set(['running', 'awaiting_user', 'awaiting_consent', 'paused']);
  const STATUS = {
    running: ['running', 'Extracting'],
    awaiting_user: ['waiting', 'Needs you'],
    awaiting_consent: ['waiting', 'Needs approval'],
    paused: ['waiting', 'Paused'],
    complete: ['done', 'Done'],
    stopped: ['', 'Stopped'],
    error: ['error', 'Error'],
  };

  const LOGO = '<svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M6 8h10M6 11h7M6 14h5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="14" r="2.5" fill="#fff" opacity=".9"/></svg>';

  function siteBadge(model) {
    const { page, consent } = model;
    if (page.kind === 'unsupported') return '<span class="pm-badge unsupported">Can\'t run on this page</span>';
    if (page.kind === 'fixture') return '<span class="pm-badge fixture">Test fixture · auto allowed</span>';
    if (consent?.[page.origin]) return '<span class="pm-badge approved">Approved for auto-navigation</span>';
    return '<span class="pm-badge external">External site · asks first</span>';
  }

  function header(model, variant) {
    const s = model.state;
    const [cls, label] = s ? STATUS[s.status] || ['', 'Ready'] : ['', 'Ready'];
    const panelButtons = variant === 'panel'
      ? `<button class="pm-icon-btn" data-action="minimize" title="Minimise" aria-label="Minimise">—</button>
         <button class="pm-icon-btn" data-action="close" title="Close" aria-label="Close">✕</button>`
      : '';
    return `<div class="pm-header">
      <div class="pm-logo">${LOGO}</div>
      <div class="pm-brand"><b>PracticeMode</b><span>Form extraction copilot</span></div>
      <span class="pm-chip ${cls}">${esc(label)}</span>${panelButtons}
    </div>`;
  }

  function siteCard(model) {
    const { page, consent, settings } = model;
    const revoke = page.kind === 'production' && consent?.[page.origin]
      ? ` <button class="pm-link" data-action="revokeConsent">Revoke</button>` : '';
    return `<div class="pm-card">
      <div class="pm-site"><span class="pm-site-origin" title="${esc(page.url)}">${esc(page.origin || 'This page')}</span>${siteBadge(model)}</div>
      ${revoke ? `<div class="pm-muted">Auto-navigation was approved for this site.${revoke}</div>` : ''}
      <label class="pm-toggle"><input type="checkbox" data-setting="autoNavigate" ${settings.autoNavigate ? 'checked' : ''}/>
        <span class="pm-toggle-text"><b>Enable safe auto-navigation</b><span>Fill fictional data and click Next. Never submits, pays, uploads or signs in.</span></span></label>
      <label class="pm-toggle"><input type="checkbox" data-setting="exploreBranches" ${settings.exploreBranches ? 'checked' : ''}/>
        <span class="pm-toggle-text"><b>Explore conditional questions</b><span>Try each answer of choice questions to find hidden follow-ups.</span></span></label>
    </div>`;
  }

  function primaryActions(model) {
    const active = model.state && ACTIVE.has(model.state.status);
    const disabled = active || model.page.kind === 'unsupported' || model.ui.busy ? 'disabled' : '';
    const extractLabel = model.settings.autoNavigate ? 'Extract complete form' : 'Extract (assisted)';
    return `<div class="pm-actions">
      <button class="pm-btn pm-btn-secondary" data-action="scan" ${disabled}>Scan current step</button>
      <button class="pm-btn pm-btn-primary" data-action="extract" ${disabled}>${esc(extractLabel)}</button>
    </div>`;
  }

  function consentCard(model) {
    const s = model.state;
    const waiting = s?.status === 'awaiting_consent';
    if (!model.ui.consentPrompt && !waiting) return '';
    const origin = waiting ? s.blocker?.origin : model.page.origin;
    return `<div class="pm-alert amber" role="alertdialog" aria-label="Approval needed">
      <div><b>Approval needed for ${esc(origin)}</b></div>
      <div>${esc(PM.safetyPolicy.CONSENT_EXPLANATION)}</div>
      <div class="pm-row">
        <button class="pm-btn pm-btn-warn pm-btn-small" data-action="${waiting ? 'grantAndResume' : 'grantAndStart'}" data-origin="${esc(origin)}">Allow on this site</button>
        <button class="pm-btn pm-btn-secondary pm-btn-small" data-action="${waiting ? 'switchAssisted' : 'startAssisted'}">Assisted mode instead</button>
        <button class="pm-btn pm-btn-ghost pm-btn-small" data-action="${waiting ? 'stop' : 'cancelConsent'}">Cancel</button>
      </div>
      <div class="pm-muted">Assisted mode: you fill and navigate yourself; PracticeMode only records each step's structure.</div>
    </div>`;
  }

  function blockerCard(state) {
    if (state.status !== 'awaiting_user' || !state.blocker) return '';
    const b = state.blocker;
    if (b.type === 'assisted') {
      return `<div class="pm-alert blue"><div><b>Assisted mode</b> — ${esc(b.message)}</div>
        <div class="pm-row"><button class="pm-btn pm-btn-secondary pm-btn-small" data-action="stop">Finish &amp; keep results</button></div></div>`;
    }
    const hard = ['captcha', 'auth', 'identity_verification'].includes(b.type);
    const continueLabel = b.type === 'ambiguous_action' ? 'I clicked it — continue' : hard ? 'I completed it — continue' : 'Continue';
    return `<div class="pm-alert ${hard ? 'red' : 'amber'}" role="status">
      <div><b>Your action is needed.</b> ${esc(b.message)}</div>
      <div class="pm-row">
        <button class="pm-btn pm-btn-warn pm-btn-small" data-action="resume">${esc(continueLabel)}</button>
        ${hard ? '' : '<button class="pm-btn pm-btn-secondary pm-btn-small" data-action="switchAssisted">Switch to assisted</button>'}
        <button class="pm-btn pm-btn-ghost pm-btn-small" data-action="stop">Stop</button>
      </div>
      <div class="pm-muted">Moving to the next step yourself also continues the extraction.</div>
    </div>`;
  }

  function progress(state) {
    const steps = state.steps || [];
    const fields = steps.reduce((n, s) => n + (s.fieldCount || 0), 0);
    const detected = Math.max(state.detected?.total || 0, steps.length);
    const active = ACTIVE.has(state.status);
    const pct = detected ? Math.min(100, Math.round((steps.length / detected) * 100)) : 0;
    const indeterminate = state.status === 'running' && !state.detected?.total;
    const finishedPct = ['complete', 'stopped'].includes(state.status) ? 100 : pct;
    return `<div class="pm-card">
      <div class="pm-stats">
        <div class="pm-stat"><b>${state.detected?.total ? detected : '?'}</b><span>Detected</span></div>
        <div class="pm-stat"><b>${steps.length}</b><span>Captured</span></div>
        <div class="pm-stat"><b>${fields}</b><span>Fields</span></div>
        <div class="pm-stat"><b>${steps.length ? steps.length : '—'}</b><span>Current</span></div>
      </div>
      <div class="pm-bar ${indeterminate ? 'indeterminate' : ''}"><div style="width:${finishedPct}%"></div></div>
      <div class="pm-message" aria-live="polite">${esc(state.message || '')}</div>
      ${active ? `<div class="pm-muted">Approval needed: <b>${state.status === 'awaiting_user' || state.status === 'awaiting_consent' ? 'Yes' : 'No'}</b> · Mode: ${esc(state.mode)}</div>` : ''}
    </div>`;
  }

  function timeline(state) {
    const steps = state.steps || [];
    const active = ACTIVE.has(state.status);
    const items = steps.map((s, i) => {
      const isActive = active && i === steps.length - 1;
      const meta = [`${s.fieldCount} field${s.fieldCount === 1 ? '' : 's'}`];
      if (s.conditionalFieldCount) meta.push(`${s.conditionalFieldCount} conditional`);
      if (s.sections?.length) meta.push(`${s.sections.length} section${s.sections.length === 1 ? '' : 's'}`);
      return `<li class="pm-step ${isActive ? 'active' : 'done'}"><span class="pm-step-dot">${isActive ? s.step : '✓'}</span>
        <span class="pm-step-body"><span class="pm-step-title">${esc(s.title)}</span><span class="pm-step-meta">${esc(meta.join(' · '))}</span></span></li>`;
    });
    const capturedTitles = new Set(steps.map((s) => (s.title || '').toLowerCase()));
    const pendingTitles = (state.detected?.titles || []).slice(steps.length).filter((t) => !capturedTitles.has(t.toLowerCase()));
    const unvisited = state.unvisitedSteps || [];
    if (!['complete', 'stopped'].includes(state.status)) {
      pendingTitles.forEach((t, i) => items.push(`<li class="pm-step unvisited"><span class="pm-step-dot">${steps.length + i + 1}</span>
        <span class="pm-step-body"><span class="pm-step-title">${esc(t)}</span><span class="pm-step-meta">Not visited yet</span></span></li>`));
    }
    unvisited.forEach((u) => items.push(`<li class="pm-step unvisited"><span class="pm-step-dot">○</span>
      <span class="pm-step-body"><span class="pm-step-title">${esc(u.title)}</span><span class="pm-step-meta" title="${esc(u.reason)}">${esc(u.reason)}</span></span></li>`));
    if (!items.length) return '';
    return `<div class="pm-card"><div class="pm-section-title">Steps</div><ol class="pm-timeline">${items.join('')}</ol></div>`;
  }

  function warnings(state, openState) {
    const list = state.warnings || [];
    if (!list.length) return '';
    return `<details class="pm-details" data-details="warnings" ${openState ? 'open' : ''}>
      <summary>${list.length} warning${list.length === 1 ? '' : 's'}</summary>
      <ul class="pm-warnings">${list.slice(-20).reverse().map((w) => `<li>${w.step ? `Step ${w.step}: ` : ''}${esc(w.message.replace(/^Step \d+: /, ''))}</li>`).join('')}</ul>
    </details>`;
  }

  function controls(state, settings) {
    const st = state.status;
    const pauseOrResume = st === 'running'
      ? '<button class="pm-btn pm-btn-secondary pm-btn-small" data-action="pause">Pause extraction</button>'
      : st === 'paused'
        ? '<button class="pm-btn pm-btn-primary pm-btn-small" data-action="resume">Resume extraction</button>'
        : '';
    const stop = ACTIVE.has(st) ? '<button class="pm-btn pm-btn-danger pm-btn-small" data-action="stop">Stop extraction</button>' : '';
    const discard = st !== 'running' ? '<button class="pm-btn pm-btn-ghost pm-btn-small" data-action="discard" title="Delete the temporary extraction state">Discard</button>' : '';
    const hasSteps = (state.steps || []).length > 0;
    const complete = st === 'complete';
    return `${pauseOrResume || stop ? `<div class="pm-row">${pauseOrResume}${stop}</div>` : ''}
      <div class="pm-row">
        <button class="pm-btn pm-btn-secondary pm-btn-small" data-action="download" ${hasSteps ? '' : 'disabled'} title="Download what has been captured so far">Export partial results</button>
        <button class="pm-btn pm-btn-success pm-btn-small" data-action="download" ${complete && hasSteps ? '' : 'disabled'} title="Available when extraction has finished">Download complete JSON</button>
      </div>
      <div class="pm-row">
        <button class="pm-btn pm-btn-secondary pm-btn-small" data-action="preview" ${hasSteps ? '' : 'disabled'}>Preview form</button>
        ${discard}
      </div>
      <div class="pm-card">
        <div class="pm-section-title">Import for review</div>
        <label class="pm-muted">PracticeMode server
          <input class="pm-input" type="url" data-setting-text="backendUrl" value="${esc(settings.backendUrl)}" spellcheck="false"/></label>
        <button class="pm-btn pm-btn-primary pm-btn-small" data-action="send" ${hasSteps && st !== 'running' ? '' : 'disabled'}
          title="Send the captured structure (never answers) to PracticeMode as a form awaiting review">Send to PracticeMode for review</button>
        <div class="pm-muted">Sign in to PracticeMode as a Form Reviewer in this browser first.</div>
      </div>`;
  }

  function mount(root, { variant = 'popup', actions = {} } = {}) {
    let warningsOpen = false;
    let lastModel = null;

    root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target || !root.contains(target) || target.disabled) return;
      event.preventDefault();
      actions[target.dataset.action]?.({ ...target.dataset });
    });
    root.addEventListener('change', (event) => {
      const input = event.target.closest('[data-setting]');
      if (input) actions.setSetting?.(input.dataset.setting, input.checked);
      const text = event.target.closest('[data-setting-text]');
      if (text) actions.setSetting?.(text.dataset.settingText, text.value.trim());
    });
    root.addEventListener('toggle', (event) => {
      if (event.target.dataset?.details === 'warnings') warningsOpen = event.target.open;
    }, true);

    function render(model) {
      lastModel = model;
      // Re-rendering replaces the markup; wait until the server address is no longer being typed.
      // getRootNode() is the shadow root for the on-page panel, the document for the popup.
      const focused = root.getRootNode().activeElement;
      if (focused && root.contains(focused) && focused.matches('[data-setting-text]')) return;
      const s = model.state;
      const parts = [
        header(model, variant),
        siteCard(model),
        primaryActions(model),
        model.ui.error ? `<div class="pm-alert red" role="alert">${esc(model.ui.error)}</div>` : '',
        model.ui.notice ? `<div class="pm-alert blue">${esc(model.ui.notice)}</div>` : '',
        consentCard(model),
      ];
      if (s) {
        parts.push(blockerCard(s), progress(s), timeline(s), warnings(s, warningsOpen), controls(s, model.settings));
      } else {
        parts.push(`<div class="pm-muted">Open a page with a form, then scan one step or extract the whole form. Nothing is sent anywhere except the page itself, until you send a capture to PracticeMode for review.</div>`);
      }
      if (variant === 'popup') {
        parts.push(`<div class="pm-footer"><span>Extracts structure only — never your answers.</span>
          <button class="pm-link" data-action="openPanel" ${model.page.kind === 'unsupported' ? 'disabled' : ''}>Open on-page copilot</button></div>`);
      }
      root.innerHTML = `<div class="pm pm-${variant}">${parts.filter(Boolean).join('')}</div>`;
    }

    return { render, get model() { return lastModel; } };
  }

  PM.copilotUI = { mount, esc };
})();
