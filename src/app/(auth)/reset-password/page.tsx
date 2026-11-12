import type { Metadata } from 'next';
import { AuthCard } from '@/features/auth/components/auth-card';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';

export const metadata: Metadata = { title: 'Choose a new password' };

// Reached from the reset email via /auth/callback, which signs the user in first.
// Middleware sends anyone without a session to /login.
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordForm />
    </AuthCard>
  );
}
