// US-18: the reviewer lists what a learner should have ready. Examples are
// always fictional; learners see each one labelled that way.
import { Loader2, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Input, Label } from '@/components/ui/input.jsx';

const blank = () => ({ description: '', fictional_example: '' });

export default function ChecklistEditor({ initial = [], onSave }) {
  const [items, setItems] = useState(() => initial.map(({ description, fictional_example }) => ({ description, fictional_example })));
  const [state, setState] = useState({ busy: false, error: null, saved: false });

  const update = (index, key) => (event) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [key]: event.target.value } : item)));
    setState((s) => ({ ...s, saved: false }));
  };

  async function save() {
    const cleaned = items.map((i) => ({ description: i.description.trim(), fictional_example: i.fictional_example.trim() }));
    if (cleaned.some((i) => !i.description)) {
      setState({ busy: false, error: 'Each item needs a description, or remove it.', saved: false });
      return;
    }
    setState({ busy: true, error: null, saved: false });
    try {
      await onSave(cleaned);
      setState({ busy: false, error: null, saved: true });
    } catch (error) {
      setState({ busy: false, error: error?.status === 409 ? 'This form can no longer be changed.' : 'The checklist could not be saved. Please try again.', saved: false });
    }
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-[13px] text-muted-foreground">No checklist yet. Learners are told that none is available.</p>}
      <ol className="space-y-3">
        {items.map((item, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <li key={index} className="space-y-2 rounded-md border p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">Item {index + 1}</span>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => setItems((c) => c.filter((_, i) => i !== index))} aria-label={`Remove item ${index + 1}`}><X /></Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`check-${index}`} className="text-[13px] font-normal">What to have ready</Label>
              <Input id={`check-${index}`} maxLength={300} value={item.description} onChange={update(index, 'description')} placeholder="A photo ID, such as a passport" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`example-${index}`} className="text-[13px] font-normal">Fictional example (optional)</Label>
              <Input id={`example-${index}`} maxLength={300} value={item.fictional_example} onChange={update(index, 'fictional_example')} placeholder="Sample licence D000-0000-0000" />
            </div>
          </li>
        ))}
      </ol>
      {state.error && <p role="alert" className="text-[13px] font-medium text-destructive">{state.error}</p>}
      {state.saved && <p role="status" className="text-[13px] font-medium text-success">Checklist saved.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setItems((c) => [...c, blank()])}><Plus />Add item</Button>
        <Button size="sm" onClick={save} disabled={state.busy}>{state.busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}Save checklist</Button>
      </div>
    </div>
  );
}
