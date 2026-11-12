'use client';

import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { updateDealHeaderField, type DealHeaderField } from '../actions';

export const DEAL_TYPE_SUGGESTIONS = ['Wholesale', 'Fix & Flip', 'Novation', 'Subject-To', 'Seller Finance', 'Buy & Hold', 'Wholetail'];

const LABEL: Record<DealHeaderField, string> = {
  campaign_name: 'Campaign name',
  deal_type: 'Deal type',
  purchase_price: 'Purchase price',
  lead_manager: 'Lead Manager',
  acquisition_manager: 'Acquisition Manager',
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
  const isMoney = field === 'purchase_price';
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
