import Link from 'next/link';
import { CalendarDays, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AppointmentType } from '@/types/database.types';
import { getAppointments } from '../queries';
import type { DashboardScope } from '../types';
import { EmptyState, WidgetError } from './widget-states';

const TYPE_LABELS: Record<AppointmentType, string> = {
  showing: 'Showing',
  listing_presentation: 'Listing appt',
  buyer_consultation: 'Buyer consult',
  open_house: 'Open house',
  inspection: 'Inspection',
  appraisal: 'Appraisal',
  closing: 'Closing',
  call: 'Call',
  meeting: 'Meeting',
  other: 'Other',
};

export async function AppointmentsCard({ scope, className }: { scope: DashboardScope; className?: string }) {
  let a;
  try {
    a = await getAppointments(scope);
  } catch (error) {
    console.error('[dashboard] appointments failed', error);
    return <WidgetError title="Appointments" className={className} />;
  }

  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: scope.timezone });
  const more = a.todayCount - a.today.length;

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Appointments</CardTitle>
        <CardDescription>
          {a.todayCount} today · {a.next7DaysCount} in the next 7 days
        </CardDescription>
        <CardAction>
          <Link href="/calendar" className="text-sm font-medium text-primary hover:underline">
            Calendar
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {a.today.length === 0 ? (
          <EmptyState icon={CalendarDays}>Nothing on the calendar today.</EmptyState>
        ) : (
          <ol className="divide-y">
            {a.today.map((appt) => (
              <li key={appt.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                <time
                  dateTime={appt.startsAt}
                  className="w-16 shrink-0 pt-0.5 text-xs font-medium text-muted-foreground tabular-nums"
                >
                  {appt.allDay ? 'All day' : time.format(new Date(appt.startsAt))}
                </time>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate font-medium">{appt.title}</p>
                  <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="shrink-0">
                      {TYPE_LABELS[appt.type]}
                    </Badge>
                    {(appt.propertyAddress || appt.location) && (
                      <MapPin className="size-3 shrink-0" aria-hidden />
                    )}
                    <span className="truncate">
                      {[appt.propertyAddress ?? appt.location, appt.contactName].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        {more > 0 && (
          <Link href="/calendar" className="mt-3 block text-xs font-medium text-primary hover:underline">
            +{more} more today
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
