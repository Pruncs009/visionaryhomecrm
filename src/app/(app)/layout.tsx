import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { mainNav } from '@/config/navigation';
import { areaForPath, canAccess, homeFor, PATHNAME_HEADER } from '@/features/auth/access';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { ChatWidget } from '@/features/chat/components/chat-widget';
import { APP_SHELL_ID, BG_COOKIE, normalizeBg, shellTheme } from '@/features/theme/background';
import { requireContext } from '@/features/auth/guards';
import { getDealStageCounts } from '@/features/deals/queries';
import { countDeletedTransactions } from '@/features/transactions/queries';

// Authenticated app shell. Middleware already redirects signed-out users;
// this check is defense in depth (layouts must never assume middleware ran).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  // Added by an admin with a default password: choose your own first.
  if (ctx.mustChangePassword) redirect('/change-password');
  // Locked pages: send Users home before anything streams (pages check again).
  const area = areaForPath((await headers()).get(PATHNAME_HEADER));
  if (area && !canAccess(ctx, area)) redirect(homeFor(ctx));
  const hiddenNav = mainNav.filter((item) => item.area && !canAccess(ctx, item.area)).map((item) => item.href);
  // Counts are a nice-to-have: never let them take the whole app down.
  const background = normalizeBg((await cookies()).get(BG_COOKIE)?.value);
  const theme = shellTheme(background);
  const [counts, deletedCount] = await Promise.all([
    getDealStageCounts(ctx.organization.id).catch((error) => {
      console.error('[layout] deal stage counts failed', error);
      return {};
    }),
    countDeletedTransactions(ctx.organization.id).catch((error) => {
      console.error('[layout] deleted count failed', error);
      return 0;
    }),
  ]);

  return (
    // The chosen background (Settings → Change theme) is applied as CSS variables here.
    <div id={APP_SHELL_ID} className={cn('flex min-h-screen bg-background text-foreground', theme.dark && 'dark')} style={theme.style}>
      <Sidebar counts={counts} deletedCount={deletedCount} hidden={hiddenNav} homeHref={homeFor(ctx)} />
      {/* min-w-0: let wide children (tables) scroll inside instead of widening the page */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          email={ctx.email}
          fullName={ctx.profile?.full_name ?? null}
          organizationName={ctx.organization.name}
          background={background}
          userId={ctx.userId}
        />
        <main className="flex-1 p-6">{children}</main>
        {/* Team chat (bottom-right button) */}
        <ChatWidget me={{ id: ctx.userId, name: ctx.profile?.full_name ?? ctx.email }} orgId={ctx.organization.id} />
      </div>
    </div>
  );
}
