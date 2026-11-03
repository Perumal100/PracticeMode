// The form as learners will see it, for a reviewer to try before deciding.
// Answers stay in this dialog; "Check answers" runs the learners' checks
// without saving anything.
import { AlertCircle, CheckCircle2, CircleAlert, Eye, Loader2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertTitle } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { checkPreviewAnswers as defaultCheck } from '../../api/review.js';
import Question, { messagesByField } from '../practice/Question.jsx';
import { apiErrorMessage } from './FieldEditor.jsx';

export default function FormPreview({ form, open, onOpenChange, check = defaultCheck }) {
  const [values, setValues] = useState({});
  const [result, setResult] = useState({ busy: false, feedback: null, error: null });

  function change(fieldId, value) {
    setValues((current) => ({ ...current, [fieldId]: value }));
    setResult((r) => ({ ...r, feedback: null }));
  }

  function reset() {
    setValues({});
    setResult({ busy: false, feedback: null, error: null });
  }

  async function submit(event) {
    event.preventDefault();
    setResult({ busy: true, feedback: null, error: null });
    // Only fields still on the form; an edit may have removed one.
    const answers = Object.fromEntries(form.fields.filter((f) => values[f.id] != null).map((f) => [f.id, values[f.id]]));
    try {
      const data = await check(form.id, answers);
      setResult({ busy: false, feedback: data.validationFeedback, error: null });
    } catch (err) {
      setResult({ busy: false, feedback: null, error: apiErrorMessage(err, 'The answers could not be checked. Please try again.') });
    }
  }

  const messages = messagesByField(result.feedback ?? []);
  const issues = result.feedback?.length ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-4 p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2"><Eye className="size-4 text-muted-foreground" />Preview: {form.title}</DialogTitle>
          <DialogDescription>This is what learners will see. Try sample answers and check them; nothing is saved.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="contents">
          {result.feedback && (
            <div className="px-6">
              {issues
                ? <Alert variant="warning"><CircleAlert /><AlertTitle>{issues} answer{issues === 1 ? ' needs' : 's need'} attention. A learner would see the same messages.</AlertTitle></Alert>
                : <Alert variant="success"><CheckCircle2 /><AlertTitle>No problems found. These answers would pass.</AlertTitle></Alert>}
            </div>
          )}
          {result.error && <div className="px-6"><Alert variant="destructive"><AlertCircle />{result.error}</Alert></div>}
          <div className="divide-y border-y">
            {form.fields.map((field, index) => (
              <Question
                key={field.id}
                field={field}
                number={index + 1}
                value={values[field.id]}
                messages={messages[field.id]}
                onChange={(value) => change(field.id, value)}
              />
            ))}
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button variant="ghost" onClick={reset}><RotateCcw />Clear answers</Button>
            <Button type="submit" disabled={result.busy}>{result.busy && <Loader2 className="animate-spin" />}Check answers</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
