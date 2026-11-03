/**
 * Dev tool: run one extraction against a fixture and print a summary.
 *   node tests/tools/extract.mjs <fixture.html> [auto|assisted|scan]
 *   DUMP=1 node tests/tools/extract.mjs test04_conditional_sections.html   (full JSON)
 */
import { launchExtension, openPage, command, waitForStatus, exportDoc } from '../e2e/helpers.mjs';
const fixture = process.argv[2] || 'test01_three_step_form.html';
const mode = process.argv[3] || 'auto';
const env = await launchExtension();
try {
  const { page, dialogs, tabId } = await openPage(env, `${env.base}/${fixture}`);
  page.on('console', (m) => { if (/PracticeMode|error/i.test(m.text())) console.log('[page]', m.text()); });
  console.log('start', JSON.stringify(await command(env, tabId, mode === 'scan' ? 'scan' : 'start', { mode })));
  const state = await waitForStatus(env, tabId, ['complete', 'stopped', 'error', 'awaiting_user', 'awaiting_consent'], 60000);
  const doc = await exportDoc(env, tabId);
  console.log('status', state.status, state.completionReason, '|', state.message, '| blocker', JSON.stringify(state.blocker));
  console.log('dialogs', dialogs);
  for (const s of doc.steps) console.log(`  step ${s.step} "${s.title}" ${s.url.split('/').pop()}:`, s.fields.map((f) => `${f.label}${f.required ? '*' : ''}[${f.type}${f.options ? ':' + f.options.length : ''}${f.conditional ? ':cond' : ''}]`).join(', '));
  console.log('nav', JSON.stringify(doc.navigation));
  console.log('logic', JSON.stringify(doc.conditionalLogic.map((l) => [l.triggerLabel, l.branches.map((b) => `${b.valueLabel}->${b.revealsFieldIds.length}`), l.coverage])));
  console.log('unvisited', JSON.stringify(doc.unvisitedSteps));
  console.log('warnings', JSON.stringify(doc.warnings));
  console.log('summary', JSON.stringify(doc.summary), doc.extraction.status);
  if (process.env.DUMP) console.log(JSON.stringify(doc, null, 2));
} finally {
  await env.close();
}
