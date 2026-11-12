'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { signup } from '../actions';
import { initialActionState } from '../types';
import { FormField, FormMessage } from './form-field';

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signup, initialActionState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage error={state.error} />
      <FormField
        name="full_name"
        label="Full name"
        autoComplete="name"
        required
        defaultValue={state.values?.full_name}
        errors={state.fieldErrors?.full_name}
      />
      <FormField
        name="organization_name"
        label="Brokerage or team name (optional)"
        autoComplete="organization"
        placeholder="e.g. Visionary Realty"
        defaultValue={state.values?.organization_name}
        errors={state.fieldErrors?.organization_name}
      />
      <FormField
        name="email"
        label="Work email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        errors={state.fieldErrors?.password}
      />
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
