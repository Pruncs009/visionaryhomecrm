import { requireArea } from '@/features/auth/guards';

// Reports are admin-only unless an admin gave this user the Reports area.
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requireArea('reports');
  return children;
}
