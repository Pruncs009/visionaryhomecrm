import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TransactionStatus } from '@/types/database.types';
import { TX_STATUS } from '../constants';

export function TxStatusBadge({ status, className }: { status: TransactionStatus; className?: string }) {
  const s = TX_STATUS[status];
  return <Badge variant="secondary" className={cn('border-transparent', s.className, className)}>{s.label}</Badge>;
}

/** Whole days from today (in the agent's timezone) to a YYYY-MM-DD date. */
export function daysUntil(date: string, timeZone: string) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()); // YYYY-MM-DD
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = date.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function relativeDays(days: number) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/** Format a date-only value without timezone shifting (it's a calendar date, not an instant). */
export function formatDateOnly(date: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatBytes(n: number | null) {
  if (n === null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
