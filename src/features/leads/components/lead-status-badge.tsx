import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LeadStatus } from '@/types/database.types';
import { LEAD_STATUS } from '../constants';

/** Status is always shown as a text label; color is a secondary cue. */
export function LeadStatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  const s = LEAD_STATUS[status];
  return (
    <Badge variant="secondary" className={cn('border-transparent', s.className, className)}>
      {s.label}
    </Badge>
  );
}
