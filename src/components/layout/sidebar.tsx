'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowRightLeft, BarChart3, Calendar, CircleCheckBig, CircleSlash, FileSignature, Hammer, LayoutDashboard,
  Megaphone, MoveRight, Repeat, Settings, ShieldOff, type LucideIcon,
} from 'lucide-react';
import { mainNav, type NavIcon } from '@/config/navigation';
import type { DealStage } from '@/features/deals/constants';
import { cn } from '@/lib/utils';

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  under_contract: FileSignature,
  under_dispo: Megaphone,
  under_rehab: Hammer,
  ab_closing: MoveRight,
  bc_closing: Repeat,
  ac_closing: ArrowRightLeft,
  closed: CircleCheckBig,
  off_market: ShieldOff,
  dead: CircleSlash,
  calendar: Calendar,
  reports: BarChart3,
  settings: Settings,
};

export function Sidebar({ counts }: { counts: Partial<Record<DealStage, number>> }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r p-4 md:block">
      <div className="mb-6 px-3 font-semibold">VisionaryHomeCRM</div>
      <nav aria-label="Main" className="space-y-0.5">
        {mainNav.map((item, i) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const count = item.stage ? counts[item.stage] ?? 0 : null;
          // Thin dividers: [Dashboard] | [deal stages] | [Calendar, Reports, Settings]
          const divider = i === 1 || (item.icon === 'calendar');
          return (
            <div key={item.href}>
              {divider && <div className="mx-3 my-2 border-t" aria-hidden />}
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                  active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{item.title}</span>
                {count !== null && count > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground" aria-label={`${count} deals`}>{count}</span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
