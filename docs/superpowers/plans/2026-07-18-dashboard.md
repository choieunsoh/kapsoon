# Dashboard View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Dashboard tab showing five zoomed-out stats — days of stock left, a 30-day cups-per-day chart, this-month-vs-last, cost per capsule, and a time-of-day breakdown — all derived from the existing `movements` table.

**Architecture:** All derivations live in a new pure module `src/features/coffee/stats.ts` (plain arrays in, numbers out — no React, no DB import, no async). `DashboardView.tsx` is presentational and calls those functions on `coffee.movements`. `use-coffee.ts` is **not** modified. The app has no routes; "Dashboard" is a fourth `Tab` value in the existing `useState`-driven view switch, filling the slot `BottomNav.tsx` already reserves.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5.9 · Tailwind v4 · Vitest (jsdom) · oxlint · oxfmt. No new dependencies.

## Global Constraints

- **No new dependencies.** Charts are CSS (flex + `%` heights), not a chart library.
- **TypeScript house bans:** no `any`, no `as` casts (`as const` is fine), no `!` assertions, no `// @ts-*` comments. `type` over `interface`. Prefer `for..of` over `forEach`.
- **Money is integer satang** end to end. Never a float in storage or arithmetic results; `Math.round` only at the final step. Format only at the view boundary via `formatSatang` from `./money`.
- **Dates:** all period boundaries via local-timezone `Date` arithmetic in `datetime.ts`. Never string slicing, never `toISOString()`, never manual zero-padding. Formatting goes through `Intl`.
- **Typography:** all figures carry the `.tnum` class. One typeface — never introduce a monospace font.
- **Colors:** use existing `@theme` tokens only (`--color-accent`, `--color-surface`, `--color-muted`, `--color-faint`, `--color-text`, `--color-border`, `--radius-md`). Add no new tokens.
- **`movements` is newest-first** (`listMovements` orders by `at DESC`). Stats functions must not assume ascending order.
- **Cups are stored as signed `delta`:** `delta < 0` is consumption (count as `-delta`), `delta > 0` is an order carrying a `price` total in satang.
- **Quality gates (all must pass before any commit):** `npm run typecheck && npm run lint && npm run format:check && npm test`.

---

## File Structure

| File                                               | Responsibility                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/features/coffee/datetime.ts`                  | **modify** — add `startOfDaysAgo(n)` and `startOfPrevMonth()` alongside the existing boundary helpers |
| `src/features/coffee/stats.ts`                     | **create** — five pure derivations over `Movement[]`; the only new logic in the feature               |
| `src/features/coffee/stats.test.ts`                | **create** — unit tests for those five, plain fixtures, no OPFS/React                                 |
| `src/features/coffee/components/DashboardView.tsx` | **create** — the view; formatting and markup only                                                     |
| `src/features/coffee/components/BottomNav.tsx`     | **modify** — add `'dashboard'` to `Tab`, un-disable the reserved slot                                 |
| `src/features/coffee/components/Coffee.tsx`        | **modify** — render `DashboardView` for the new tab                                                   |

Tasks 1–6 each add one self-contained, independently testable function. Task 7 builds the view. Task 8 wires the nav. A reviewer can reject any one without blocking its neighbours.

---

### Task 1: Date boundary helpers

**Files:**

- Modify: `src/features/coffee/datetime.ts` (append to the "Period boundaries" section, after `startOfMonth`)
- Test: `src/features/coffee/stats.test.ts` (create)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `startOfDaysAgo(n: number): number` — local midnight `n` days before today (`startOfDaysAgo(0) === startOfToday()`). `startOfPrevMonth(): number` — local midnight on the 1st of the previous calendar month. Both are used by Tasks 2–6.

- [ ] **Step 1: Write the failing test**

Create `src/features/coffee/stats.test.ts`:

```ts
import { expect, test } from 'vitest';
import { startOfDaysAgo, startOfMonth, startOfPrevMonth, startOfToday } from './datetime';

const MS_PER_DAY = 86_400_000;

test('startOfDaysAgo(0) is today at local midnight', () => {
  expect(startOfDaysAgo(0)).toBe(startOfToday());
});

test('startOfDaysAgo(n) is n local midnights back and always at midnight', () => {
  for (const n of [1, 13, 29]) {
    const at = startOfDaysAgo(n);
    const d = new Date(at);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    // Local days are 24h apart except across a DST shift. A DST shift is at most 1 hour,
    // so we assert elapsed is within ±1 hour of exactly n days. This tighter window catches
    // an off-by-one bug (e.g., returning n-1 days would give (n-1)·24h, still within a ±24h
    // window but violating the ±1h constraint). This must not go red in a DST timezone.
    const elapsed = startOfToday() - at;
    expect(elapsed).toBeGreaterThanOrEqual(n * MS_PER_DAY - MS_PER_HOUR);
    expect(elapsed).toBeLessThanOrEqual(n * MS_PER_DAY + MS_PER_HOUR);
  }
});

