'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { FormField, FormMessage } from '@/features/auth/components/form-field';
import type { TeamMember } from '@/features/leads/types';
import { saveTransaction } from '../actions';
import { KEY_DATES, TX_SIDE, TX_SIDE_VALUES, TX_STATUS, TX_STATUS_VALUES } from '../constants';
import type { Option } from '../types';

type Defaults = Partial<Record<string, string>>;

/** Removed from the form but still stored; sent back as-is. */
const HIDDEN_KEPT = [
  'offer_price', 'sale_price', 'commission_rate', 'commission_amount',
  'inspection_deadline', 'appraisal_deadline', 'financing_deadline',
] as const;

/**
 * Free-text buyer / seller name. A deal may still be linked to a contact from
 * before; the link is kept only while the name is left as that contact's name.
 */
function PartyName({ role, label, defaultName, linkedId, errors }: {
  role: 'buyer' | 'seller';
  label: string;
  defaultName?: string;
  linkedId?: string;
  errors?: string[];
}) {
  const initial = defaultName ?? '';
  const [name, setName] = useState(initial);
  const keepLink = !!linkedId && name.trim() === initial.trim();
  const id = `${role}_name`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Input id={id} name={id} value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Full name" autoComplete="off" aria-invalid={!!errors?.[0]} />
      <input type="hidden" name={`${role}_contact_id`} value={keepLink ? linkedId : ''} />
      {errors?.[0] && <p className="text-sm text-destructive">{errors[0]}</p>}
    </div>
  );
}

export function TransactionForm({
  defaults,
  contacts,
  properties,
  members,
  submitLabel,
  cancelHref,
  dealStage,
}: {
  defaults: Defaults;
  contacts: Option[];
  properties: Option[];
  members: TeamMember[];
  submitLabel: string;
  cancelHref: string;
  /** New deal started from a deal-stage page: lands in that stage. */
  dealStage?: string;
}) {
  const [state, formAction, isPending] = useActionState(saveTransaction, {});
  const v: Defaults = state.values ?? defaults;
  const e = state.fieldErrors ?? {};
  const [propertyMode, setPropertyMode] = useState(v.property_mode || (properties.length ? 'existing' : 'new'));
  const [propertyId, setPropertyId] = useState(v.property_id ?? '');
  const propertyLabel = properties.find((p) => p.id === propertyId)?.label ?? '';

  const select = (name: string, label: string, options: Array<readonly [string, string]>, extra?: { value?: string; onChange?: (v: string) => void }) => (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <NativeSelect
        id={name}
        name={name}
        className="w-full"
        aria-invalid={!!e[name]}
        {...(extra?.onChange ? { value: extra.value, onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => extra.onChange!(ev.target.value) } : { defaultValue: v[name] ?? '' })}
      >
        {options.map(([val, text]) => <NativeSelectOption key={val} value={val}>{text}</NativeSelectOption>)}
      </NativeSelect>
      {e[name]?.[0] && <p className="text-sm text-destructive">{e[name]![0]}</p>}
    </div>
  );

  return (
    <form action={formAction} noValidate className="space-y-6">
      {/* Hidden id instead of a bound action: the same action handles create + edit. */}
      <input type="hidden" name="transaction_id" value={v.transaction_id ?? ''} />
      <input type="hidden" name="property_mode" value={propertyMode} />
      <input type="hidden" name="property_label" value={propertyLabel} />
      {dealStage && <input type="hidden" name="deal_stage" value={dealStage} />}
      <FormMessage error={state.error} />

      <div key={JSON.stringify(state.values ?? null)} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Property &amp; parties</CardTitle>
            <CardDescription>Pick existing records, or add the property here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Property</legend>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={propertyMode === 'existing'} onChange={() => setPropertyMode('existing')} disabled={!properties.length} className="accent-primary" />
                  Existing property
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={propertyMode === 'new'} onChange={() => setPropertyMode('new')} className="accent-primary" />
                  New property
                </label>
              </div>
            </fieldset>
            {propertyMode === 'existing' ? (
              select('property_id', 'Choose property', [['', '— Select —'], ...properties.map((p) => [p.id, p.detail ? `${p.label}, ${p.detail}` : p.label] as [string, string])], { value: propertyId, onChange: setPropertyId })
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FormField name="new_address_line1" label="Street address" defaultValue={v.new_address_line1} errors={e.new_address_line1} />
                </div>
                <FormField name="new_city" label="City" defaultValue={v.new_city} errors={e.new_city} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField name="new_state" label="State" defaultValue={v.new_state} errors={e.new_state} />
                  <FormField name="new_postal_code" label="ZIP" defaultValue={v.new_postal_code} errors={e.new_postal_code} />
                </div>
                <FormField name="list_price" label="List price" inputMode="numeric" placeholder="$" defaultValue={v.list_price} errors={e.list_price} />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <PartyName role="buyer" label="Buyer" defaultName={v.buyer_name} linkedId={v.buyer_contact_id} errors={e.buyer_name} />
              <PartyName role="seller" label="Seller" defaultName={v.seller_name} linkedId={v.seller_contact_id} errors={e.seller_name} />
              {select('agent_id', 'Assigned agent', [['', 'Unassigned'], ...members.map((m) => [m.userId, m.name] as [string, string])])}
              {select('side', 'We represent', TX_SIDE_VALUES.map((s) => [s, TX_SIDE[s]]))}
              {select('status', 'Status', TX_STATUS_VALUES.map((s) => [s, TX_STATUS[s].label]))}
              <FormField name="name" label="Deal name (optional)" placeholder="Defaults to the address" defaultValue={v.name} errors={e.name} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Key dates</CardTitle>
              <CardDescription>The next date drives the countdown on the deal page.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {KEY_DATES.map((k) => (
                <FormField key={k.key} name={k.key} label={k.label} type="date" defaultValue={v[k.key]} errors={e[k.key]} />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Financials</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField name="purchase_price" label="Purchase price" inputMode="numeric" placeholder="$" defaultValue={v.purchase_price} errors={e.purchase_price} />
              <FormField name="earnest_money" label="EMD" inputMode="numeric" placeholder="$" defaultValue={v.earnest_money} errors={e.earnest_money} />
            </CardContent>
          </Card>
          {/* Fields no longer on the form: carried through unchanged so saving doesn't wipe them. */}
          {HIDDEN_KEPT.map((k) => <input key={k} type="hidden" name={k} value={v[k] ?? ''} />)}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className={buttonVariants({ variant: 'outline' })}>Cancel</Link>
        <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  );
}
