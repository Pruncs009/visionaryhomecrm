import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/features/auth/components/auth-card';
import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = { title: 'Sign in' };

const ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: 'That link is invalid or has expired. Please try again.',
  verification_failed: 'That verification link is invalid or has expired. Sign in to get a new one.',
};

type PageProps = {
  searchParams: Promise<{ next?: string; error?: string }>; // Next.js 15: async
};

export default async function LoginPage({ searchParams }: PageProps) {
  const { next, error } = await searchParams;

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your CRM"
      footer={
        <>
          New to Visionary Home Offer?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} initialError={error ? ERROR_MESSAGES[error] : undefined} />
    </AuthCard>
  );
}
