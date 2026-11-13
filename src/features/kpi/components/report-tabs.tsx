import Link from 'next/link';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/reports', label: 'CRM analytics' },
  { href: '/reports/kpi', label: 'KPI report' },
] as const;

/** Switch between the Reports pages. */
export function ReportTabs({ current }: { current: (typeof TABS)[number]['href'] }) {
  return (
    <nav aria-label="Reports" className="flex gap-1 border-b">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            t.href === current ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
