// Guidance people wrote for a field: hints (US-12) and translations (US-09).
// Nothing here is generated; what was not written is reported as missing.
export const ORIGINAL_LANGUAGE = 'en';
const KEY = 'pm_guidance_language_v1';

// A learner has no profile to keep a preference in, so the browser remembers it.
export function storedLanguage() {
  try {
    return window.localStorage.getItem(KEY) || ORIGINAL_LANGUAGE;
  } catch {
    return ORIGINAL_LANGUAGE;
  }
}

export function rememberLanguage(code) {
  try {
    window.localStorage.setItem(KEY, code);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

const inLanguage = (list, code) => (list ?? []).find((item) => item.language_code === code);

/** What to show for one field in the chosen language, with the original to fall back on. */
export function guidanceFor(field, language = ORIGINAL_LANGUAGE) {
  const originalHint = inLanguage(field.hints, ORIGINAL_LANGUAGE)?.text ?? null;
  if (language === ORIGINAL_LANGUAGE) {
    return { translatedLabel: null, translated: [], originalHint, hasGuidance: Boolean(originalHint) };
  }
  const translation = inLanguage(field.translations, language);
  const translated = [translation?.guidance_text, inLanguage(field.hints, language)?.text].filter(Boolean);
  return {
    translatedLabel: translation?.translated_label || null,
    translated,
    originalHint,
    hasGuidance: translated.length > 0 || Boolean(originalHint),
  };
}

export function formHasLanguage(fields, language) {
  return fields.some((field) => inLanguage(field.translations, language) || inLanguage(field.hints, language));
}
