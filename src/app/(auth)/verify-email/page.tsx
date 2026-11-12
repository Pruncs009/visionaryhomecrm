import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/features/auth/components/auth-card';
import { ResendVerificationForm } from '@/features/auth/components/resend-verification-form';
import { getPendingEmail } from '@/features/auth/pending-email';

export const metadata: Metadata = { title: 'Verify your email' };

export default async function VerifyEmailPage() {
  const email = await getPendingEmail();

  return (
    <AuthCard
      title="Check your inbox"
      description="One more step to activate your account"
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2 text-sm">
          {email ? (
            <p>
              We sent a verification link to <strong className="break-all">{email}</strong>.
            </p>
          ) : (
            <p>We sent you a verification link.</p>
          )}
          <p className="text-muted-foreground">
            Click the link in that email to verify your address. It expires in 24 hours. Can&apos;t
            find it? Check your spam folder, or send a new one.
          </p>
        </div>
        <ResendVerificationForm email={email} />
      </div>
    </AuthCard>
  );
}
