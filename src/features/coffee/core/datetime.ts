// Date/time helpers. All formatting goes through Intl (never string slicing/padding) and all period
// boundaries use local-timezone Date arithmetic, per the house date rules.

const time = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dayFull = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});
const dayShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dayShortYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const dateISOLocal = new Intl.DateTimeFormat('en-CA'); // YYYY-MM-DD in local tz
const monthFull = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

const MS_PER_DAY = 86_400_000;

// ── Period boundaries (ms). Date arithmetic, not string slicing, so they respect the device tz. ──

export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Most recent Sunday at local midnight (getDay(): 0 = Sunday). setDate() handles month underflow.
export function startOfWeekSunday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export function startOfMonth(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

// Local midnight `n` days ago (0 = today). setDate() handles month/year underflow, and stepping by
// calendar date rather than subtracting 86_400_000ms keeps the result at midnight across a DST shift.
export function startOfDaysAgo(n: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
}

// Local midnight on the 1st of the previous calendar month. setDate(1) MUST come before setMonth():
// on the 31st, decrementing the month first would overflow into the wrong month.
export function startOfPrevMonth(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.getTime();
}

// Local midnight on the 1st of the calendar month `n` months ago (0 = this month). setDate(1) MUST
// come before setMonth(), for the same reason startOfPrevMonth does it: on the 31st, decrementing
// the month first overflows into the wrong month.
export function startOfMonthsAgo(n: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d.getTime();
}

// ── Display ──────────────────────────────────────────────────────────────────────────────────

export function formatTime(at: number): string {
  return time.format(at);
}

// A stable per-day key for grouping the log (local calendar day).
export function dayKey(at: number): string {
  return dateISOLocal.format(at);
}

// "Today", "Yesterday", else "Monday, Jul 14".
export function formatDayLabel(at: number): string {
  const today = startOfToday();
  if (at >= today) return 'Today';
  if (at >= today - MS_PER_DAY) return 'Yesterday';
  return dayFull.format(at);
}

// The calendar date `n` days from now — "Aug 24". Steps by calendar date rather than adding
// n × 86_400_000ms so a DST shift inside the window doesn't slide the answer a day. Gains the year
// once it lands outside this one: the runway runs to years when the pace is a cup a fortnight, and
// a bare "Aug 24" four years out reads as this August.
export function formatDaysFromNow(n: number): string {
  const now = new Date();
  const then = new Date(now);
  then.setDate(then.getDate() + n);
  return then.getFullYear() === now.getFullYear()
    ? dayShort.format(then)
    : dayShortYear.format(then);
}

// Whether two timestamps fall in the same local calendar month. Date arithmetic rather than slicing
// a formatted string, matching every period boundary above — and it must compare the year too, or
// last July and this July collapse into one month on a ledger that spans a year.
export function isSameMonth(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth();
}

// "June 2026" — the only landmark on a log that runs to 127 day-groups.
export function formatMonthLabel(at: number): string {
  return monthFull.format(at);
}

// Group newest-first items into ordered local-calendar-day sections (each keeps the group's own
// timestamp for the "Today / Yesterday / date" label). Rows only carry HH:mm, so any list that can
// span midnight needs these headers or the times read as out of order.
export function groupByDay<T extends { at: number }>(
  items: T[],
): { key: string; at: number; rows: T[] }[] {
  const groups: { key: string; at: number; rows: T[] }[] = [];
  let current: { key: string; at: number; rows: T[] } | undefined;
  for (const item of items) {
    const key = dayKey(item.at);
    if (!current || current.key !== key) {
      current = { key, at: item.at, rows: [] };
      groups.push(current);
    }
    current.rows.push(item);
  }
  return groups;
}

// ── <input type="datetime-local"> round-trip ──────────────────────────────────────────────────
// The control wants "YYYY-MM-DDThh:mm" in LOCAL time. Assemble it from two Intl outputs (no manual
// zero-padding), and read it back as local time (a tz-less datetime string parses as local).

export function toDateTimeLocal(at: number): string {
  return `${dateISOLocal.format(at)}T${time.format(at)}`;
}

export function fromDateTimeLocal(value: string): number {
  return new Date(value).getTime();
}
