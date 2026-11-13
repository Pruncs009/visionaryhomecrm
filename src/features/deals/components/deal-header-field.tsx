'use client';

import { useId, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  contingency_type: 'Contingency type',
  escrow_type: 'Escrow type',
  escrow_number: 'Escrow #',
  occupancy_strategy: 'Occupancy / vacate strategy',
  lockbox_code: 'Lockbox code',
  arv_estimate: 'ARV estimate',
  rehab_estimate: 'Rehab estimate',
  photos_link: 'Photos link',
  channel: 'Channel',
  occupancy: 'Occupancy',
  ownership_type: 'Ownership type',
  ethnicity: 'Ethnicity',
  prop_last_sold_prior: 'Last Sold Date Prior Acquisition',
  prop_seller_age: 'Age of Seller @ Acquisition',
  prop_equity: 'Equity @ Acquisition',
  prop_stories: 'Stories',
  prop_beds: 'Bed',
  prop_baths: 'Bath',
  prop_bldg_sqft: 'Bldg Sqft',
  prop_lot_size: 'Lot Size',
  prop_year_built: 'Year Built',
  prop_county: 'County',
};

/**
 * One-line-looking text box that grows to 2, 3… lines so long text is never cut
 * off. Enter saves (no line breaks); the text wraps on its own.
 */
function AutoGrowTextarea({ value, onChange, onBlur, onEnter, onEscape, className, ...props }: {
  id: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onEnter: (el: HTMLTextAreaElement) => void;
  onEscape: (el: HTMLTextAreaElement) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Grow to fit the text: on every change, and whenever the box gets narrower or
  // wider (window resize, layout switching to the side column).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);
  return (
    <Textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\r?\n/g, ' '))}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnter(e.currentTarget);
        }
        if (e.key === 'Escape') onEscape(e.currentTarget);
      }}
      className={cn('min-h-8 resize-none overflow-hidden py-1.5 leading-snug break-words', className)}
      {...props}
    />
  );
}

const MONEY_FIELDS: DealHeaderField[] = ['purchase_price', 'earnest_money', 'arv_estimate', 'rehab_estimate'];

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
  labelClassName,
  multiline,
}: {
  id: string;
  field: DealHeaderField;
  value: string | number | null;
  placeholder?: string;
  suggestions?: readonly string[];
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  /** Wrap long text onto more lines instead of cutting it off (Enter still saves). */
  multiline?: boolean;
}) {
  const inputId = useId();
  const listId = useId();
  const isMoney = MONEY_FIELDS.includes(field);
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
      <label htmlFor={inputId} className={cn('block text-xs', labelClassName ?? 'text-muted-foreground')}>{LABEL[field]}</label>
      {multiline ? (
        <AutoGrowTextarea
          id={inputId}
          value={draft}
          disabled={pending}
          placeholder={placeholder ?? 'Add…'}
          onChange={setDraft}
          onBlur={save}
          onEnter={(el) => el.blur()}
          onEscape={(el) => {
            setDraft(saved);
            requestAnimationFrame(() => el.blur());
          }}
          className={inputClassName}
        />
      ) : (
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
      )}
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

const OTHERS = '__others__';

/**
 * Dropdown that saves straight to the deal. With `allowOthers`, the last option
 * is "Others", which shows a box to type any value. Whatever is chosen or typed is
 * saved as plain text; a saved value that isn't in the list reopens as "Others".
 */
export function ChoiceField({ id, field, value, options, allowOthers = true, othersPlaceholder, labelClassName }: {
  id: string;
  field: DealHeaderField;
  value: string | null;
  options: readonly string[];
  allowOthers?: boolean;
  othersPlaceholder?: string;
  labelClassName?: string;
}) {
  const selectId = useId();
  const inputId = useId();
  const label = LABEL[field];
  const saved0 = value ?? '';
  const preset = options.find((c) => c.toLowerCase() === saved0.trim().toLowerCase());
  // Without "Others", an old value that isn't in the list is still shown as its own option.
  const legacy = !allowOthers && saved0 && !preset ? saved0 : null;
  const [saved, setSaved] = useState(saved0);
  const [choice, setChoice] = useState(saved0 === '' ? '' : preset ?? (allowOthers ? OTHERS : saved0));
  const [other, setOther] = useState(preset || saved0 === '' || !allowOthers ? '' : saved0);
  const [pending, start] = useTransition();

  const save = (next: string, message: string, onFail?: () => void) => {
    if (next.trim() === saved.trim()) return;
    start(async () => {
      const r = await updateDealHeaderField(id, field, next);
      if (r.ok) {
        setSaved(next.trim());
        toast.success(message);
      } else {
        toast.error(r.error);
        onFail?.();
      }
    });
  };

  return (
    <div className="space-y-1">
      <label htmlFor={selectId} className={cn('block text-xs', labelClassName ?? 'text-muted-foreground')}>{label}</label>
      <NativeSelect
        id={selectId}
        className="w-full"
        value={choice}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const previous = choice;
          setChoice(next);
          if (next === OTHERS) return; // wait for the typed value
          setOther('');
          save(next, next ? `${label}: ${next}` : `${label} cleared`, () => setChoice(previous));
        }}
      >
        <NativeSelectOption value="">—</NativeSelectOption>
        {options.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
        {legacy && <NativeSelectOption value={legacy}>{legacy}</NativeSelectOption>}
        {allowOthers && <NativeSelectOption value={OTHERS}>Others</NativeSelectOption>}
      </NativeSelect>
      {allowOthers && choice === OTHERS && (
        <>
          <label htmlFor={inputId} className="sr-only">{label} (other)</label>
          <AutoGrowTextarea
            id={inputId}
            value={other}
            disabled={pending}
            placeholder={othersPlaceholder ?? `Enter ${label.toLowerCase()}`}
            onChange={setOther}
            onBlur={() => other.trim() && save(other, `${label}: ${other.trim()}`)}
            onEnter={(el) => el.blur()}
            onEscape={(el) => el.blur()}
          />
        </>
      )}
    </div>
  );
}

export const ESCROW_COMPANIES = ['Chicago Title Company', 'WFG Title Company', 'USA National Title Company'] as const;
export const CHANNELS = [
  'SMS', 'DM', 'Online', 'Sphere of Influence', 'Sphere of Influence - AO', 'Sphere of Influence - PPL',
  'Sphere of Influence - CC', 'CC',
] as const;
export const OCCUPANCY_OPTIONS = ['Absentee', 'Owner occupied'] as const;
export const OWNERSHIP_TYPES = ['Single', 'Married', 'Multiple', 'Trust', 'Corp', 'Church'] as const;

/** Escrow type: the usual title companies, or "Others" to type the name. */
export function EscrowTypeField({ id, value, labelClassName }: { id: string; value: string | null; labelClassName?: string }) {
  return <ChoiceField id={id} field="escrow_type" value={value} options={ESCROW_COMPANIES} othersPlaceholder="Enter escrow company name" labelClassName={labelClassName} />;
}
