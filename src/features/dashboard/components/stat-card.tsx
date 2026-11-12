import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type StatCardProps = {
  title: string;
  value: number | string;
  icon: LucideIcon;
  href: string;
  /** One line of context under the number — plain text, no colored deltas. */
  children?: React.ReactNode;
};

/** KPI tile: label, hero number, one line of context. The whole tile is a link. */
export function StatCard({ title, value, icon: Icon, href, children }: StatCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-colors group-hover:bg-muted/40">
        <CardHeader>
          <CardDescription className="flex items-center gap-2 font-medium">
            <Icon className="size-4" aria-hidden />
            {title}
          </CardDescription>
          <CardTitle className="text-3xl font-semibold tracking-tight">{value}</CardTitle>
        </CardHeader>
        {children && <CardContent className="text-xs text-muted-foreground">{children}</CardContent>}
      </Card>
    </Link>
  );
}
