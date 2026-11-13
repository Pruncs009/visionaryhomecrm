import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { requireContext } from '@/features/auth/guards';
import { getDealStageCounts } from '@/features/deals/queries';
import { countDeletedTransactions } from '@/features/transactions/queries';

// Authenticated app shell. Middleware already redirects signed-out users;
// this check is defense in depth (layouts must never assume middleware ran).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  // Counts are a nice-to-have: never let them take the whole app down.
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
    <div className="flex min-h-screen">
      <Sidebar counts={counts} deletedCount={deletedCount} />
      {/* min-w-0: let wide children (tables) scroll inside instead of widening the page */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          email={ctx.email}
          fullName={ctx.profile?.full_name ?? null}
          organizationName={ctx.organization.name}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
