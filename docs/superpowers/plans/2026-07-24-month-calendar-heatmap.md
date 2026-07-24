# Month Calendar Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's weekday×time-of-day heatmap with a vertical stack of month calendar grids — which calendar days had coffee, and how much.

**Architecture:** A new pure `monthGrids` stat buckets consumption into contiguous month grids (newest first, one global shade scale). A new `MonthCalendar` component renders each month as an accessible `<table>`. `DashboardView` swaps the old stat + component for the new pair; the old `weekGrid` stat and `WeekGrid` component are deleted.

**Tech Stack:** React 19 · TypeScript 5.9 · Tailwind v4 · Vitest + Testing Library · oxlint · oxfmt.

## Global Constraints

- TypeScript house bans: no `any`, no `as` (except `as const`), no `!`, no `// @ts-*`. `type` over `interface`. Prefer `for..of`.
- Money/counts are integers; the stats module is pure (plain rows in, numbers out; no React/DB/async/throws; testable with array literals).
- Cell shade ramp: `opacity = ACCENT_INK_FLOOR + (cups / max) * (1 - ACCENT_INK_FLOOR)`, importing `ACCENT_INK_FLOOR` from `components/chart-ink.ts` (currently 0.62; the WCAG 1.4.11 3:1 floor). Empty-day outline uses `--color-border-graphic`.
- Accessibility contract (matches existing `WeekGrid`): colour carries value visually; every real day carries its date + count as sr-only text; swatches are `aria-hidden`.
- Monday-first week. Consumption only (`delta < 0`); orders (`delta > 0`) are never cups.
- Commit style: `type(scope): subject` with repeated `-m` flags; scope = `coffee`. No `Claude-Session:` trailer.
- After each task, gates must pass: `npm run typecheck && npm run lint && npm test`. Full gate at the end also runs `npm run format:check && npm run build`.

---

### Task 1: `monthGrids` pure stat

Additive — `weekGrid` stays untouched this task so the tree stays green.

**Files:**

- Modify: `src/features/coffee/stats.ts` (add function + types; add `startOfMonth` to the datetime import)
- Test: `src/features/coffee/stats.test.ts` (add `monthGrids` to the stats import; append tests)

**Interfaces:**

- Consumes: `Movement` (from `./db`), `dayKey` + `startOfMonth` (from `./datetime`).
- Produces:

  ```ts
  export type MonthGrid = {
    at: number; // local midnight on the 1st of the month
    days: number[]; // cups per day-of-month, 1-indexed (days[1] = the 1st); index 0 unused
  };
  export type MonthGrids = {
    months: MonthGrid[]; // newest month first
    max: number; // largest single-day cup count across ALL months, floored at 1
  };
  export function monthGrids(rows: Pick<Movement, 'delta' | 'at'>[]): MonthGrids;
  ```

- [ ] **Step 1: Write the failing tests**

Add to the top of the stats import in `src/features/coffee/stats.test.ts` — add `monthGrids` and the type, and add `startOfMonth` to the datetime import (it is not yet imported there):

```ts
import {
  startOfDaysAgo,
  startOfMonth,
  startOfMonthsAgo,
  startOfPrevMonth,
  startOfToday,
} from './datetime';
import {
  averageCups,
  costPerCapsule,
  dailyCups,
  habitCost,
  monthGrids,
  orderCadence,
  orderSuggestions,
  spendByMonth,
  weekGrid,
  type WeekGrid,
} from './stats';
```

Append these tests to the end of `src/features/coffee/stats.test.ts`:

