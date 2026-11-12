'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { FormField, FormMessage } from '@/features/auth/components/form-field';
import type { ActionState } from '@/features/auth/types';
import {
  LEAD_INTENT,
  LEAD_INTENT_VALUES,
  LEAD_SOURCE,
  LEAD_SOURCE_VALUES,
  LEAD_STATUS,
  LEAD_STATUS_VALUES,
  LEAD_TIMEFRAME,
  LEAD_TIMEFRAME_VALUES,
} from '../constants';
import type { TeamMember } from '../types';

export type LeadFormDefaults = Partial<Record<
  | 'first_name' | 'last_name' | 'email' | 'phone' | 'status' | 'intent' | 'source' | 'source_detail'
  | 'assigned_to' | 'budget_min' | 'budget_max' | 'timeframe' | 'message' | 'lost_reason',
  string
>>;

type LeadFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: LeadFormDefaults;
  members: TeamMember[];
  submitLabel: string;
  cancelHref: string;
};

export function LeadForm({ action, defaults, members, submitLabel, cancelHref }: LeadFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  // After a failed submit, show what the user typed (React resets the form).
  const v: LeadFormDefaults = state.values ?? defaults;
  const errors = state.fieldErrors ?? {};
  const [status, setStatus] = useState(v.status ?? 'new');

  return (
    <form action={formAction} noValidate className="space-y-6">
      <FormMessage error={state.error} />

      {/* key: remount inputs with echoed values after each failed submit */}
      <div key={JSON.stringify(state.values ?? null)} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
            <CardDescription>
              If a contact with this email already exists, the lead is attached to it.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField name="first_name" label="First name" required autoComplete="off" defaultValue={v.first_name} errors={errors.first_name} />
            <FormField name="last_name" label="Last name" autoComplete="off" defaultValue={v.last_name} errors={errors.last_name} />
            <FormField name="email" label="Email" type="email" autoComplete="off" defaultValue={v.email} errors={errors.email} />
            <FormField name="phone" label="Phone" type="tel" autoComplete="off" defaultValue={v.phone} errors={errors.phone} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead</CardTitle>
            <CardDescription>Status, source and who&apos;s working it.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="status"
              label="Status"
              value={status}
              onChange={setStatus}
              errors={errors.status}
              options={LEAD_STATUS_VALUES.map((s) => [s, LEAD_STATUS[s].label])}
            />
            <SelectField
              name="assigned_to"
              label="Assigned agent"
              defaultValue={v.assigned_to ?? ''}
              errors={errors.assigned_to}
              options={[['', 'Unassigned'], ...members.map((m) => [m.userId, m.name] as [string, string])]}
            />
            <SelectField
              name="source"
              label="Source"
              defaultValue={v.source ?? ''}
              errors={errors.source}
              options={[['', 'Unknown'], ...LEAD_SOURCE_VALUES.map((s) => [s, LEAD_SOURCE[s]] as [string, string])]}
            />
            <FormField
              name="source_detail"
              label="Source detail"
              placeholder="e.g. Zillow Premier Agent, referred by…"
              defaultValue={v.source_detail}
              errors={errors.source_detail}
            />
            <SelectField
              name="intent"
              label="Looking to"
              defaultValue={v.intent ?? 'buy'}
              errors={errors.intent}
              options={LEAD_INTENT_VALUES.map((i) => [i, LEAD_INTENT[i]])}
            />
            <SelectField
              name="timeframe"
              label="Timeframe"
              defaultValue={v.timeframe ?? ''}
              errors={errors.timeframe}
              options={[['', '—'], ...LEAD_TIMEFRAME_VALUES.map((t) => [t, LEAD_TIMEFRAME[t]] as [string, string])]}
            />
            <FormField name="budget_min" label="Budget min" inputMode="numeric" placeholder="$" defaultValue={v.budget_min} errors={errors.budget_min} />
            <FormField name="budget_max" label="Budget max" inputMode="numeric" placeholder="$" defaultValue={v.budget_max} errors={errors.budget_max} />
            {status === 'closed_lost' && (
              <div className="sm:col-span-2">
                <FormField name="lost_reason" label="Why was it lost?" defaultValue={v.lost_reason} errors={errors.lost_reason} />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="message" className="text-sm font-medium">
                Notes / inquiry message
              </label>
              <Textarea id="message" name="message" rows={4} defaultValue={v.message} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className={buttonVariants({ variant: 'outline' })}>
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function SelectField({
  name,
  label,
  options,
  errors,
  defaultValue,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: Array<readonly [string, string]>;
  errors?: string[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const error = errors?.[0];
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <NativeSelect
        id={name}
        name={name}
        className="w-full"
        aria-invalid={!!error}
        {...(onChange
          ? { value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) }
          : { defaultValue })}
      >
        {options.map(([val, text]) => (
          <NativeSelectOption key={val} value={val}>
            {text}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
