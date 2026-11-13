import type { Metadata } from 'next';
import { requireArea } from '@/features/auth/guards';
import { ManageUsers } from '@/features/team/components/manage-users';
import { getTeamUsers } from '@/features/team/queries';
import { isValidTimeZone } from '@/lib/dates';

export const metadata: Metadata = { title: 'Manage Users' };
export const dynamic = 'force-dynamic';

export default async function ManageUsersPage() {
  const ctx = await requireArea('users');
  const timezone = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : 'America/New_York';
  let users;
  try {
    users = await getTeamUsers(ctx.organization.id);
  } catch (error) {
    console.error('[team] org_users failed', error);
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Manage Users</h1>
        <p className="text-sm text-muted-foreground">The user list couldn’t load. The Manage Users database update may not have been run yet.</p>
      </div>
    );
  }
  return <ManageUsers users={users} meId={ctx.userId} timezone={timezone} />;
}