```ts
const HOUR = 3_600_000;

test('monthGrids on an empty log has no months', () => {
  expect(monthGrids([])).toEqual({ months: [], max: 1 });
});

// Cups only. An order carries no cup, so a log of pure orders has nothing to lay out.
test('monthGrids ignores orders', () => {
  expect(monthGrids([{ delta: 30, at: startOfToday() + 9 * HOUR }])).toEqual({
    months: [],
    max: 1,
  });
});

test('monthGrids buckets this month by day-of-month and ignores orders in the same day', () => {
  const todayDate = new Date(startOfToday()).getDate();
  const data = monthGrids([
    { delta: -2, at: startOfToday() + 9 * HOUR },
    { delta: -1, at: startOfToday() + 20 * HOUR },
    { delta: 50, at: startOfToday() + 10 * HOUR }, // an order — must not count
  ]);

  expect(data.months).toHaveLength(1);
  expect(data.months[0]?.at).toBe(startOfMonth());
  expect(data.months[0]?.days[todayDate]).toBe(3);
  expect(data.max).toBe(3);
});

// The local-day guard: a cup at the very first millisecond of the local day lands on that day,
// not the day before (which a UTC bucketing would give east of Greenwich). Mirrors the dailyCups
// midnight test.
test('monthGrids buckets a cup by its local calendar day, not UTC', () => {
  const todayDate = new Date(startOfToday()).getDate();
  const data = monthGrids([{ delta: -1, at: startOfToday() }]);

  expect(data.months[0]?.days[todayDate]).toBe(1);
});

test('monthGrids spans contiguous months, newest first', () => {
  const data = monthGrids([
    { delta: -1, at: startOfToday() + 9 * HOUR }, // this month
    { delta: -1, at: startOfMonthsAgo(1) + 9 * HOUR }, // 09:00 on the 1st of last month
  ]);

  expect(data.months).toHaveLength(2);
  expect(data.months[0]?.at).toBe(startOfMonth());
  expect(data.months[1]?.at).toBe(startOfPrevMonth());
  expect(data.months[1]?.days[1]).toBe(1); // the 1st of last month
});

// A dormant month between two active ones is present as an all-zero grid, never skipped — else the
// timeline silently compresses, the same failure dailyCups guards against by zero-filling days.
test('monthGrids keeps a dormant middle month as an all-zero grid', () => {
  const data = monthGrids([
    { delta: -1, at: startOfToday() + 9 * HOUR },
    { delta: -1, at: startOfMonthsAgo(2) + 9 * HOUR },
  ]);

  expect(data.months).toHaveLength(3);
  expect(data.months[1]?.at).toBe(startOfMonthsAgo(1));
  expect(data.months[1]?.days.every((c) => c === 0)).toBe(true);
});

// One global scale, not per-month: a heavy day two months ago sets the max a light recent day is
// shaded against, so a dark cell means the same cup-count everywhere.
test('monthGrids scales max globally across every month', () => {
  const todayDate = new Date(startOfToday()).getDate();
  const data = monthGrids([
    { delta: -1, at: startOfToday() + 9 * HOUR }, // light, recent
    { delta: -5, at: startOfMonthsAgo(2) + 9 * HOUR }, // heavy, old
  ]);

  expect(data.max).toBe(5);
  expect(data.months[0]?.days[todayDate]).toBe(1);
  expect(data.months[2]?.days[1]).toBe(5);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- stats.test.ts`
Expected: FAIL — `monthGrids is not a function` / `monthGrids` has no export (import error).

- [ ] **Step 3: Implement `monthGrids`**

In `src/features/coffee/stats.ts`, add `startOfMonth` to the datetime import at the top:

```ts
import { dayKey, startOfDaysAgo, startOfMonth, startOfMonthsAgo } from './datetime';
```

Append the function and its types to `src/features/coffee/stats.ts`:

