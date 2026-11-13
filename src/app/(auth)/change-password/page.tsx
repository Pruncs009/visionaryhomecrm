import type { Metadata } from 'next';
import { AuthCard } from '@/features/auth/components/auth-card';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import { requireUser } from '@/features/auth/guards';

export const metadata: Metadata = { title: 'Choose your password' };
export const dynamic = 'force-dynamic';

// New users added by an admin land here on their first sign-in (see (app)/layout.tsx).
// Saving a new password clears the "must change password" flag in the database.
export default async function ChangePasswordPage() {
  await requireUser();
  return (
    <AuthCard
      title="Choose your own password"
      description="You signed in with the default password. Please choose a new one to continue."
      footer={
        <form action="/auth/signout" method="post">
          <button type="submit" className="font-medium text-primary hover:underline">Sign out</button>
        </form>
      }
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
