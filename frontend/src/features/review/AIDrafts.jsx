// AI drafts of hints and translations. A language model writes a first draft;
// the Form Reviewer reads, edits and approves it. Drafts never reach learners
// on their own, and a form is approved only once its drafts are reviewed.
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert.jsx';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Checkbox, Label } from '@/components/ui/input.jsx';

export function countDrafts(fields = []) {
  return fields.reduce((n, f) => n + (f.hints ?? []).filter((h) => h.ai_draft).length + (f.translations ?? []).filter((t) => t.ai_draft).length, 0);
}

export function aiErrorMessage(error) {
  if (error?.code === 'AI_NOT_CONFIGURED' || error?.code === 'AI_FAILED') return error.message;
  if (error?.status === 409) return 'This form can no longer be changed.';
  return 'The AI drafts could not be made. Please try again.';
}

function TranslateDialog({ languages, open, onOpenChange, onRun }) {
  const [chosen, setChosen] = useState(() => languages.map((l) => l.code));
  const toggle = (code) => setChosen((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Draft translations with AI</DialogTitle>
          <DialogDescription>
            Each question&rsquo;s label and hint is translated into the languages you choose. Questions that already have a translation keep it.
            Only the form&rsquo;s questions are sent, never a learner&rsquo;s answers.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="sr-only">Languages</legend>
          {languages.map(({ code, name }) => (
            <label key={code} htmlFor={`ai-lang-${code}`} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox id={`ai-lang-${code}`} checked={chosen.includes(code)} onChange={() => toggle(code)} />
              <span lang={code}>{name}</span>
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!chosen.length} onClick={() => onRun(chosen)}><Sparkles />Draft translations</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The two "Draft with AI" buttons. `onDraft(task, languages)` does the work. */
export function AIDraftButtons({ languages = [], busy, onDraft }) {
  const [translating, setTranslating] = useState(false);
  const others = languages.filter((l) => l.code !== 'en');
  return (
    <>
      <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => onDraft('hints')}>
        {busy === 'hints' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Sparkles />}
        {busy === 'hints' ? 'Drafting hints…' : 'Draft hints with AI'}
      </Button>
      <Button variant="outline" size="sm" disabled={Boolean(busy) || !others.length} onClick={() => setTranslating(true)}>
        {busy === 'translations' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Sparkles />}
        {busy === 'translations' ? 'Drafting translations…' : 'Draft translations with AI'}
      </Button>
      {translating && (
        <TranslateDialog languages={others} open onOpenChange={setTranslating} onRun={(codes) => { setTranslating(false); onDraft('translations', codes); }} />
      )}
    </>
  );
}

/** Shown while AI drafts wait: what that means and how to finish. */
export function DraftsBanner({ count, busy, onApproveAll, onDiscardAll }) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (!count) return null;
  return (
    <Alert variant="warning" className="mb-6">
      <Sparkles />
      <div className="flex flex-1 flex-col gap-3">
        <p>
          <span className="font-medium">{count} AI draft{count === 1 ? ' is' : 's are'} waiting for your review.</span>{' '}
          Learners do not see drafts, and the form cannot be approved until you approve or discard them. Open a question&rsquo;s
          hint and translations to read and correct one; saving it approves it.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onApproveAll} disabled={busy}>Approve all drafts</Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDiscard(true)} disabled={busy}>Discard all drafts</Button>
        </div>
      </div>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard all AI drafts?</AlertDialogTitle>
            <AlertDialogDescription>Every hint and translation still marked as an AI draft is removed. Guidance you approved or wrote yourself stays.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep drafts</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDiscardAll}>Discard drafts</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Alert>
  );
}