```ts
export type MonthGrid = {
  at: number; // local midnight on the 1st of the month
  days: number[]; // cups per day-of-month, 1-indexed (days[1] = the 1st); index 0 unused
};

export type MonthGrids = {
  months: MonthGrid[]; // newest month first
  max: number; // largest single-day cup count across ALL months, floored at 1
};

// Which calendar days you drank, laid out as month grids for the Dashboard. Consumption only
// (delta < 0). Months are CONTIGUOUS from the current month back to the month of the earliest cup:
// a dormant month in between is an all-zero grid, never skipped, so the timeline can't silently
// compress (same rule as dailyCups zero-filling days). `max` is the busiest single day across ALL
// months, floored at 1, so one global shade scale means a dark cell reads the same in every month.
//
// Reads the clock (startOfMonth, and `new Date()` for day timestamps). Safe for the same reason the
// rest of the dashboard's clock-reading stats are: movements is [] on the server and on the client's
// first render (use-coffee loads in a mount effect), so DashboardView's movements.length === 0 early
// return fires on both passes and this never runs during hydration.
export function monthGrids(rows: Pick<Movement, 'delta' | 'at'>[]): MonthGrids {
  // One pass: bucket consumption by local day key and remember the earliest cup.
  const perDay = new Map<string, number>();
  let earliest = Number.POSITIVE_INFINITY;
  for (const m of rows) {
    if (m.delta >= 0) continue;
    perDay.set(dayKey(m.at), (perDay.get(dayKey(m.at)) ?? 0) + -m.delta);
    if (m.at < earliest) earliest = m.at;
  }

  if (perDay.size === 0) return { months: [], max: 1 };

  const start = new Date(earliest);
  const startYear = start.getFullYear();
  const startMonth = start.getMonth();

  const months: MonthGrid[] = [];
  let max = 0;
  // startOfMonth() is local midnight on the 1st of the current month; keeping the cursor on the 1st
  // means setMonth(-1) can't overflow (the 31st→wrong-month trap datetime.ts documents).
  const cursor = new Date(startOfMonth());
  while (
    cursor.getFullYear() > startYear ||
    (cursor.getFullYear() === startYear && cursor.getMonth() >= startMonth)
  ) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    // Day 0 of the next month is the last day of this one — the day count, without a lookup table.
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth + 1 }, () => 0);
    for (let d = 1; d <= daysInMonth; d++) {
      const cups = perDay.get(dayKey(new Date(year, month, d).getTime())) ?? 0;
      days[d] = cups;
      if (cups > max) max = cups;
    }
    months.push({ at: cursor.getTime(), days });
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return { months, max: Math.max(max, 1) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- stats.test.ts`
Expected: PASS (all existing weekGrid/dailyCups/etc. tests still green too).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "feat(coffee): add monthGrids stat for the calendar heatmap" -m "Buckets consumption into contiguous month grids (newest first) from the current month back to the earliest logged cup, with one global shade scale. Pure and array-literal tested."
```

---

### Task 2: `MonthCalendar` component

Additive — the component is not wired into the dashboard yet, so the tree stays green. It gets its own standalone component test (the pattern `movement-row.test.tsx` / `bottom-nav.test.tsx` already use).

**Files:**

- Create: `src/features/coffee/components/MonthCalendar.tsx`
- Test: `src/features/coffee/month-calendar.test.tsx`

**Interfaces:**

- Consumes: `MonthGrid` + `MonthGrids` (from `../stats`), `startOfToday` (from `../datetime`), `ACCENT_INK_FLOOR` (from `./chart-ink`).
- Produces: `export function MonthCalendar({ data, today }: { data: MonthGrids; today?: number })`. `today` defaults to `startOfToday()` and exists as a test seam (same injectable-clock pattern as `orderCadence`'s `now`). Renders one `<table>` per month plus a legend; renders a single `no cups logged yet` line when `data.months` is empty.

- [ ] **Step 1: Write the failing component tests**

Create `src/features/coffee/month-calendar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ACCENT_INK_FLOOR } from './components/chart-ink';
import { MonthCalendar } from './components/MonthCalendar';
import type { MonthGrids } from './stats';

const JAN_2026 = new Date(2026, 0, 1).getTime();
const JAN_15 = new Date(2026, 0, 15).getTime(); // a fixed, injected "today" (local midnight)

// A single January grid with cups on specific days. days is 1-indexed; index 0 is unused.
function january(cupsByDay: Record<number, number>): MonthGrids {
  const days = Array.from({ length: 32 }, () => 0);
  for (const [d, cups] of Object.entries(cupsByDay)) days[Number(d)] = cups;
  return { months: [{ at: JAN_2026, days }], max: Math.max(...Object.values(cupsByDay), 1) };
}

