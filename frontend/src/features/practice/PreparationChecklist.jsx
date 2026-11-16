// US-18: what to have ready before starting. Examples are made up and say so;
// a form with no checklist says that instead of inventing requirements.
import { ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx';

function Items({ items }) {
  if (!items.length) return <p className="px-5 py-4 text-sm text-muted-foreground">No preparation checklist is available for this form.</p>;
  return (
    <ol className="divide-y">
      {items.map((item) => (
        <li key={item.position} className="flex gap-2 px-5 py-3 text-sm">
          <span aria-hidden className="w-5 shrink-0 text-xs leading-5 tabular-nums text-muted-foreground">{item.position}.</span>
          <div className="min-w-0">
            <p>{item.description}</p>
            {item.fictional_example && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                <Badge variant="warning">Fictional example</Badge>
                <span>{item.fictional_example}</span>
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function PreparationChecklist({ items = [], collapsible = false }) {
  if (collapsible) {
    return (
      <details className="group rounded-lg border bg-card shadow-xs">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <ClipboardList className="size-4 text-muted-foreground" />Preparation checklist
          <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
          <span className="ml-auto hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
        </summary>
        <div className="border-t"><Items items={items} /></div>
      </details>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Before you start</CardTitle>
        <CardDescription>
          {items.length
            ? 'Have these ready. Every example is made up for practice; never enter your real details here.'
            : 'What to have ready for this form.'}
        </CardDescription>
      </CardHeader>
      <Items items={items} />
    </Card>
  );
}
