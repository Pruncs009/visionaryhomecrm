'use client';

import { useId, useState, useTransition } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { keyDatesFor, type DateKey } from '../constants';
import { updateDealDates } from '../date-actions';

type Dates = Partial<Record<DateKey, string>>;

/**
 * Opens the deal's key dates in a dialog. Used for the "+" on the Dates panel
 * (`variant="plus"`) and for each row's "Add" link (`variant="add"`, which
 * focuses that date).
 */
export function EditDatesButton({ txId, dates, focusKey, variant, split = false }: {
  txId: string;
  dates: Partial<Record<DateKey, string | null>>;
  focusKey?: DateKey;
  variant: 'plus' | 'add';
  /** A-C deal: A-B and B-C dates. */
  split?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {variant === 'plus' ? (
        <DialogPrimitive.Trigger aria-label="Add or change dates" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <Plus className="size-4" />
        </DialogPrimitive.Trigger>
      ) : (
        <DialogPrimitive.Trigger className="text-xs font-semibold text-primary uppercase hover:underline">Add</DialogPrimitive.Trigger>
      )}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-popover p-5 text-popover-foreground ring-1 ring-foreground/10 outline-none">
          {open && <DatesForm txId={txId} dates={dates} focusKey={focusKey} split={split} onDone={() => setOpen(false)} />}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DatesForm({ txId, dates, focusKey, split, onDone }: {
  txId: string;
  dates: Partial<Record<DateKey, string | null>>;
  focusKey?: DateKey;
  split: boolean;
  onDone: () => void;
}) {
  const keys = keyDatesFor(split);
  const uid = useId();
  const [values, setValues] = useState<Dates>(
    () => Object.fromEntries(keys.map((k) => [k.key, dates[k.key]?.slice(0, 10) ?? ''])) as Dates,
  );
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await updateDealDates(txId, values);
      if (r.ok) {
        toast.success('Dates saved');
        onDone();
        return;
      }
      setErrors(r.fieldErrors ?? {});
      setFormError(r.error ?? null);
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <DialogPrimitive.Title className="text-base font-semibold">Dates</DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">The next upcoming date drives the countdown on this deal.</DialogPrimitive.Description>
        </div>
        <DialogPrimitive.Close aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></DialogPrimitive.Close>
      </div>

      {formError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {keys.map((k) => (
          <div key={k.key} className="space-y-1.5">
            <label htmlFor={`${uid}-${k.key}`} className="text-sm font-medium">{k.label}</label>
            <Input
              id={`${uid}-${k.key}`}
              type="date"
              value={values[k.key] ?? ''}
              autoFocus={k.key === focusKey}
              aria-invalid={!!errors[k.key]?.[0]}
              onChange={(e) => setValues((v) => ({ ...v, [k.key]: e.target.value }))}
            />
            {errors[k.key]?.[0] && <p className="text-sm text-destructive">{errors[k.key]![0]}</p>}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <DialogPrimitive.Close render={<Button type="button" variant="outline" />}>Cancel</DialogPrimitive.Close>
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  );
}
