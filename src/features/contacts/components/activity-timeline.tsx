import {
  ArrowRightLeft, CalendarPlus, CheckCircle2, FileUp, History, ListPlus, Mail, MessageSquare, Pencil, Phone,
  StickyNote, Tag, TagIcon, UserCheck, UserPlus, Users,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActivityType } from '../constants';
import type { ActivityItem } from '../types';
import { LogActivityForm } from './log-activity-form';

const ICONS: Record<ActivityType, LucideIcon> = {
  contact_created: UserPlus,
  contact_imported: FileUp,
  contact_updated: Pencil,
  tag_added: Tag,
  tag_removed: TagIcon,
  note_added: StickyNote,
  lead_created: ListPlus,
  lead_status_changed: ArrowRightLeft,
  lead_assigned: UserCheck,
  task_created: ListPlus,
  task_completed: CheckCircle2,
  appointment_scheduled: CalendarPlus,
  call: Phone,
  email: Mail,
  text: MessageSquare,
  meeting: Users,
};

const MANUAL = new Set<ActivityType>(['call', 'email', 'text', 'meeting']);

export function ActivityTimeline({
  contactId,
  activities,
  timezone,
}: {
  contactId: string;
  activities: ActivityItem[];
  timezone: string;
}) {
  const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <LogActivityForm contactId={contactId} />
        {activities.length === 0 ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <History className="size-4" aria-hidden /> No activity yet.
          </p>
        ) : (
          <ol className="relative space-y-4 border-l pl-6">
            {activities.map((a) => {
              const Icon = ICONS[a.type] ?? History;
              return (
                <li key={a.id} className="relative">
                  <span className="absolute top-0.5 -left-[2.0625rem] flex size-6 items-center justify-center rounded-full bg-background ring-1 ring-foreground/10">
                    <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                  </span>
                  <p className="text-sm">
                    {MANUAL.has(a.type) && <span className="font-medium capitalize">{a.type}: </span>}
                    {a.summary}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.actorName ?? 'System'} · <time dateTime={a.occurredAt}>{when.format(new Date(a.occurredAt))}</time>
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
