// Guidance a person wrote for a field (US-12). A field without any returns
// null, and the question then shows no hint control at all.
export const ORIGINAL_LANGUAGE = 'en';

export function hintFor(field) {
  const hint = (field.hints ?? []).find((h) => h.language_code === ORIGINAL_LANGUAGE);
  return hint ? { text: hint.text, languageCode: hint.language_code } : null;
}
