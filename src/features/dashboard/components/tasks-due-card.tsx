import Link from 'next/link';
import { CircleAlert, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { calendarBounds } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { TaskPriority } from '@/types/database.types';
import { getTasksDue } from '../queries';
import type { DashboardScope } from '../types';
import { EmptyState, WidgetError } from './widget-states';

const PRIORITY: Record<TaskPriority, { label: string; variant: 'destructive' | 'secondary' | 'outline' } | null> = {
  urgent: { label: 'Urgent', variant: 'destructive' },
  high: { label: 'High', variant: 'secondary' },
  normal: null,
  low: null,
};

export async function TasksDueCard({ scope, className }: { scope: DashboardScope; className?: string }) {
  let t;
  try {
    t = await getTasksDue(scope);
  } catch (error) {
    console.error('[dashboard] tasks failed', error);
    return <WidgetError title="Tasks due" className={className} />;
  }

  const dueTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: scope.timezone });
  const dueDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: scope.timezone });
  const { startOfToday } = calendarBounds(scope.timezone);
  const more = t.dueCount - t.items.length;

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Tasks due</CardTitle>
        <CardDescription>
          {t.dueCount} assigned to you due today
          {t.overdueCount > 0 && (
            <>
              {' · '}
              <span className="font-medium text-critical">{t.overdueCount} overdue</span>
            </>
          )}
        </CardDescription>
        <CardAction>
          <Link href="/tasks" className="text-sm font-medium text-primary hover:underline">
            All tasks
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {t.items.length === 0 ? (
          <EmptyState icon={ListChecks}>You&apos;re all caught up.</EmptyState>
        ) : (
          <ul className="divide-y">
            {t.items.map((task) => {
              const priority = PRIORITY[task.priority];
              const due = new Date(task.dueAt);
              return (
                <li key={task.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{task.title}</span>
                      {priority && (
                        <Badge variant={priority.variant} className="shrink-0">
                          {priority.label}
                        </Badge>
                      )}
                    </div>
                    {(task.contactName || task.transactionName) && (
                      <p className="truncate text-xs text-muted-foreground">
                        {[task.contactName, task.transactionName].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  {/* Overdue = icon + word + color, never color alone */}
                  <time
                    dateTime={task.dueAt}
                    className={cn(
                      'flex shrink-0 items-center gap-1 pt-0.5 text-xs tabular-nums',
                      task.overdue ? 'font-medium text-critical' : 'text-muted-foreground',
                    )}
                  >
                    {task.overdue && <CircleAlert className="size-3.5" aria-hidden />}
                    {task.overdue
                      ? `Overdue · ${due < startOfToday ? dueDate.format(due) : dueTime.format(due)}`
                      : dueTime.format(due)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
        {more > 0 && (
          <Link href="/tasks" className="mt-3 block text-xs font-medium text-primary hover:underline">
            +{more} more due
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
