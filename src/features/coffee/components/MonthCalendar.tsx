'use client';

import { useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { startOfToday } from '../core/datetime';
import type { MonthGrid, MonthGrids } from '../core/stats';
import { ChevronDownIcon } from './icons';

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
// The ramp runs DARK to LIGHT as the count rises: a busy day is the brightest amber on the screen,
// which is the conventional heatmap direction and keeps the heaviest days from receding into a dark
// page.
//
// These are percentages, not opacities, because opacity on the cell would fade the DIGIT along with
// the fill and void the contrast maths below. color-mix over --color-bg composites the fill alone
// and reproduces exactly the sRGB arithmetic those numbers were derived from.
export const SHADES = [0, 30, 45, 62, 85, 100] as const;

// At or above this mix percentage the cell is light enough that --color-on-accent (#1a1206) clears
// WCAG 2.2 1.4.3's 4.5:1 on it; below it, the cell is dark enough that --color-text (#ecedf1) does.
//
// The gap in SHADES between 62 and 85 is not a taste call: composited over --color-bg those mixes
// land at relative luminance 0.1264 and 0.2251, and every fill BETWEEN luminance 0.1495 and 0.2055
// clears 4.5:1 against neither ink. The ramp steps over that dead band rather than landing in it, so
// each rung has an ink that passes: 30→9.94:1, 45→7.26:1, 62→5.09:1, 85→4.85:1, 100→6.31:1.
//
// This is why the grid no longer imports ACCENT_INK_FLOOR. That constant exists because a bare
// swatch IS the information, so 1.4.11's 3:1 for a graphical object binds it — still true of the
// trend and spend bars, which keep it. Here the cell states its own count as text, the fill drops to
// reinforcement, and the binding rule moves to the digit's 4.5:1. Relaxing 1.4.11 is what buys the
// ramp enough range to be worth shading at all.
export const DARK_INK_FROM = 85;

// Ported from moniflow's CycleSwipe, which solves the same problem (drag sideways to change the
// period a chart is showing). Same numbers: 44px of travel to commit — the app's minimum tap target,
// so a swipe has to out-travel a tap before it counts — and the grid trails the finger at half speed
// as the affordance, then springs back if the gesture falls short.
const THRESHOLD = 44;
const DAMP = 0.5;

// How far to STEP THE INDEX for a horizontal drag of `dx` px. months is newest-first, so a rightward
// drag (dx > 0) walks back in time and therefore UP the array. Pure and exported because jsdom has no
// pointer capture: simulating the gesture is a fight, while the decision it turns on is one branch.
export function resolveSwipe(dx: number, threshold = THRESHOLD): -1 | 0 | 1 {
  if (dx <= -threshold) return -1; // dragged left → forward in time → newer month
  if (dx >= threshold) return 1; // dragged right → back in time → older month
  return 0;
}

// Which days you drank, one month at a time — the Dashboard's third block. Opens on the current
// month for free: monthGrids returns months newest-first (see its contiguous-months contract), so
// index 0 IS the current month and the initial state needs no clock read of its own.
//
// The month is a real <table> (weeks as rows, weekdays as columns). Every real day prints its capsule
// count and also names itself and that count in an sr-only span, so a screen reader reads a dated
// list rather than a picture. `today` is injectable purely as a test seam, like orderCadence's `now`.
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
  // Index into data.months, so 0 is the newest month and larger is further back in time.
  const [index, setIndex] = useState(0);
  // The visible month heading doubles as the table's accessible name, so the month is written once.
  const headingId = useId();
  // Live gesture state: where the finger went down, and how far it has travelled since.
  const startX = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Orders on file but no cups ever → nothing to lay out. The block keeps its heading; this is the
  // one honest line, mirroring how the cost block degrades to "no orders logged yet". Declared after
  // the hook so the hook order stays stable across renders.
  if (data.months.length === 0) {
    return <p className="mt-3 text-sm text-[var(--color-muted)]">no cups logged yet</p>;
  }

  // The log can shrink under a stale index — a restore or a delete drops months off the end.
  const at = Math.min(index, data.months.length - 1);
  const month = data.months[at];
  if (month === undefined) {
    return <p className="mt-3 text-sm text-[var(--color-muted)]">no cups logged yet</p>;
  }

  const label = monthLabel.format(month.at);

  // Both the buttons and the swipe land here, so the ends of the log are enforced in one place.
  const step = (delta: number): void =>
    setIndex(Math.max(0, Math.min(at + delta, data.months.length - 1)));

  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
    startX.current = e.clientX;
    setDragging(true);
    // Capture so the gesture survives the finger leaving the grid mid-drag.
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>): void {
    if (startX.current === null) return;
    setDx(e.clientX - startX.current);
  }

  // Also the pointercancel handler: a cancelled gesture must reset the transform, or the grid is
  // left parked off-centre with no finger to bring it back.
  function onPointerUp(): void {
    if (startX.current === null) return;
    step(resolveSwipe(dx));
    startX.current = null;
    setDragging(false);
    setDx(0);
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        {/* Older is FORWARD through the array, because months are newest-first. */}
        <MonthStep
          label="Previous month"
          onClick={() => step(1)}
          disabled={at >= data.months.length - 1}
          className="rotate-90"
        />
        {/* aria-live: the buttons keep their static labels, so without this a screen reader hears
            "Previous month" and nothing about which month it landed on. */}
        <p
          id={headingId}
          aria-live="polite"
          className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]"
        >
          {label}
        </p>
        <MonthStep
          label="Next month"
          onClick={() => step(-1)}
          disabled={at <= 0}
          className="-rotate-90"
        />
      </div>

      {/* Only the grid follows the finger, not the stepper header above it: the header holds the
          controls, and sliding a disabled button out from under a thumb reads as a glitch. touch-pan-y
          claims the horizontal axis and leaves vertical scrolling native, so dragging down the
          Dashboard still scrolls the page rather than fighting this. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // A mouse drag would otherwise start the browser's native drag and swallow the gesture.
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
        className="touch-pan-y select-none"
        style={{
          transform: `translateX(${dragging ? dx * DAMP : 0}px)`,
          transition: dragging ? 'none' : 'transform var(--dur-fast) var(--ease-out)',
        }}
      >
        <MonthTable month={month} labelledBy={headingId} today={today} />
      </div>
    </div>
  );
}

// A 44px tap target per the app's minimum, wrapping the shared disclosure caret rather than adding a
// second chevron: rotated a quarter turn it is already the left/right arrow this needs.
function MonthStep({
  label,
  onClick,
  disabled,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-muted)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-30"
    >
      <ChevronDownIcon className={`h-5 w-5 ${className}`} />
    </button>
  );
}

function MonthTable({
  month,
  labelledBy,
  today,
}: {
  month: MonthGrid;
  labelledBy: string;
  today: number;
}) {
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
    // aria-labelledby rather than a <caption>: the visible month already sits in the stepper header
    // above, and a sr-only caption would repeat that same string into the accessibility tree twice.
    <table
      aria-labelledby={labelledBy}
      className="mt-1 w-full table-fixed border-separate border-spacing-1"
    >
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
  // Figure and ground swap as the count climbs — a quiet day is light ink on brown, a heavy day is
  // dark ink on amber — so neither end of the ramp recedes into the page.
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
