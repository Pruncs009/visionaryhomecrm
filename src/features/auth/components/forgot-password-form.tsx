'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { requestPasswordReset } from '../actions';
import { initialActionState } from '../types';
import { FormField, FormMessage } from './form-field';

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialActionState);

  if (state.success) return <FormMessage success={state.success} />;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage error={state.error} />
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
