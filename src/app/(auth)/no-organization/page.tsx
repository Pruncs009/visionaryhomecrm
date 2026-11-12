import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { AuthCard } from '@/features/auth/components/auth-card';

export const metadata: Metadata = { title: 'No team access' };

// Signed-in users without any membership land here (see requireContext()).
export default function NoOrganizationPage() {
  return (
    <AuthCard title="No team access" description="Your account isn't part of any team yet">
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Ask your broker or team admin to invite you, then sign in again.
        </p>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}
