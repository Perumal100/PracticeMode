/**
 * shared/export_builder.js
 * Builds the consolidated JSON document from an extraction state.
 * Pure function, loaded by the content scripts, the popup and the service
 * worker so every download is identical.
 *
 * The format is an interchange format for the extracted structure only;
 * PracticeMode's own storage, normalisation and rendering formats are
 * decided separately (API-15 import validates and normalises it).
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});

  const SCHEMA = 'practicemode.form-extraction/v1';
  const EXTRACTOR = { name: 'PracticeMode Form Extractor', version: '3.0.0' };

  const COMPLETE_REASONS = new Set(['reached_final_step', 'no_further_steps']);

  function extractionStatus(state) {
    if (state.mode === 'scan') return 'single_step';
    if (state.status === 'complete' && COMPLETE_REASONS.has(state.completionReason)) {
      const blocked = (state.unvisitedSteps || []).some((u) => u.title !== 'Final submission');
      const partialBranches = (state.conditionalLogic || []).some((l) => l.coverage === 'partial');
      return blocked || partialBranches ? 'partial' : 'complete';
    }
    return 'partial';
  }

  function buildExport(state) {
    if (!state) return null;
    const steps = (state.steps || []).map((s) => ({
      step: s.step,
      title: s.title,
      url: s.url,
      ...(s.indicator ? { indicator: s.indicator } : {}),
      fieldCount: s.fieldCount,
      sections: s.sections || [],
      fields: s.fields || [],
      ...(s.repeatedFieldsOmitted ? { repeatedFieldsOmitted: s.repeatedFieldsOmitted } : {}),
    }));
    const totalFields = steps.reduce((n, s) => n + s.fields.length, 0);
    const conditionalFields = steps.reduce((n, s) => n + s.fields.filter((f) => f.conditional).length, 0);
    const detectedSteps = Math.max(state.detected?.total || 0, steps.length);

    const unvisited = [...(state.unvisitedSteps || [])];
    if (state.blocker && !['complete', 'stopped'].includes(state.status)) {
      unvisited.push({ title: `After step ${steps.length}`, reason: state.blocker.message });
    }

    return {
      schema: SCHEMA,
      formTitle: state.formTitle || steps[0]?.title || 'Untitled form',
      source: {
        url: state.startUrl,
        origin: state.origin,
        environment: state.environment,
      },
      extraction: {
        status: extractionStatus(state),
        state: state.status,
        completionReason: state.completionReason || null,
        mode: state.mode,
        startedAt: state.startedAt ? new Date(state.startedAt).toISOString() : null,
        finishedAt: state.finishedAt ? new Date(state.finishedAt).toISOString() : null,
        extractor: EXTRACTOR,
      },
      summary: {
        detectedSteps,
        capturedSteps: steps.length,
        totalFields,
        conditionalFields,
        stepTitlesDetected: state.detected?.titles || [],
        warnings: (state.warnings || []).length,
      },
      steps,
      navigation: state.navigation || [],
      conditionalLogic: state.conditionalLogic || [],
      unvisitedSteps: unvisited,
      warnings: (state.warnings || []).map((w) => ({ step: w.step, message: w.message })),
    };
  }

  function fileName(exportDoc) {
    const slug = String(exportDoc?.formTitle || 'form').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'form';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const kind = exportDoc?.extraction?.status === 'complete' ? 'complete' : exportDoc?.extraction?.status === 'single_step' ? 'step' : 'partial';
    return `practicemode_${slug}_${kind}_${stamp}.json`;
  }

  PM.exportBuilder = { buildExport, fileName, extractionStatus, SCHEMA };
})();