test('empty months render one honest line, no table', () => {
  render(<MonthCalendar data={{ months: [], max: 1 }} today={JAN_15} />);

  expect(screen.getByText(/no cups logged yet/)).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('a day with cups is a filled cell carrying its date and count as text', () => {
  render(<MonthCalendar data={january({ 10: 2 })} today={JAN_15} />);

  expect(screen.getByText('Jan 10: 2 capsules')).toBeInTheDocument();
});

test('a past day with no cups is named none, not blank', () => {
  render(<MonthCalendar data={january({ 10: 2 })} today={JAN_15} />);

  expect(screen.getByText('Jan 11: none')).toBeInTheDocument();
});

// A day that hasn't happened is not a skipped day: it renders blank even if it carries cups.
test('a future day is blank', () => {
  render(<MonthCalendar data={january({ 10: 2, 20: 3 })} today={JAN_15} />);

  expect(screen.queryByText(/Jan 20/)).not.toBeInTheDocument();
});

test('each month is its own table, newest first, with seven weekday columns', () => {
  const feb = { at: new Date(2026, 1, 1).getTime(), days: Array.from({ length: 29 }, () => 0) };
  const jan = { at: JAN_2026, days: Array.from({ length: 32 }, () => 0) };
  const data: MonthGrids = { months: [feb, jan], max: 1 };
  render(<MonthCalendar data={data} today={new Date(2026, 1, 20).getTime()} />);

  const tables = screen.getAllByRole('table');
  expect(tables).toHaveLength(2);
  expect(tables[0]?.querySelector('caption')?.textContent).toBe('February 2026');
  expect(screen.getByText('January 2026')).toBeInTheDocument();
  expect(screen.getAllByRole('columnheader')).toHaveLength(14); // 7 per table
});

// A single cup shaded against a busy month must still clear WCAG 1.4.11's 3:1 — the ramp starts at
// ACCENT_INK_FLOOR by construction, so the lightest possible non-zero cell is the one to check.
test('a single-cup day against a busy scale still clears the contrast floor', () => {
  const days = Array.from({ length: 32 }, () => 0);
  days[10] = 1;
  render(<MonthCalendar data={{ months: [{ at: JAN_2026, days }], max: 10 }} today={JAN_15} />);

  const swatch = screen
    .getByText('Jan 10: 1 capsules')
    .closest('td')
    ?.querySelector('[aria-hidden="true"]');
  const opacity = Number(/opacity:\s*([0-9.]+)/.exec(swatch?.getAttribute('style') ?? '')?.[1]);
  expect(opacity).toBeGreaterThanOrEqual(ACCENT_INK_FLOOR);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- month-calendar.test.tsx`
Expected: FAIL — cannot find module `./components/MonthCalendar`.

- [ ] **Step 3: Implement the component**

Create `src/features/coffee/components/MonthCalendar.tsx`:

```tsx
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
          <tr key={w}>
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- month-calendar.test.tsx`
Expected: PASS.

Note: if oxlint flags the `<tr key={w}>` array-index key, change it to `key={`w${w}`}` — the row order is stable so the index is safe, this only satisfies the rule.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/components/MonthCalendar.tsx src/features/coffee/month-calendar.test.tsx
git commit -m "feat(coffee): add MonthCalendar month-heatmap component" -m "Vertical stack of month calendar tables, newest first: colour carries the cup count, every real day names its date and count in sr-only text, future days render blank. Not wired into the dashboard yet."
```

---

### Task 3: Cutover — wire in, delete the old heatmap

Everything that references the old heatmap changes together, so the tree is only green again at the end of this task. This is the atomic replace.

**Files:**

- Modify: `src/features/coffee/components/DashboardView.tsx` (swap stat + component in block 3)
- Modify: `src/features/coffee/dashboard-view.test.tsx` (update the two grid tests)
- Modify: `src/features/coffee/stats.ts` (delete `weekGrid`, the `WeekGrid` type, and the now-unused `BANDS`/`WEEKDAYS` consts)
- Modify: `src/features/coffee/stats.test.ts` (delete `weekGrid` tests, the `rowSums` helper, and the `weekGrid`/`WeekGrid` imports)
- Delete: `src/features/coffee/components/WeekGrid.tsx`
- Modify (comment tidy): `src/features/coffee/components/chart-ink.ts`, `src/features/coffee/components/TrendChart.tsx`

**Interfaces:**

- Consumes: `monthGrids` + `MonthGrids` and `MonthCalendar` from Tasks 1–2.
- Produces: nothing new; `weekGrid`, `WeekGrid` (type + component) cease to exist.

- [ ] **Step 1: Update the dashboard's two grid tests (write them first, expect failure)**

In `src/features/coffee/dashboard-view.test.tsx`, replace the test `the grid is a table whose cells carry their counts as text` (the one querying `/Capsules by weekday and time of day/`, 7 columnheaders, 4 rowheaders) with:

```tsx
// The calendar carries each day's count as colour, so every count must also be readable as text or
// the block is inaccessible by construction. steadyDrinker() drinks two a day, so at least one
// "...: 2 capsules" label must be present, inside a month table.
test('the calendar renders month tables that carry each day count as text', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
  // 7 weekday column headers per month table.
  expect(screen.getAllByRole('columnheader').length % 7).toBe(0);
  expect(screen.getAllByText(/: 2 capsules/).length).toBeGreaterThan(0);
});
```

And replace the test `a log with no orders still renders the trend and the grid` (which calls `getByRole('table')` — now ambiguous with one table per month) with:

```tsx
// A page that logged cups but never an order still has a trend and a calendar to show; only the cost
// block should degrade.
test('a log with no orders still renders the trend and the calendar', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.getByText(/capsules a day/)).toBeInTheDocument();
  expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
});
```

The `gridFixture()` helper (lines ~89–99) is now unused — delete it.

- [ ] **Step 2: Run the dashboard tests to confirm they fail against the old component**

Run: `npm test -- dashboard-view.test.tsx`
Expected: FAIL — the new tests can't find month tables / `: 2 capsules` (the old `WeekGrid` is still wired in).

- [ ] **Step 3: Swap the stat and component in `DashboardView.tsx`**

In `src/features/coffee/components/DashboardView.tsx`, change the stats import — remove `weekGrid`, add `monthGrids`:

```tsx
import {
  averageCups,
  dailyCups,
  habitCost,
  monthGrids,
  orderCadence,
  spendByMonth,
  type MonthSpend,
} from '../stats';
```

Change the component import:

```tsx
import { MonthCalendar } from './MonthCalendar';
```

(remove `import { WeekGrid } from './WeekGrid';`)

Replace the grid derivation line `const grid = weekGrid(movements, WINDOW_DAYS);` with:

```tsx
const calendar = monthGrids(movements);
```

Replace the block-3 body `<WeekGrid grid={grid} />` with:

```tsx
<MonthCalendar data={calendar} />
```

Leave the block-3 heading `When you drink` and everything else unchanged.

- [ ] **Step 4: Delete the old component**

Run: `git rm src/features/coffee/components/WeekGrid.tsx`

- [ ] **Step 5: Remove `weekGrid` from the stats module**

In `src/features/coffee/stats.ts`, delete the `WeekGrid` type export (the `export type WeekGrid = {...}` block), the `const BANDS = 4;` and `const WEEKDAYS = 7;` lines, and the entire `export function weekGrid(...) {...}` function. Leave `dailyCups`, `averageCups`, `monthGrids`, and everything else intact. `startOfDaysAgo` stays imported (still used by `dailyCups`).

- [ ] **Step 6: Remove the `weekGrid` tests**

In `src/features/coffee/stats.test.ts`:

- Change the stats import to drop `weekGrid` and `type WeekGrid`:

```ts
import {
  averageCups,
  costPerCapsule,
  dailyCups,
  habitCost,
  monthGrids,
  orderCadence,
  orderSuggestions,
  spendByMonth,
} from './stats';
```

- Delete the `rowSums` helper (the `function rowSums(grid: WeekGrid)...` block and its lead comment) and every `test('weekGrid ...')` test (there are eight, from `weekGrid buckets each cup by its local hour band` through `weekGrid on an empty log is a full grid of zeros`).

- [ ] **Step 7: Tidy the two stale comments**

`WeekGrid` no longer exists, so update the comments that name it:

In `src/features/coffee/components/chart-ink.ts`, the line reading `// binds every chart drawn in the accent. Held privately by WeekGrid, it went unseen by the two` — change `WeekGrid` to `the weekday grid` (it is describing history; keep the sentence, just don't name a deleted symbol). Suggested: `// binds every chart drawn in the accent. Once held privately by the weekday grid, it went unseen by the two`.

In `src/features/coffee/components/TrendChart.tsx`, the line `numbers and no question answered. WeekGrid gets this from its <caption>; a <ul> has no` — change `WeekGrid` to `MonthCalendar` (the current component that models the same caption pattern): `numbers and no question answered. MonthCalendar gets this from its <caption>; a <ul> has no`.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — `stats.test.ts`, `month-calendar.test.tsx`, `dashboard-view.test.tsx`, and the rest all green, no lingering `weekGrid`/`WeekGrid` references.

- [ ] **Step 9: Full quality gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: all clean, exit 0. If `format:check` flags anything, run `npm run format` (oxfmt) and re-run the gate.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(coffee): replace weekday heatmap with the month calendar" -m "Dashboard block 3 now stacks month calendar grids (monthGrids + MonthCalendar) instead of the weekday x time-of-day WeekGrid. Deletes the weekGrid stat, the WeekGrid component, and their tests; retargets two stale comments." -m "Design: docs/superpowers/specs/2026-07-24-month-calendar-heatmap-design.md"
```

---

## Manual verification (after Task 3)

The tests pin the logic; give the real UI one look on a phone-width viewport (the target is a Samsung S24 Ultra, dark mode):

1. `npm run dev`, open the dashboard with a log that has cups across at least two months.
2. Confirm: block 3 heading still reads "When you drink"; below it, month grids stack newest-first; each grid shows the correct month label; dark cells cluster on your heavy days; empty days show a faint outline; days later this month are blank; the "less ▢▢■ more" legend sits under the stack.
3. Confirm nothing scrolls sideways — the whole thing lives in the page's vertical scroll.

```

```
