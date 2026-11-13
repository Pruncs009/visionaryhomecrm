import Link from 'next/link';
import { requireArea } from '@/features/auth/guards';

const tabs = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/organization', label: 'Organization' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/integrations', label: 'Integrations' },
  { href: '/settings/billing', label: 'Billing' },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireArea('settings');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <nav className="flex gap-4 border-b pb-2">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="text-sm hover:underline">{t.label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
