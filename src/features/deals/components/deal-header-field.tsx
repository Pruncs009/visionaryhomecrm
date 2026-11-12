'use client';

import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { updateDealHeaderField, updateEmdIn, type DealHeaderField } from '../actions';

export const DEAL_TYPE_SUGGESTIONS = ['Wholesale', 'Fix & Flip', 'Novation', 'Subject-To', 'Seller Finance', 'Buy & Hold', 'Wholetail'];

const LABEL: Record<DealHeaderField, string> = {
  campaign_name: 'Campaign name',
  deal_type: 'Deal type',
  purchase_price: 'Purchase price',
  lead_manager: 'Lead Manager',
  acquisition_manager: 'Acquisition Manager',
  transaction_coordinator: 'Transaction coordinator',
  earnest_money: 'EMD',
};

const formatMoney = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/**
 * Inline-editable deal field: type, then Enter or click away to save; Escape reverts.
 */
export function DealHeaderField({
  id,
  field,
  value,
  placeholder,
  suggestions,
  className,
  inputClassName,
}: {
  id: string;
  field: DealHeaderField;
  value: string | number | null;
  placeholder?: string;
  suggestions?: readonly string[];
  className?: string;
  inputClassName?: string;
}) {
  const inputId = useId();
  const listId = useId();
  const isMoney = field === 'purchase_price' || field === 'earnest_money';
  const show = (v: string | number | null) => (v === null ? '' : typeof v === 'number' ? formatMoney(v) : v);

  const [saved, setSaved] = useState(show(value));
  const [draft, setDraft] = useState(saved);
  const [pending, start] = useTransition();

  const save = () => {
    if (draft.trim() === saved.trim()) return setDraft(saved);
    start(async () => {
      const r = await updateDealHeaderField(id, field, draft);
      if (!r.ok) {
        toast.error(r.error);
        setDraft(saved);
        return;
      }
      const next = show(r.value);
      setSaved(next);
      setDraft(next);
      toast.success(`${LABEL[field]} saved`);
    });
  };

  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={inputId} className="block text-xs text-muted-foreground">{LABEL[field]}</label>
      <Input
        id={inputId}
        value={draft}
        disabled={pending}
        placeholder={placeholder ?? (isMoney ? '$0' : 'Add…')}
        inputMode={isMoney ? 'decimal' : undefined}
        list={suggestions ? listId : undefined}
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => isMoney && e.currentTarget.select()}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(saved);
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
          }
        }}
        className={cn(isMoney && 'tabular-nums', inputClassName)}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </div>
  );
}

/** "IN" dropdown next to the EMD: Yes / No (blank = not set). Saves on change. */
export function EmdInSelect({ id, value }: { id: string; value: boolean | null }) {
  const selectId = useId();
  const initial = value === null ? '' : value ? 'yes' : 'no';
  const [current, setCurrent] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <label htmlFor={selectId} className="block text-xs text-muted-foreground">IN</label>
      <NativeSelect
        id={selectId}
        className="w-full"
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as 'yes' | 'no' | '';
          const previous = current;
          setCurrent(next);
          start(async () => {
            const r = await updateEmdIn(id, next);
            if (r.ok) toast.success(next ? `EMD in: ${next === 'yes' ? 'Yes' : 'No'}` : 'EMD in cleared');
            else {
              setCurrent(previous);
              toast.error(r.error);
            }
          });
        }}
      >
        <NativeSelectOption value="">—</NativeSelectOption>
        <NativeSelectOption value="yes">Yes</NativeSelectOption>
        <NativeSelectOption value="no">No</NativeSelectOption>
      </NativeSelect>
    </div>
  );
}
