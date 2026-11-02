/**
 * shared/copilot_styles.js
 * Styles for the copilot UI. Kept as a string so the same rules can be
 * injected into the popup document and into the on-page panel's shadow
 * root without exposing extension files to web pages.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});

  PM.copilotStyles = `
.pm {
  --bg: #0f1117; --surface: #171c28; --surface2: #1e2436; --border: rgba(255,255,255,.09);
  --accent: #6366f1; --accent2: #8b5cf6; --green: #10b981; --amber: #f59e0b; --red: #ef4444; --blue: #60a5fa;
  --text: #e8eaf2; --muted: #8b93a8; --radius: 10px;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  color: var(--text); background: var(--bg);
  display: flex; flex-direction: column; gap: 10px; padding: 14px; box-sizing: border-box;
  -webkit-font-smoothing: antialiased; text-align: left; letter-spacing: normal;
}
.pm *, .pm *::before, .pm *::after { box-sizing: border-box; margin: 0; padding: 0; font: inherit; color: inherit; }
/* :where() keeps the reset at zero specificity so .pm-btn-* colours win. */
.pm :where(button) { cursor: pointer; border: none; background: none; }
.pm :where(button):disabled { opacity: .45; cursor: not-allowed; }
.pm button:focus-visible, .pm input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.pm-header { display: flex; align-items: center; gap: 9px; }
.pm-logo { width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0; display: grid; place-items: center;
  background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 2px 8px rgba(99,102,241,.35); }
.pm-brand { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.pm-brand b { font-size: 14px; font-weight: 700; color: #fff; }
.pm-brand span { font-size: 10.5px; color: var(--muted); }
.pm-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 11px;
  background: var(--surface2); border: 1px solid var(--border); color: var(--muted); white-space: nowrap; }
.pm-chip::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
.pm-chip.running::before { background: var(--accent); box-shadow: 0 0 6px var(--accent); animation: pm-pulse 1.2s infinite; }
.pm-chip.waiting::before { background: var(--amber); }
.pm-chip.done::before { background: var(--green); }
.pm-chip.error::before { background: var(--red); }
@keyframes pm-pulse { 50% { opacity: .35; } }
.pm-icon-btn { width: 26px; height: 26px; border-radius: 6px; display: grid; place-items: center; color: var(--muted); }
.pm-icon-btn:hover { background: var(--surface2); color: var(--text); }

.pm-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.pm-site { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.pm-site-origin { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pm-badge { font-size: 10.5px; padding: 2px 8px; border-radius: 20px; white-space: nowrap; border: 1px solid; }
.pm-badge.fixture { color: #34d399; border-color: rgba(16,185,129,.35); background: rgba(16,185,129,.08); }
.pm-badge.approved { color: #a5b4fc; border-color: rgba(99,102,241,.4); background: rgba(99,102,241,.1); }
.pm-badge.external { color: #fbbf24; border-color: rgba(245,158,11,.35); background: rgba(245,158,11,.08); }
.pm-badge.unsupported { color: #f87171; border-color: rgba(239,68,68,.35); background: rgba(239,68,68,.08); }
.pm-link { color: #a5b4fc; text-decoration: underline; font-size: 11px; }

.pm-toggle { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.pm-toggle input { appearance: none; -webkit-appearance: none; width: 32px; height: 18px; border-radius: 10px; background: #374151; position: relative; flex-shrink: 0; cursor: pointer; transition: background .2s; margin-top: 1px; }
.pm-toggle input::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .2s; }
.pm-toggle input:checked { background: var(--accent); }
.pm-toggle input:checked::after { transform: translateX(14px); }
.pm-toggle-text { display: flex; flex-direction: column; }
.pm-toggle-text b { font-weight: 600; }
.pm-toggle-text span { font-size: 11px; color: var(--muted); }

.pm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pm-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 10px; border-radius: 8px; font-weight: 600; font-size: 12.5px; transition: filter .15s, background .15s; text-align: center; }
.pm-btn:hover:not(:disabled) { filter: brightness(1.12); }
.pm-btn-primary { background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #fff; }
.pm-btn-secondary { background: var(--surface2); border: 1px solid var(--border); }
.pm-btn-success { background: var(--green); color: #fff; }
.pm-btn-warn { background: var(--amber); color: #111; }
.pm-btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--muted); }
.pm-btn-danger { background: transparent; border: 1px solid rgba(239,68,68,.4); color: #f87171; }
.pm-btn-small { padding: 6px 9px; font-size: 11.5px; }
.pm-row { display: flex; gap: 8px; flex-wrap: wrap; }
.pm-row > .pm-btn { flex: 1; }

.pm-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.pm-stat { background: var(--surface2); border-radius: 7px; padding: 6px 4px; text-align: center; }
.pm-stat b { display: block; font-size: 16px; font-weight: 700; color: #fff; }
.pm-stat span { font-size: 9.5px; text-transform: uppercase; letter-spacing: .4px; color: var(--muted); }
.pm-bar { height: 4px; background: var(--surface2); border-radius: 4px; overflow: hidden; }
.pm-bar > div { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); transition: width .4s; }
.pm-bar.indeterminate > div { width: 35% !important; animation: pm-slide 1.3s infinite ease-in-out; }
@keyframes pm-slide { from { transform: translateX(-100%); } to { transform: translateX(300%); } }
.pm-message { font-size: 12px; color: #c7cbe0; }

.pm-alert { border-radius: 8px; padding: 9px 10px; font-size: 12px; display: flex; flex-direction: column; gap: 8px; }
.pm-alert.amber { background: rgba(245,158,11,.09); border: 1px solid rgba(245,158,11,.3); color: #fcd34d; }
.pm-alert.blue { background: rgba(96,165,250,.08); border: 1px solid rgba(96,165,250,.3); color: #bfdbfe; }
.pm-alert.red { background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.3); color: #fca5a5; }
.pm-alert b { color: #fff; }

.pm-timeline { list-style: none; display: flex; flex-direction: column; gap: 2px; max-height: 210px; overflow-y: auto; }
.pm-step { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-radius: 6px; }
.pm-step-dot { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
.pm-step.done .pm-step-dot { background: rgba(16,185,129,.15); color: #34d399; }
.pm-step.active .pm-step-dot { background: rgba(99,102,241,.2); color: #a5b4fc; box-shadow: 0 0 0 2px rgba(99,102,241,.4); }
.pm-step.unvisited .pm-step-dot { background: var(--surface2); color: var(--muted); }
.pm-step-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.pm-step-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-step.unvisited .pm-step-title { color: var(--muted); font-weight: 500; }
.pm-step-meta { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }

.pm-details summary { cursor: pointer; font-size: 12px; color: var(--muted); list-style: none; }
.pm-details summary::-webkit-details-marker { display: none; }
.pm-details summary::before { content: "▸ "; }
.pm-details[open] summary::before { content: "▾ "; }
.pm-warnings { list-style: none; display: flex; flex-direction: column; gap: 4px; margin-top: 6px; max-height: 140px; overflow-y: auto; }
.pm-warnings li { font-size: 11.5px; color: #fcd34d; padding-left: 10px; border-left: 2px solid rgba(245,158,11,.4); }
.pm-section-title { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); font-weight: 600; }
.pm-muted { color: var(--muted); font-size: 11.5px; }
.pm-footer { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--muted); }
`;
})();
