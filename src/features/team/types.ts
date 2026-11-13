// Manage Users domain types.
import type { ExtraArea } from '@/features/auth/access';
import type { MemberRole } from '@/types/database.types';

export type TeamUser = {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  permissions: ExtraArea[];
  /** Hasn't chosen their own password yet (still on the default one). */
  mustChangePassword: boolean;
  lastSignInAt: string | null;
  addedAt: string;
};

export type TeamResult = { ok: true } | { ok: false; error: string };

export const DEFAULT_PASSWORD = 'VHO1234';
