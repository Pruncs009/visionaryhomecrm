'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { resendVerification } from '../actions';
import { initialActionState } from '../types';
import { FormField, FormMessage } from './form-field';

/**
 * If we know the pending address (from the cookie), it's a one-click resend.
 * Otherwise (cookie expired, different browser) the user types their email.
 */
export function ResendVerificationForm({ email }: { email: string | null }) {
  const [state, formAction, isPending] = useActionState(resendVerification, initialActionState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage error={state.error} success={state.success} />
      {email ? (
        <input type="hidden" name="email" value={email} />
      ) : (
        <FormField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          errors={state.fieldErrors?.email}
        />
      )}
      <Button type="submit" variant="outline" className="w-full" disabled={isPending}>
        {isPending ? 'Sending…' : 'Resend verification email'}
      </Button>
    </form>
  );
}
