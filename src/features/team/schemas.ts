// Zod schemas for Manage Users.
import { z } from 'zod';
import { EXTRA_AREA_KEYS, type ExtraArea } from '@/features/auth/access';

const areas = z.array(z.enum(EXTRA_AREA_KEYS as [ExtraArea, ...ExtraArea[]])).max(EXTRA_AREA_KEYS.length);
/** The two choices on screen: Admin (role 'admin') or User (role 'agent'). */
export const accessLevel = z.enum(['admin', 'user']);

export const addUserSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter their name.').max(100, 'Keep the name under 100 characters.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(6, 'Use at least 6 characters.').max(72, 'Use at most 72 characters.'),
  access: accessLevel,
  permissions: areas,
});

export const updateAccessSchema = z.object({
  userId: z.string().uuid(),
  access: accessLevel,
  permissions: areas,
});

export type AddUserInput = z.infer<typeof addUserSchema>;
