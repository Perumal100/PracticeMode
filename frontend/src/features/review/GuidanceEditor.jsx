// A reviewer writes the help learners see for one question: a hint in the
// original language (US-12) and, per language, a translated label and
// guidance (US-09). A language left empty has no translation, and learners
// are told so instead of being shown made-up text.
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Input, Label, Textarea } from '@/components/ui/input.jsx';

const ORIGINAL = 'en';

function initialValues(field, languages) {
  const translations = Object.fromEntries(languages.map(({ code }) => {
    const found = (field.translations ?? []).find((t) => t.language_code === code);
    return [code, { label: found?.translated_label ?? '', guidance: found?.guidance_text ?? '' }];
  }));
  return { hint: (field.hints ?? []).find((h) => h.language_code === ORIGINAL)?.text ?? '', translations };
}

export default function GuidanceEditor({ field, languages: allLanguages = [], open, onOpenChange, onSave }) {
  const languages = allLanguages.filter(({ code }) => code !== ORIGINAL);
  const [values, setValues] = useState(() => (field ? initialValues(field, languages) : null));
  const [state, setState] = useState({ busy: false, error: null });

  useEffect(() => {
    if (open && field) {
      setValues(initialValues(field, languages));
      setState({ busy: false, error: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, field]);

  if (!field || !values) return null;

  const setTranslation = (code, key) => (event) => setValues((current) => ({
    ...current, translations: { ...current.translations, [code]: { ...current.translations[code], [key]: event.target.value } },
  }));

  async function save(event) {
    event.preventDefault();
    setState({ busy: true, error: null });
    const translations = languages
      .map(({ code }) => ({ language_code: code, translated_label: values.translations[code].label.trim(), guidance_text: values.translations[code].guidance.trim() }))
      .filter((t) => t.translated_label || t.guidance_text);
    try {
      await onSave({ hint: values.hint.trim(), translations });
      onOpenChange(false);
    } catch (error) {
      setState({ busy: false, error: error?.status === 409 ? 'This form can no longer be changed.' : error?.body?.translations?.[0] ?? error?.body?.hint?.[0] ?? 'The guidance could not be saved. Please try again.' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={save} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Guidance for “{field.label}”</DialogTitle>
            <DialogDescription>Learners see the original label as it is. Leave anything you have not written empty; nothing is filled in for you.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="guidance-hint">Hint</Label>
            <Textarea id="guidance-hint" rows={3} maxLength={1000} value={values.hint} onChange={(e) => setValues((c) => ({ ...c, hint: e.target.value }))}
              placeholder="What this question expects, in plain words. For example: your first and last name, as on your ID." />
            <p className="text-xs text-muted-foreground">Shown when a learner opens the hint. Leave empty for no hint.</p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Translations</legend>
            <p className="text-xs text-muted-foreground">Fill in only the languages you can write accurately. A translated label appears under the original; translated guidance opens with the hint.</p>
            {languages.map(({ code, name }) => (
              <div key={code} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                <p className="text-sm font-medium" lang={code}>{name}</p>
                <div className="grid gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`label-${code}`} className="text-[13px] font-normal text-muted-foreground">Translated label</Label>
                    <Input id={`label-${code}`} lang={code} dir="auto" maxLength={300} value={values.translations[code].label} onChange={setTranslation(code, 'label')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`guidance-${code}`} className="text-[13px] font-normal text-muted-foreground">Guidance</Label>
                    <Textarea id={`guidance-${code}`} lang={code} dir="auto" rows={2} maxLength={1000} value={values.translations[code].guidance} onChange={setTranslation(code, 'guidance')} />
                  </div>
                </div>
              </div>
            ))}
          </fieldset>

          {state.error && <p role="alert" className="text-[13px] font-medium text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={state.busy}>{state.busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}Save guidance</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One line under a question: which guidance it has. */
export function GuidanceSummary({ field, languages = [] }) {
  const hint = (field.hints ?? []).some((h) => h.language_code === ORIGINAL);
  const names = Object.fromEntries(languages.map(({ code, name }) => [code, name]));
  const translated = (field.translations ?? []).map((t) => names[t.language_code] ?? t.language_code);
  if (!hint && !translated.length) return <span>No hint or translations</span>;
  return <span>{[hint && 'Hint', translated.length && `Translated: ${translated.join(', ')}`].filter(Boolean).join('; ')}</span>;
}
