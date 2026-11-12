/**
 * Timezone-aware calendar math without a date library.
 * "Today" on the dashboard means today in the AGENT's timezone (profiles.timezone),
 * not the server's (UTC on Vercel) — otherwise "Leads today" resets at 4–8pm US time.
 */

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of `date` as seen in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function offsetMs(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant of local midnight on year/month/day in `timeZone`.
 * Month/day may overflow (month 13, day 0) — Date.UTC normalizes them.
 */
export function zonedMidnight(year: number, month: number, day: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day);
  const first = offsetMs(new Date(guess), timeZone);
  let instant = guess - first;
  const second = offsetMs(new Date(instant), timeZone); // re-check across DST shifts
  if (second !== first) instant = guess - second;
  return new Date(instant);
}

export type CalendarBounds = ReturnType<typeof calendarBounds>;

/** Common ranges for dashboards, all as UTC instants. */
export function calendarBounds(timeZone: string, now = new Date()) {
  const { year, month, day } = zonedParts(now, timeZone);
  return {
    now,
    startOfToday: zonedMidnight(year, month, day, timeZone),
    startOfTomorrow: zonedMidnight(year, month, day + 1, timeZone),
    startOfYesterday: zonedMidnight(year, month, day - 1, timeZone),
    endOfWeek: zonedMidnight(year, month, day + 7, timeZone),
    startOfMonth: zonedMidnight(year, month, 1, timeZone),
    startOfLastMonth: zonedMidnight(year, month - 1, 1, timeZone),
    startOfYear: zonedMidnight(year, 1, 1, timeZone),
    /** First day of the month 11 months ago → a 12-month window including this month. */
    startOf12MonthWindow: zonedMidnight(year, month - 11, 1, timeZone),
    year,
    month,
  };
}

/** 'YYYY-MM' for the month `date` falls in, in `timeZone`. */
export function monthKey(date: Date, timeZone: string) {
  const { year, month } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
