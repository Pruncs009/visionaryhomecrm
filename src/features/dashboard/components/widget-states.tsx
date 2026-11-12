import { CircleAlert } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Shown when one widget's query fails — the rest of the dashboard still renders. */
export function WidgetError({ title, className }: { title: string; className?: string }) {
  return (
    <Card className={cn('justify-center', className)}>
      <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
        <CircleAlert className="size-4 shrink-0 text-critical" aria-hidden />
        <span>
          <span className="font-medium text-foreground">{title}</span> couldn&apos;t load. Refresh to try again.
        </span>
      </CardContent>
    </Card>
  );
}

export function EmptyState({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
      <Icon className="size-6 opacity-60" aria-hidden />
      {children}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export function CardSkeleton({ className, rows = 4 }: { className?: string; rows?: number }) {
  return (
    <Card className={className}>
      <CardHeader className="gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
