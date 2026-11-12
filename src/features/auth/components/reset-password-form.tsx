'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { resetPassword } from '../actions';
import { initialActionState } from '../types';
import { FormField, FormMessage } from './form-field';

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(resetPassword, initialActionState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage error={state.error} />
      <FormField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        errors={state.fieldErrors?.password}
      />
      <FormField
        name="confirm_password"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirm_password}
      />
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Saving…' : 'Update password'}
      </Button>
    </form>
  );
}
