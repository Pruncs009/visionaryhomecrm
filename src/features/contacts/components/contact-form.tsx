'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { FormField, FormMessage } from '@/features/auth/components/form-field';
import type { ActionState } from '@/features/auth/types';
import { LEAD_SOURCE, LEAD_SOURCE_VALUES } from '@/features/leads/constants';
import type { TeamMember } from '@/features/leads/types';
import { CONTACT_METHOD_LABEL, CONTACT_METHOD_VALUES } from '../constants';

export type ContactFormDefaults = Partial<Record<string, string>>;

export function ContactForm({
  action,
  defaults,
  members,
  submitLabel,
  cancelHref,
  showTags,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: ContactFormDefaults;
  members: TeamMember[];
  submitLabel: string;
  cancelHref: string;
  /** Tags are edited inline on the detail page; only shown on create. */
  showTags: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  const v = state.values ?? defaults;
  const e = state.fieldErrors ?? {};

  const select = (name: string, label: string, options: Array<readonly [string, string]>) => (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <NativeSelect id={name} name={name} defaultValue={v[name] ?? ''} className="w-full">
        {options.map(([val, text]) => <NativeSelectOption key={val} value={val}>{text}</NativeSelectOption>)}
      </NativeSelect>
    </div>
  );

  return (
    <form action={formAction} noValidate className="space-y-6">
      <FormMessage error={state.error} />
      <div key={JSON.stringify(state.values ?? null)} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Person</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField name="first_name" label="First name" required autoComplete="off" defaultValue={v.first_name} errors={e.first_name} />
            <FormField name="last_name" label="Last name" autoComplete="off" defaultValue={v.last_name} errors={e.last_name} />
            <FormField name="email" label="Email" type="email" autoComplete="off" defaultValue={v.email} errors={e.email} />
            <FormField name="phone" label="Phone" type="tel" autoComplete="off" defaultValue={v.phone} errors={e.phone} />
            <FormField name="mobile_phone" label="Mobile" type="tel" autoComplete="off" defaultValue={v.mobile_phone} errors={e.mobile_phone} />
            <FormField name="birthday" label="Birthday" type="date" defaultValue={v.birthday} errors={e.birthday} />
            <FormField name="company" label="Company" defaultValue={v.company} errors={e.company} />
            <FormField name="job_title" label="Job title" defaultValue={v.job_title} errors={e.job_title} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Address &amp; preferences</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField name="address_line1" label="Street address" defaultValue={v.address_line1} errors={e.address_line1} />
            </div>
            <FormField name="address_line2" label="Apt / unit" defaultValue={v.address_line2} errors={e.address_line2} />
            <FormField name="city" label="City" defaultValue={v.city} errors={e.city} />
            <FormField name="state" label="State" defaultValue={v.state} errors={e.state} />
            <FormField name="postal_code" label="ZIP" defaultValue={v.postal_code} errors={e.postal_code} />
            {select('owner_id', 'Owner', [['', 'No owner'], ...members.map((m) => [m.userId, m.name] as [string, string])])}
            {select('source', 'Source', [['', 'Unknown'], ...LEAD_SOURCE_VALUES.map((s) => [s, LEAD_SOURCE[s]] as [string, string])])}
            {select('preferred_contact_method', 'Prefers', [['', 'No preference'], ...CONTACT_METHOD_VALUES.map((m) => [m, CONTACT_METHOD_LABEL[m]] as [string, string])])}
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="do_not_contact" defaultChecked={v.do_not_contact === 'on'} className="size-4 accent-primary" />
              Do not contact
            </label>
            {showTags && (
              <div className="sm:col-span-2">
                <FormField name="tags" label="Tags" placeholder="vip, investor, past client" defaultValue={v.tags} errors={e.tags} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className={buttonVariants({ variant: 'outline' })}>Cancel</Link>
        <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  );
}
