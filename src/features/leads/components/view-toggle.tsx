import Link from 'next/link';
import { Columns3, List } from 'lucide-react';
import { cn } from '@/lib/utils';

/** List ↔ Board switch for the Leads area. */
export function LeadsViewToggle({ current }: { current: 'list' | 'board' }) {
  const item = (view: 'list' | 'board', href: string, label: string, Icon: React.ElementType) => (
    <Link
      href={href}
      aria-current={current === view ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium',
        current === view ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </Link>
  );
  return (
    <nav aria-label="Leads view" className="inline-flex gap-1 rounded-lg bg-muted p-1">
      {item('list', '/leads', 'List', List)}
      {item('board', '/leads/pipeline', 'Pipeline', Columns3)}
    </nav>
  );
}
