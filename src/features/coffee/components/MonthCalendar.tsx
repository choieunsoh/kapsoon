'use client';

import { startOfToday } from '../datetime';
import type { MonthGrid, MonthGrids } from '../stats';

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

// How much --color-accent survives the mix with --color-bg, indexed by capsule count: SHADES[1] is a
// one-capsule day, and anything at or past the last rung clamps to it. Index 0 is unused — a
// zero-capsule day is an outline, not a fill.
//
// The ramp runs LIGHT to DARK as the count rises — the inverse of a conventional heatmap, and
// deliberate: more capsules is stronger, darker coffee. It costs nothing in legibility because the
// count is now printed in the cell, so the fill no longer has to be the loudest thing on a busy day.
//
// These are percentages, not opacities, because opacity on the cell would fade the DIGIT along with
// the fill and void the contrast maths below. color-mix over --color-bg composites the fill alone
// and reproduces exactly the sRGB arithmetic those numbers were derived from.
export const SHADES = [0, 100, 85, 62, 45, 30] as const;

// At or above this mix percentage the cell is light enough that --color-on-accent (#1a1206) clears
// WCAG 2.2 1.4.3's 4.5:1 on it; below it, the cell is dark enough that --color-text (#ecedf1) does.
//
// The gap in SHADES between 85 and 62 is not a taste call: composited over --color-bg those mixes
// land at relative luminance 0.2251 and 0.1264, and every fill BETWEEN luminance 0.1495 and 0.2055
// clears 4.5:1 against neither ink. The ramp steps over that dead band rather than landing in it, so
// each rung has an ink that passes: 100→6.31:1, 85→4.85:1, 62→5.09:1, 45→7.26:1, 30→9.94:1.
//
// This is why the grid no longer imports ACCENT_INK_FLOOR. That constant exists because a bare
// swatch IS the information, so 1.4.11's 3:1 for a graphical object binds it — still true of the
// trend and spend bars, which keep it. Here the cell states its own count as text, the fill drops to
// reinforcement, and the binding rule moves to the digit's 4.5:1. Relaxing 1.4.11 is what buys the
// ramp enough range to be worth shading at all.
export const DARK_INK_FROM = 85;

// Which days you drank, one month per screen — the Dashboard's third block. Months are laid out in a
// horizontal scroll-snap strip, newest first, so the strip opens on the current month with no scroll
// position to restore and no JS: months[0] IS the current month (see monthGrids' contiguous-months
// contract) and a fresh scroll container starts at offset 0. Swiping sideways changes month; the
// container is focusable so a keyboard can reach the older months too.
//
// Each month is a real <table> (weeks as rows, weekdays as columns). Every real day prints its
// capsule count and also names itself and that count in an sr-only span, so a screen reader reads a
// dated list rather than a picture. `today` is injectable purely as a test seam, like orderCadence's
// `now`.
//
// data.max is ignored: shading is absolute, so a 2-capsule day is the same brown in every month
// rather than shifting with whatever the busiest day happened to be.
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
    // tabIndex on a scroll container is WCAG 2.2 2.1.1: without it the older months are reachable by
    // touch and trackpad only, and a keyboard has no way to scroll the strip at all.
    <div
      role="group"
      aria-label="Calendar months, newest first — scroll sideways to change month"
      tabIndex={0}
      className="mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
    >
      {data.months.map((month) => (
        <div key={month.at} className="w-full shrink-0 snap-center">
          <MonthTable month={month} today={today} />
        </div>
      ))}
    </div>
  );
}

function MonthTable({ month, today }: { month: MonthGrid; today: number }) {
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
    // table-fixed so every column is equal width, which is also what makes the cells square: each
    // cell is aspect-square against a column width it cannot influence, so no day can grow itself by
    // carrying a wider number.
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
                  <span aria-hidden="true" className="block aspect-square w-full" />
                ) : (
                  <DayCell
                    at={new Date(year, monthIndex, cell.dayOfMonth).getTime()}
                    cups={month.days[cell.dayOfMonth] ?? 0}
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

function DayCell({ at, cups, today }: { at: number; cups: number; today: number }) {
  // A day that hasn't happened is not a skipped day: render nothing, not a zero-cup outline. It still
  // holds a square so the weeks below it don't jump up into the gap.
  if (at > today) return <span aria-hidden="true" className="block aspect-square w-full" />;

  const label = dayLabel.format(at);

  if (cups === 0) {
    return (
      <>
        <span className="sr-only">{label}: none</span>
        {/* Empty is a positive state: an outline reads as "no cup that day", where a faint fill reads
            as "same as the page". This cell carries no digit either, so the outline IS the whole
            graphic and 1.4.11's 3:1 still binds it — --color-border-graphic is the ramp rung that
            clears it. Printing a 0 here instead would make thirty quiet days the loudest thing in a
            chart about drinking coffee. */}
        <span
          aria-hidden="true"
          className="block aspect-square w-full rounded-sm border border-[var(--color-border-graphic)]"
        />
      </>
    );
  }

  const mix = SHADES[Math.min(cups, SHADES.length - 1)] ?? SHADES[1];
  // Figure and ground swap as the count climbs — a light day is dark ink on amber, a heavy day is
  // light ink on brown — so neither end of the ramp recedes into the page.
  const ink = mix >= DARK_INK_FROM ? '--color-on-accent' : '--color-text';

  return (
    <>
      <span className="sr-only">
        {label}: {cups} capsule{cups === 1 ? '' : 's'}
      </span>
      {/* aria-hidden: the sr-only span above already reads the date AND the count, so announcing the
          bare digit again would say "3" twice with no date attached to the second one. */}
      <span
        aria-hidden="true"
        className="tnum flex aspect-square w-full items-center justify-center rounded-sm text-sm font-medium"
        style={{
          backgroundColor: `color-mix(in srgb, var(--color-accent) ${mix}%, var(--color-bg))`,
          color: `var(${ink})`,
        }}
      >
        {cups}
      </span>
    </>
  );
}