test('startOfPrevMonth is the 1st of the month before startOfMonth', () => {
  const prev = new Date(startOfPrevMonth());
  const current = new Date(startOfMonth());
  expect(prev.getDate()).toBe(1);
  expect(prev.getHours()).toBe(0);
  // Wraps the year correctly: January's previous month is December of the prior year.
  const expectedMonth = (current.getMonth() + 11) % 12;
  expect(prev.getMonth()).toBe(expectedMonth);
  expect(prev.getTime()).toBeLessThan(current.getTime());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/coffee/stats.test.ts`
Expected: FAIL — `startOfDaysAgo` / `startOfPrevMonth` are not exported from `./datetime`.

- [ ] **Step 3: Write minimal implementation**

In `src/features/coffee/datetime.ts`, add directly below `startOfMonth`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/coffee/stats.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/datetime.ts src/features/coffee/stats.test.ts
git commit -m "feat(datetime): add startOfDaysAgo and startOfPrevMonth boundaries" -m "The Dashboard needs a rolling n-day window (burn rate, 30-day chart) and last calendar month (month-over-month comparison). Both step by calendar date rather than subtracting fixed ms, so they stay at local midnight across a DST shift, and startOfPrevMonth sets the date to 1 before decrementing the month to avoid a 31st-of-the-month overflow."
```

---

### Task 2: `daysOfStockLeft`

**Files:**

- Create: `src/features/coffee/stats.ts`
- Modify: `src/features/coffee/stats.test.ts`

**Interfaces:**

- Consumes: `startOfDaysAgo` (Task 1); `countConsumed`, `type Movement` from `./db`.
- Produces: `type StockRunway = { days: number; perDay: number }` and
  `daysOfStockLeft(rows: Pick<Movement, 'delta' | 'at'>[], stock: number, windowDays?: number): StockRunway | null`.
  Returns `null` when stock is not positive or when nothing was consumed in the window. `days` is floored; `perDay` is an unrounded float for display.

- [ ] **Step 1: Write the failing test**

Append to `src/features/coffee/stats.test.ts` (and add the import at the top of the file):

```ts
import { daysOfStockLeft } from './stats';
```

```ts
test('daysOfStockLeft divides stock by the recent daily burn rate', () => {
  // 14 cups over the 14-day window = exactly 1 cup/day; 12 in stock = 12 days.
  const rows = Array.from({ length: 14 }, (_, i) => ({
    delta: -1,
    at: startOfDaysAgo(i) + 3_600_000,
  }));
  const runway = daysOfStockLeft(rows, 12);
  expect(runway).not.toBeNull();
  expect(runway?.days).toBe(12);
  expect(runway?.perDay).toBeCloseTo(1);
});

test('daysOfStockLeft floors partial days', () => {
  // 28 cups / 14 days = 2 per day; 15 in stock = 7.5 days, reported as 7.
  const rows = Array.from({ length: 14 }, (_, i) => ({
    delta: -2,
    at: startOfDaysAgo(i) + 3_600_000,
  }));
  expect(daysOfStockLeft(rows, 15)?.days).toBe(7);
});

test('daysOfStockLeft returns null at a zero burn rate rather than Infinity', () => {
  // Consumption exists, but all of it is older than the window.
  const rows = [{ delta: -1, at: startOfDaysAgo(60) }];
  expect(daysOfStockLeft(rows, 10)).toBeNull();
});

test('daysOfStockLeft returns null when out of stock', () => {
  const rows = [{ delta: -1, at: startOfDaysAgo(1) }];
  expect(daysOfStockLeft(rows, 0)).toBeNull();
  expect(daysOfStockLeft(rows, -3)).toBeNull();
});

test('daysOfStockLeft ignores orders when measuring burn rate', () => {
  const rows = [
    { delta: 50, at: startOfDaysAgo(1) }, // an order — not consumption
    { delta: -7, at: startOfDaysAgo(1) },
  ];
  // 7 cups / 14 days = 0.5 per day; 10 in stock = 20 days.
  expect(daysOfStockLeft(rows, 10)?.days).toBe(20);
});

test('daysOfStockLeft on an empty log is null', () => {
  expect(daysOfStockLeft([], 10)).toBeNull();
});

// Pins the window edge. perDay divides by the windowDays CONSTANT, not by the span of data found,
// so a window one day too wide yields an identical number unless a fixture straddles the boundary —
// which makes this the only test here that can tell 14 days from 15.
test('daysOfStockLeft counts the oldest day in the window and not the day before it', () => {
  const inWindow = { delta: -14, at: startOfDaysAgo(13) + 3_600_000 }; // oldest day counted
  const tooOld = { delta: -99, at: startOfDaysAgo(14) + 3_600_000 }; // one day beyond the window
  // 14 cups / 14 days = 1 per day → 20 in stock lasts 20 days. Were `tooOld` wrongly included,
  // the rate would be 8.07/day and this would read 2 days.
  expect(daysOfStockLeft([inWindow, tooOld], 20)?.days).toBe(20);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/coffee/stats.test.ts`
Expected: FAIL — cannot resolve `./stats`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/coffee/stats.ts`:

```ts
import { countConsumed, type Movement } from './db';
import { startOfDaysAgo } from './datetime';

// Pure derivations for the Dashboard: plain rows in, numbers out. No React, no DB access, no async,
// no throws — every function is total, returning null where a number would be a lie (a zero burn
// rate is not "0 days left", it's unknown). That's what makes this testable with array literals.
//
// `rows` arrive newest-first from listMovements; nothing here depends on the order.

export type StockRunway = {
  days: number;
  perDay: number;
};

// How long the current stock lasts at the recent burn rate. The window is a rolling 14 local days
// (inclusive of today) — long enough to smooth a weekend, short enough to react to a habit change.
// Null when there's nothing to project from: no stock, or no cups drunk in the window.
export function daysOfStockLeft(
  rows: Pick<Movement, 'delta' | 'at'>[],
  stock: number,
  windowDays = 14,
): StockRunway | null {
  if (stock <= 0) return null;
  const consumed = countConsumed(rows, startOfDaysAgo(windowDays - 1));
  if (consumed === 0) return null;
  const perDay = consumed / windowDays;
  return { days: Math.floor(stock / perDay), perDay };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/coffee/stats.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "feat(stats): add daysOfStockLeft runway projection" -m "The one actionable number on the Dashboard: stock divided by the trailing 14-day burn rate tells you when to reorder. Returns null rather than Infinity at a zero burn rate, and null when out of stock, so the view can render an honest dash instead of a fabricated number."
```

---

### Task 3: `dailyCups`

**Files:**

- Modify: `src/features/coffee/stats.ts`, `src/features/coffee/stats.test.ts`

**Interfaces:**

- Consumes: `startOfDaysAgo` (Task 1), `dayKey` from `./datetime`.
- Produces: `type CupDay = { at: number; cups: number }` and
  `dailyCups(rows: Pick<Movement, 'delta' | 'at'>[], days: number): CupDay[]` — exactly `days` entries, oldest→newest, including zero-cup days.

- [ ] **Step 1: Write the failing test**

Add `dailyCups` to the `./stats` import, then append:

```ts
test('dailyCups returns exactly `days` entries, oldest first', () => {
  const series = dailyCups([], 30);
  expect(series).toHaveLength(30);
  expect(series[29]?.at).toBe(startOfDaysAgo(0));
  expect(series[0]?.at).toBe(startOfDaysAgo(29));
  for (const day of series) expect(day.cups).toBe(0);
});

test('dailyCups buckets consumption into its local calendar day', () => {
  const rows = [
    { delta: -1, at: startOfDaysAgo(0) + 8 * 3_600_000 }, // today, 08:00
    { delta: -1, at: startOfDaysAgo(0) + 20 * 3_600_000 }, // today, 20:00
    { delta: -1, at: startOfDaysAgo(2) + 9 * 3_600_000 }, // two days ago
  ];
  const series = dailyCups(rows, 7);
  expect(series[6]?.cups).toBe(2); // today
  expect(series[5]?.cups).toBe(0); // yesterday — a real gap, not a dropped entry
  expect(series[4]?.cups).toBe(1);
});

test('dailyCups counts multi-cup deltas and ignores orders', () => {
  const rows = [
    { delta: -3, at: startOfDaysAgo(1) + 3_600_000 },
    { delta: 50, at: startOfDaysAgo(1) + 3_600_000 }, // an order — not consumption
  ];
  expect(dailyCups(rows, 3)[1]?.cups).toBe(3);
});

test('dailyCups excludes days outside the window', () => {
  const rows = [{ delta: -5, at: startOfDaysAgo(40) + 3_600_000 }];
  const series = dailyCups(rows, 30);
  expect(series.reduce((sum, day) => sum + day.cups, 0)).toBe(0);
});

// Straddles the window edge deliberately. A fixture sitting comfortably inside the window cannot
// tell a 7-day window from an 8-day one — only data on both sides of the line can, so one cup goes
// on the oldest included day and one on the first excluded day.
test('dailyCups includes the oldest day in the window and excludes the day before it', () => {
  const rows = [
    { delta: -2, at: startOfDaysAgo(6) + 3_600_000 }, // oldest day of a 7-day window
    { delta: -9, at: startOfDaysAgo(7) + 3_600_000 }, // one day too old
  ];
  const series = dailyCups(rows, 7);
  expect(series[0]?.cups).toBe(2);
  expect(series.reduce((sum, day) => sum + day.cups, 0)).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/coffee/stats.test.ts`
Expected: FAIL — `dailyCups` is not exported from `./stats`.

- [ ] **Step 3: Write minimal implementation**

Add the `dayKey` import to `stats.ts` (`import { dayKey, startOfDaysAgo } from './datetime';`) and append:

```ts
export type CupDay = {
  at: number;
  cups: number;
};

// Cups per local calendar day over the last `days` days, oldest→newest. Always returns exactly
// `days` entries: a day with no coffee is a zero-cup entry, never a missing one, so the chart shows
// gaps as gaps instead of silently compressing the timeline.
export function dailyCups(rows: Pick<Movement, 'delta' | 'at'>[], days: number): CupDay[] {
  // Bucket by local day key first (one pass), then read the window off it — keeps this O(n + days)
  // instead of scanning every row once per day.
  const counts = new Map<string, number>();
  for (const m of rows) {
    if (m.delta >= 0) continue;
    const key = dayKey(m.at);
    counts.set(key, (counts.get(key) ?? 0) + -m.delta);
  }

  const series: CupDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const at = startOfDaysAgo(i);
    series.push({ at, cups: counts.get(dayKey(at)) ?? 0 });
  }
  return series;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/coffee/stats.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "feat(stats): add dailyCups series for the 30-day chart" -m "Buckets consumption by local calendar day via dayKey, then reads a fixed-length window off the map — O(n + days) rather than a scan per day. Always emits every day in the window, including zeros, so a gap in drinking renders as a gap rather than compressing the timeline."
```

---

### Task 4: `monthComparison`

**Files:**

- Modify: `src/features/coffee/stats.ts`, `src/features/coffee/stats.test.ts`

**Interfaces:**

- Consumes: `startOfMonth`, `startOfPrevMonth` (Task 1).
- Produces: `type MonthComparison = { cups: number; spent: number; prevCups: number; prevSpent: number }` and
  `monthComparison(rows: Pick<Movement, 'delta' | 'price' | 'at'>[]): MonthComparison`. `spent`/`prevSpent` are integer satang. Never returns `null` — an empty log yields all zeros.

- [ ] **Step 1: Write the failing test**

Add `monthComparison` to the `./stats` import and `startOfPrevMonth` to the `./datetime` import, then append:

```ts
test('monthComparison splits cups and spend across this and last month', () => {
  const thisMonth = startOfMonth() + 3_600_000;
  const lastMonth = startOfPrevMonth() + 3_600_000;
  const rows = [
    { delta: -2, price: 0, at: thisMonth },
    { delta: 10, price: 45_000, at: thisMonth },
    { delta: -5, price: 0, at: lastMonth },
    { delta: 20, price: 80_000, at: lastMonth },
    { delta: -99, price: 0, at: startOfPrevMonth() - 86_400_000 }, // older — excluded entirely
  ];
  expect(monthComparison(rows)).toEqual({
    cups: 2,
    spent: 45_000,
    prevCups: 5,
    prevSpent: 80_000,
  });
});

test('monthComparison reports zeros for a month with no data', () => {
  const rows = [{ delta: -3, price: 0, at: startOfMonth() + 3_600_000 }];
  const result = monthComparison(rows);
  expect(result.prevCups).toBe(0);
  expect(result.prevSpent).toBe(0);
});

// Both month boundaries are inclusive-at-the-start, and cups logged at exactly local midnight on
// the 1st are real. Fixtures placed mid-month can't tell `>=` from `>`, so put one cup on each
// boundary millisecond and one just before the previous month begins.
test('monthComparison puts midnight-on-the-1st cups in the month that starts there', () => {
  const rows = [
    { delta: -1, price: 0, at: startOfMonth() }, // first instant of this month
    { delta: -4, price: 0, at: startOfPrevMonth() }, // first instant of last month
    { delta: -8, price: 0, at: startOfPrevMonth() - 1 }, // one ms earlier — excluded entirely
  ];
  const result = monthComparison(rows);
  expect(result.cups).toBe(1);
  expect(result.prevCups).toBe(4);
});

test('monthComparison on an empty log is all zeros', () => {
  expect(monthComparison([])).toEqual({ cups: 0, spent: 0, prevCups: 0, prevSpent: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/coffee/stats.test.ts`
Expected: FAIL — `monthComparison` is not exported from `./stats`.

- [ ] **Step 3: Write minimal implementation**

Add `startOfMonth` and `startOfPrevMonth` to the `./datetime` import in `stats.ts`, then append:

```ts
export type MonthComparison = {
  cups: number;
  spent: number; // integer satang
  prevCups: number;
  prevSpent: number; // integer satang
};

// This calendar month against the last one, cups and spend together in a single pass.
// Deliberately calendar months, not month-to-date vs the same day last month: early in a month the
// comparison is unfair by construction, and the tile is labelled "This month vs last" so it reads
// as a running total rather than a forecast.
export function monthComparison(rows: Pick<Movement, 'delta' | 'price' | 'at'>[]): MonthComparison {
  const current = startOfMonth();
  const previous = startOfPrevMonth();
  let cups = 0;
  let spent = 0;
  let prevCups = 0;
  let prevSpent = 0;

  for (const m of rows) {
    if (m.at >= current) {
      if (m.delta < 0) cups += -m.delta;
      else spent += m.price;
    } else if (m.at >= previous) {
      if (m.delta < 0) prevCups += -m.delta;
      else prevSpent += m.price;
    }
  }

  return { cups, spent, prevCups, prevSpent };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/coffee/stats.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "feat(stats): add monthComparison for month-over-month deltas" -m "Answers 'am I drinking more than I was' in one pass over the log, returning both months' cups and spend so the view can compute the delta. Uses calendar months rather than month-to-date parity — the tile is labelled as a running total, and the simpler boundary is honest about what it shows."
```

---

### Task 5: `costPerCapsule`

**Files:**

- Modify: `src/features/coffee/stats.ts`, `src/features/coffee/stats.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `type CapsuleCost = { satang: number; cheapestShop: string | null }` and
  `costPerCapsule(rows: Pick<Movement, 'delta' | 'price' | 'shop'>[]): CapsuleCost | null`. Returns `null` when no orders exist. `satang` is an integer.

- [ ] **Step 1: Write the failing test**

Add `costPerCapsule` to the `./stats` import and append:

```ts
test('costPerCapsule weights by quantity, not by order', () => {
  const rows = [
    { delta: 50, price: 50_000, shop: 'Tops' }, // ฿10.00/capsule
    { delta: 1, price: 5_000, shop: 'Cafe' }, // ฿50.00/capsule — one capsule, must not swing the mean
  ];
  // Weighted: 55_000 satang / 51 capsules = 1078.4 → 1078. Unweighted would be 3000 satang.
  expect(costPerCapsule(rows)?.satang).toBe(1078);
});

test('costPerCapsule names the shop with the lowest per-capsule rate', () => {
  const rows = [
    { delta: 10, price: 30_000, shop: 'Tops' }, // ฿30.00/capsule
    { delta: 10, price: 20_000, shop: 'Makro' }, // ฿20.00/capsule — cheapest
    { delta: 10, price: 40_000, shop: 'Cafe' },
  ];
  expect(costPerCapsule(rows)?.cheapestShop).toBe('Makro');
});

test('costPerCapsule aggregates repeat visits to the same shop before ranking', () => {
  const rows = [
    { delta: 1, price: 500, shop: 'Makro' }, // a cheap one-off…
    { delta: 99, price: 99_000, shop: 'Makro' }, // …outweighed by the bulk buy → ฿9.95/capsule avg
    { delta: 10, price: 6_000, shop: 'Tops' }, // ฿6.00/capsule — actually cheapest
  ];
  expect(costPerCapsule(rows)?.cheapestShop).toBe('Tops');
});

test('costPerCapsule ignores drinks and unnamed shops', () => {
  const rows = [
    { delta: -1, price: 0, shop: '' }, // a drink — never counts toward cost
    { delta: 10, price: 20_000, shop: '' }, // an order with no shop: counts for cost, not for ranking
  ];
  const cost = costPerCapsule(rows);
  expect(cost?.satang).toBe(2_000);
  expect(cost?.cheapestShop).toBeNull();
});

test('costPerCapsule is null when nothing has been ordered', () => {
  expect(costPerCapsule([])).toBeNull();
  expect(costPerCapsule([{ delta: -1, price: 0, shop: '' }])).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/coffee/stats.test.ts`
Expected: FAIL — `costPerCapsule` is not exported from `./stats`.

- [ ] **Step 3: Write minimal implementation**

Append to `stats.ts`:

```ts
export type CapsuleCost = {
  satang: number; // integer satang per capsule, all-time
  cheapestShop: string | null;
};

// All-time cost per capsule, WEIGHTED BY QUANTITY (Σprice / Σdelta). Averaging each order's own
// per-capsule rate would let a single-capsule impulse buy pull the mean as hard as a 50-capsule
// bulk order — the number people actually want is what a capsule costs on average, not what an
// order costs on average.
//
// `cheapestShop` applies the same weighting per shop, so repeat visits aggregate before ranking.
// Ties break toward the shop you've bought more from (the better-evidenced rate). Orders with an
// empty shop still count toward the overall cost but can't be named, so they're skipped in ranking.
export function costPerCapsule(
  rows: Pick<Movement, 'delta' | 'price' | 'shop'>[],
): CapsuleCost | null {
  let price = 0;
  let capsules = 0;
  const byShop = new Map<string, { price: number; capsules: number }>();

  for (const m of rows) {
    if (m.delta <= 0) continue;
    price += m.price;
    capsules += m.delta;
    if (m.shop === '') continue;
    const shop = byShop.get(m.shop) ?? { price: 0, capsules: 0 };
    shop.price += m.price;
    shop.capsules += m.delta;
    byShop.set(m.shop, shop);
  }

  if (capsules === 0) return null;

  let cheapestShop: string | null = null;
  let cheapestRate = Number.POSITIVE_INFINITY;
  let cheapestCapsules = 0;
  for (const [name, shop] of byShop) {
    const rate = shop.price / shop.capsules;
    if (rate < cheapestRate || (rate === cheapestRate && shop.capsules > cheapestCapsules)) {
      cheapestRate = rate;
      cheapestCapsules = shop.capsules;
      cheapestShop = name;
    }
  }

  // Round only here: satang stays integer at the boundary, per the house money rule.
  return { satang: Math.round(price / capsules), cheapestShop };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/coffee/stats.test.ts`
Expected: PASS, 21 tests.

**Follow-up correction (post-review):** the running app surfaced a real seed row —
`{ shop: "Opening balance", delta: 175, price: 0 }`, 175 capsules already on hand when the log
began — that the implementation above treats as a free purchase. That's wrong twice over: it wins
`cheapestShop` trivially at 0 satang/capsule, and it drags the weighted average down (understating
real cost by ~23% against the seed data). The fix: exclude `price === 0` orders entirely, from both
the average and the ranking. A zero price carries no price information — it means "cost unknown",
not "free" — so averaging it in as free capsules conflates the two. The loop's guard becomes
`if (m.delta <= 0 || m.price === 0) continue;`, and if every order is zero-price the existing
`capsules === 0` guard still returns `null`. See `src/features/coffee/stats.ts` and
`src/features/coffee/stats.test.ts` for the current implementation and tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "feat(stats): add quantity-weighted costPerCapsule" -m "Weights by capsule count rather than by order, so a one-capsule impulse buy can't swing the mean as hard as a 50-capsule bulk order. Applies the same weighting per shop to name the genuinely cheapest source, which is the useful half of a full spend-by-shop table in one line. Rounds to integer satang only at the boundary."
```

---

### Task 6: `timeOfDay`

**Files:**

- Modify: `src/features/coffee/stats.ts`, `src/features/coffee/stats.test.ts`

**Interfaces:**

- Consumes: `startOfDaysAgo` (Task 1).
- Produces: `type TimeOfDay = { night: number; morning: number; afternoon: number; evening: number }` and
  `timeOfDay(rows: Pick<Movement, 'delta' | 'at'>[], days?: number): TimeOfDay` (default `days = 30`). Never `null`; an empty log yields all zeros.

- [ ] **Step 1: Write the failing test**

Add `timeOfDay` to the `./stats` import and append:

```ts
test('timeOfDay buckets each cup by its local hour', () => {
  const today = startOfDaysAgo(0);
  const hour = 3_600_000;
  const rows = [
    { delta: -1, at: today + 2 * hour }, // 02:00 → night
    { delta: -1, at: today + 7 * hour }, // 07:00 → morning
    { delta: -1, at: today + 9 * hour }, // 09:00 → morning
    { delta: -1, at: today + 14 * hour }, // 14:00 → afternoon
    { delta: -1, at: today + 21 * hour }, // 21:00 → evening
  ];
  expect(timeOfDay(rows)).toEqual({ night: 1, morning: 2, afternoon: 1, evening: 1 });
});

test('timeOfDay bucket boundaries land in the later bucket', () => {
  const today = startOfDaysAgo(0);
  const hour = 3_600_000;
  const rows = [
    { delta: -1, at: today }, // 00:00 → night
    { delta: -1, at: today + 6 * hour }, // 06:00 → morning
    { delta: -1, at: today + 12 * hour }, // 12:00 → afternoon
    { delta: -1, at: today + 18 * hour }, // 18:00 → evening
  ];
  expect(timeOfDay(rows)).toEqual({ night: 1, morning: 1, afternoon: 1, evening: 1 });
});

test('timeOfDay ignores orders and anything outside the window', () => {
  const hour = 3_600_000;
  const rows = [
    { delta: 50, at: startOfDaysAgo(0) + 9 * hour }, // an order — when you bought is noise
    { delta: -4, at: startOfDaysAgo(40) + 9 * hour }, // outside the 30-day window
    { delta: -2, at: startOfDaysAgo(1) + 9 * hour }, // counted, multi-cup delta
  ];
  expect(timeOfDay(rows)).toEqual({ night: 0, morning: 2, afternoon: 0, evening: 0 });
});

test('timeOfDay on an empty log is all zeros', () => {
  expect(timeOfDay([])).toEqual({ night: 0, morning: 0, afternoon: 0, evening: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/coffee/stats.test.ts`
Expected: FAIL — `timeOfDay` is not exported from `./stats`.

- [ ] **Step 3: Write minimal implementation**

Append to `stats.ts`:

```ts
export type TimeOfDay = {
  night: number; // 00:00–05:59
  morning: number; // 06:00–11:59
  afternoon: number; // 12:00–17:59
  evening: number; // 18:00–23:59
};

// When you actually drink, over the last `days` local days. Consumption only — when you *bought*
// capsules says nothing about your habit. Buckets read off the local hour via getHours(), so they
// follow the device timezone the same way the rest of datetime.ts does.
export function timeOfDay(rows: Pick<Movement, 'delta' | 'at'>[], days = 30): TimeOfDay {
  const since = startOfDaysAgo(days - 1);
  const buckets = { night: 0, morning: 0, afternoon: 0, evening: 0 };

  for (const m of rows) {
    if (m.delta >= 0 || m.at < since) continue;
    const cups = -m.delta;
    const hour = new Date(m.at).getHours();
    if (hour < 6) buckets.night += cups;
    else if (hour < 12) buckets.morning += cups;
    else if (hour < 18) buckets.afternoon += cups;
    else buckets.evening += cups;
  }

  return buckets;
}
```

- [ ] **Step 4: Run the full suite and the gates**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass; 25 tests in `stats.test.ts` plus the existing `coffee.test.ts` suite.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "feat(stats): add timeOfDay consumption buckets" -m "Four local-hour buckets over the last 30 days, consumption only — when capsules were bought says nothing about the drinking habit. Completes the pure stats module; the Dashboard view can now be built entirely on top of it."
```

---

### Task 7: `DashboardView`

**Files:**

- Create: `src/features/coffee/components/DashboardView.tsx`

**Interfaces:**

- Consumes: every export from Task 2–6 (`daysOfStockLeft`, `dailyCups`, `monthComparison`, `costPerCapsule`, `timeOfDay`); `type UseCoffee` from `../use-coffee`; `formatSatang` from `../money`.
- Produces: `DashboardView({ coffee }: { coffee: UseCoffee })` — consumed by Task 8.

This task has no unit test: it is presentational, and the logic it displays is already covered by Tasks 2–6. It is verified by running the app (Step 3).

- [ ] **Step 1: Write the component**

Create `src/features/coffee/components/DashboardView.tsx`:

```tsx
'use client';

import type { UseCoffee } from '../use-coffee';
import { formatSatang } from '../money';
import { costPerCapsule, dailyCups, daysOfStockLeft, monthComparison, timeOfDay } from '../stats';

const number = new Intl.NumberFormat('en-US');
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const dayShort = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

// Dashboard: the zoomed-out view. Home answers "today"; this answers "when do I run out, am I
// drinking more than I was, and what is this costing me per cup". Every figure comes from the pure
// stats module — this file only formats and lays out.
export function DashboardView({ coffee }: { coffee: UseCoffee }) {
  const { movements, stock } = coffee;

  // A dashboard of zeros teaches nothing and looks broken. One honest line until there's data.
  if (movements.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] bg-[var(--color-surface)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
        Log a few cups and your stats will show up here.
      </p>
    );
  }

  const runway = daysOfStockLeft(movements, stock);
  const series = dailyCups(movements, 30);
  const months = monthComparison(movements);
  const cost = costPerCapsule(movements);
  const clock = timeOfDay(movements);

  return (
    <section className="flex flex-col gap-4">
      {/* 1 — Days of stock left. The only number here that asks you to do something. */}
      <Card>
        <p className="text-sm text-[var(--color-muted)]">Stock runway</p>
        {stock <= 0 ? (
          <p className="mt-1 text-2xl font-semibold text-[var(--color-accent)]">Out of stock</p>
        ) : runway ? (
          <>
            <p className="tnum mt-1 text-3xl font-semibold">
              ~{number.format(runway.days)}{' '}
              <span className="text-base font-normal text-[var(--color-muted)]">days left</span>
            </p>
            <p className="tnum mt-0.5 text-xs text-[var(--color-faint)]">
              at ~{oneDecimal.format(runway.perDay)} capsules a day
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-3xl font-semibold">—</p>
            <p className="mt-0.5 text-xs text-[var(--color-faint)]">
              no capsules logged in the last two weeks
            </p>
          </>
        )}
      </Card>

      {/* 2 — 30-day trend. CSS bars: a chart library would be ~90kB gzipped for flex and a % height. */}
      <Card>
        <p className="text-sm text-[var(--color-muted)]">Last 30 days</p>
        <Chart series={series} />
      </Card>

      {/* 3 — Month over month. */}
      <Card>
        <p className="text-sm text-[var(--color-muted)]">This month vs last</p>
        <div className="mt-2 flex flex-col gap-2">
          <CompareRow
            label="Capsules"
            value={number.format(months.cups)}
            current={months.cups}
            previous={months.prevCups}
          />
          <CompareRow
            label="Spent"
            value={formatSatang(months.spent)}
            current={months.spent}
            previous={months.prevSpent}
          />
        </div>
      </Card>

      {/* 4 — Cost per capsule. */}
      <Card>
        <p className="text-sm text-[var(--color-muted)]">Cost per capsule</p>
        {cost ? (
          <>
            <p className="tnum mt-1 text-3xl font-semibold">{formatSatang(cost.satang)}</p>
            {cost.cheapestShop ? (
              <p className="mt-0.5 text-xs text-[var(--color-faint)]">
                cheapest at {cost.cheapestShop}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-1 text-3xl font-semibold">—</p>
            <p className="mt-0.5 text-xs text-[var(--color-faint)]">no orders logged yet</p>
          </>
        )}
      </Card>

      {/* 5 — Time of day. */}
      <Card>
        <p className="text-sm text-[var(--color-muted)]">When you drink</p>
        <div className="mt-3 flex flex-col gap-2">
          <ClockRow label="Morning" hint="6a–12p" cups={clock.morning} all={clock} />
          <ClockRow label="Afternoon" hint="12p–6p" cups={clock.afternoon} all={clock} />
          <ClockRow label="Evening" hint="6p–12a" cups={clock.evening} all={clock} />
          <ClockRow label="Night" hint="12a–6a" cups={clock.night} all={clock} />
        </div>
      </Card>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">{children}</div>;
}

// The chart is a list, not decoration: each bar carries a label so it's readable without sight.
// Bars are min-height 2px so a zero day still shows as a baseline tick rather than vanishing.
function Chart({ series }: { series: { at: number; cups: number }[] }) {
  const max = Math.max(...series.map((day) => day.cups), 1);
  return (
    <ul className="mt-3 flex h-24 items-end gap-[3px]">
      {series.map((day, i) => (
        <li
          key={day.at}
          aria-label={`${dayShort.format(day.at)}: ${day.cups} capsules`}
          className="flex-1 rounded-sm bg-[var(--color-accent)]"
          style={{
            height: `${Math.max((day.cups / max) * 100, 2)}%`,
            // Today is the bar you're standing on — full strength, the rest recede.
            opacity: i === series.length - 1 ? 1 : 0.55,
          }}
        />
      ))}
    </ul>
  );
}

function CompareRow({
  label,
  value,
  current,
  previous,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
}) {
  // No percentage against a zero baseline — "+∞%" is noise, and "+100%" from nothing is a lie.
  const percent =
    previous === 0
      ? null
      : `${current >= previous ? '+' : ''}${Math.round(((current - previous) / previous) * 100)}%`;
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-[var(--color-muted)]">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="tnum font-semibold">{value}</span>
        <span className="tnum text-xs text-[var(--color-faint)]">
          {percent ?? 'no data last month'}
        </span>
      </span>
    </div>
  );
}

function ClockRow({
  label,
  hint,
  cups,
  all,
}: {
  label: string;
  hint: string;
  cups: number;
  all: { night: number; morning: number; afternoon: number; evening: number };
}) {
  const max = Math.max(all.night, all.morning, all.afternoon, all.evening, 1);
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-sm text-[var(--color-muted)]">
        {label}
        <span className="ml-1 text-[10px] text-[var(--color-faint)]">{hint}</span>
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
        <span
          className="block h-full rounded-full bg-[var(--color-accent)]"
          style={{ width: `${(cups / max) * 100}%` }}
        />
      </span>
      <span className="tnum w-6 shrink-0 text-right text-sm">{cups}</span>
    </div>
  );
}
```

- [ ] **Step 2: Run the gates**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass. If `format:check` fails, run `npm run format` and re-check.

- [ ] **Step 3: Commit**

The view isn't reachable until Task 8 wires the tab; committing it separately keeps the diff reviewable.

```bash
git add src/features/coffee/components/DashboardView.tsx
git commit -m "feat(dashboard): add the DashboardView component" -m "Five cards over the pure stats module: stock runway, a 30-day CSS bar chart, month-over-month cups and spend, quantity-weighted cost per capsule, and a time-of-day breakdown. The chart is a labelled list rather than decoration so it reads without sight, and every null stat renders an honest dash instead of a fabricated zero." -m "Not reachable yet — the nav tab lands in the next commit."
```

---

### Task 8: Wire the Dashboard tab

**Files:**

- Modify: `src/features/coffee/components/BottomNav.tsx:9` (the `Tab` type) and `:31-36` (the reserved slot)
- Modify: `src/features/coffee/components/Coffee.tsx:32-38` (the view switch)

**Interfaces:**

- Consumes: `DashboardView` (Task 7).
- Produces: `Tab` gains the `'dashboard'` member — `MoreSheet`'s `onTab` prop widens with it automatically, no change needed there.

- [ ] **Step 1: Widen the `Tab` type**

In `src/features/coffee/components/BottomNav.tsx`, replace:

```ts
export type Tab = 'home' | 'history' | 'settings';
```

with:

```ts
export type Tab = 'home' | 'dashboard' | 'history' | 'settings';
```

- [ ] **Step 2: Activate the reserved slot**

In the same file, replace the placeholder block:

```tsx
{
  /* Placeholder — the slot is reserved so the bar doesn't reshuffle when the view lands.
            Deliberately has no onClick: a tab that navigates nowhere is worse than one that
            visibly can't yet. Give it a Tab value and a view when it's real. */
}
<TabButton label="Dashboard" active={false} disabled>
  <DashboardIcon className="size-6" />
</TabButton>;
```

with:

```tsx
<TabButton label="Dashboard" active={tab === 'dashboard'} onClick={() => onTab('dashboard')}>
  <DashboardIcon className="size-6" />
</TabButton>
```

Leave the `disabled` prop on `TabButton` in place — it's still documented and typed as optional, and removing it is unrelated churn.

- [ ] **Step 3: Render the view**

In `src/features/coffee/components/Coffee.tsx`, add the import beside the others:

```tsx
import { DashboardView } from './DashboardView';
```

and replace the view switch:

```tsx
{
  tab === 'home' ? (
    <HomeView coffee={coffee} onAdd={() => setAddOpen(true)} />
  ) : tab === 'history' ? (
    <HistoryView coffee={coffee} />
  ) : (
    <SettingsView coffee={coffee} />
  );
}
```

with:

```tsx
{
  tab === 'home' ? (
    <HomeView coffee={coffee} onAdd={() => setAddOpen(true)} />
  ) : tab === 'dashboard' ? (
    <DashboardView coffee={coffee} />
  ) : tab === 'history' ? (
    <HistoryView coffee={coffee} />
  ) : (
    <SettingsView coffee={coffee} />
  );
}
```

- [ ] **Step 4: Run the full gates**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: all pass.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, open the app, and confirm:

- The Dashboard tab is tappable and highlights when active.
- On a DB with data, all five cards render with plausible numbers.
- Clearing site data (fresh OPFS) shows the single "Log a few cups…" line, not a grid of zeros.
- The page scrolls clear of the bottom nav at the end of the last card.

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/components/BottomNav.tsx src/features/coffee/components/Coffee.tsx
git commit -m "feat(dashboard): wire the Dashboard tab into the nav" -m "Fills the slot BottomNav has reserved since it was written: adds 'dashboard' to Tab, swaps the disabled placeholder for a real tab button, and renders DashboardView from the existing view switch. No routing involved — the app switches views off useState, so the shared useCoffee instance survives the tab change and OPFS is never re-read."
```

---

## Self-Review

**Spec coverage:** Tile 1 → Task 2. Tile 2 → Task 3 + `Chart` in Task 7. Tile 3 → Task 4 + `CompareRow`. Tile 4 → Task 5. Tile 5 → Task 6 + `ClockRow`. Empty/edge states → Task 7 Step 1 (empty log, `stock <= 0`, null cost, sub-30-day history via `dailyCups` zero-fill). Error handling → satisfied by construction: every stats function is total. Testing section → Tasks 1–6; every named case has a test. File structure → matches the spec's table exactly.

**Placeholder scan:** No TBDs. Every code step shows complete code. No "similar to Task N" references.

**Type consistency:** `StockRunway`, `CupDay`, `MonthComparison`, `CapsuleCost`, `TimeOfDay` are each defined once and used with matching field names in Task 7. `startOfDaysAgo` / `startOfPrevMonth` signatures match between Task 1 and their callers. `Tab` widening in Task 8 is the only cross-file type change.
