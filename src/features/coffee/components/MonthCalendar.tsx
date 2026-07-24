'use client';

import { startOfToday } from '../datetime';
import type { MonthGrid, MonthGrids } from '../stats';
import { ACCENT_INK_FLOOR } from './chart-ink';

// Column order Monday-first, matching every other weekday view in the app.
const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
const INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

// Which days you drank, as a scrollable stack of month calendars — the Dashboard's third block. Each
// month is a real <table> (weeks as rows, weekdays as columns); colour carries the cup count visually
// while every real day also names itself and its count in an sr-only span, so a screen reader reads a
// dated list rather than a picture. Same accessibility contract, ramp, and floor as the grid it
// replaced. `today` is injectable purely as a test seam, like orderCadence's `now`.
export function MonthCalendar({
  data,
  today = startOfToday(),
}: {
  data: MonthGrids;
  today?: number;
}) {
  // Orders on file but no cups ever → nothing to lay out. The block keeps its heading; this is the
  // one honest line, mirroring how the cost block degrades to "no orders logged yet".
  if (data.months.length === 0) {
    return <p className="mt-3 text-sm text-[var(--color-muted)]">no cups logged yet</p>;
  }

  return (
    <div className="mt-3 flex flex-col gap-6">
      {data.months.map((month) => (
        <MonthTable key={month.at} month={month} max={data.max} today={today} />
      ))}

      {/* Global scale needs an anchor for what dark means. aria-hidden: every cell already names its
          own count, so the ramp is decoration for a screen reader. */}
      <p aria-hidden="true" className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
        less
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <span
            key={f}
            className="inline-block h-3 w-3 rounded-sm bg-[var(--color-accent)]"
            style={{ opacity: ACCENT_INK_FLOOR + f * (1 - ACCENT_INK_FLOOR) }}
          />
        ))}
        more
      </p>
    </div>
  );
}

function MonthTable({ month, max, today }: { month: MonthGrid; max: number; today: number }) {
  const first = new Date(month.at);
  const year = first.getFullYear();
  const monthIndex = first.getMonth();
  const daysInMonth = month.days.length - 1;
  // Monday-first blanks before the 1st. getDay() is Sunday-first, so Sunday (0) maps to 6.
  const leadOffset = (first.getDay() + 6) % 7;

  // Flatten to leading blanks + each day + trailing blanks, then chunk into whole weeks.
  const cells: ({ dayOfMonth: number } | null)[] = [];
  for (let i = 0; i < leadOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ dayOfMonth: d });
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    // table-fixed so every column is equal width — width must not read as quantity (see WeekGrid's
    // note; colour is the only thing that varies here).
    <table className="w-full table-fixed border-separate border-spacing-1">
      <caption className="mb-1 text-left text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]">
        {monthLabel.format(month.at)}
      </caption>
      <thead>
        <tr>
          {DAYS.map((day, i) => (
            <th key={day} scope="col" className="text-[10px] font-normal text-[var(--color-muted)]">
              <span aria-hidden="true">{INITIALS[i]}</span>
              <span className="sr-only">{day}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, w) => (
          <tr key={`w${w}`}>
            {week.map((cell, i) => (
              <td key={cell === null ? `b${i}` : `d${cell.dayOfMonth}`} className="p-0">
                {cell === null ? (
                  <span aria-hidden="true" className="block h-5" />
                ) : (
                  <DayCell
                    at={new Date(year, monthIndex, cell.dayOfMonth).getTime()}
                    cups={month.days[cell.dayOfMonth] ?? 0}
                    max={max}
                    today={today}
                  />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DayCell({
  at,
  cups,
  max,
  today,
}: {
  at: number;
  cups: number;
  max: number;
  today: number;
}) {
  // A day that hasn't happened is not a skipped day: render nothing, not a zero-cup outline.
  if (at > today) return <span aria-hidden="true" className="block h-5" />;

  const label = dayLabel.format(at);

  if (cups === 0) {
    return (
      <>
        <span className="sr-only">{label}: none</span>
        {/* Empty is a positive state: an outline reads as "no cup that day", where a faint fill reads
            as "same as the page". --color-border-graphic is the ramp rung that clears 3:1. */}
        <span
          aria-hidden="true"
          className="block h-5 rounded-sm border border-[var(--color-border-graphic)]"
        />
      </>
    );
  }

  return (
    <>
      <span className="sr-only">
        {label}: {cups} capsules
      </span>
      <span
        aria-hidden="true"
        className="block h-5 rounded-sm bg-[var(--color-accent)]"
        style={{ opacity: ACCENT_INK_FLOOR + (cups / max) * (1 - ACCENT_INK_FLOOR) }}
      />
    </>
  );
}
