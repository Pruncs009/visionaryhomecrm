import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireContext } from '@/features/auth/guards';
import { AppointmentsCard } from '@/features/dashboard/components/appointments-card';
import { KpiCards } from '@/features/dashboard/components/kpi-cards';
import { RecentClosingsCard } from '@/features/dashboard/components/recent-closings-card';
import { RevenueCard } from '@/features/dashboard/components/revenue-card';
import { TasksDueCard } from '@/features/dashboard/components/tasks-due-card';
import { CardSkeleton, KpiSkeleton } from '@/features/dashboard/components/widget-states';
import type { DashboardScope } from '@/features/dashboard/types';
import { isValidTimeZone, zonedParts } from '@/lib/dates';

export const metadata: Metadata = { title: 'Dashboard' };

const FALLBACK_TZ = 'America/New_York';

export default async function DashboardPage() {
  const ctx = await requireContext();
  const timezone = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : FALLBACK_TZ;
  const scope: DashboardScope = { orgId: ctx.organization.id, userId: ctx.userId, timezone };

  const now = new Date();
  const { hour } = zonedParts(now, timezone);
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = ctx.profile?.full_name?.split(' ')[0];
  const today = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }).format(now);

  // Each widget is its own async Server Component inside <Suspense>: the shell
  // renders instantly and widgets stream in as their queries finish.
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">
          {today} · {ctx.organization.name}
        </p>
      </header>

      <Suspense fallback={<KpiSkeleton />}>
        <KpiCards scope={scope} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<CardSkeleton className="lg:col-span-2" rows={5} />}>
          <RevenueCard scope={scope} className="lg:col-span-2" />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <AppointmentsCard scope={scope} />
        </Suspense>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<CardSkeleton className="lg:col-span-2" />}>
          <TasksDueCard scope={scope} className="lg:col-span-2" />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <RecentClosingsCard scope={scope} />
        </Suspense>
      </div>
    </div>
  );
}
