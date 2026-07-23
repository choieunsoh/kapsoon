# Dashboard Over-Time Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dashboard so Home owns "now" and the dashboard owns "patterns over time" — three blocks carrying seven stats, replacing five equal cards carrying five.

**Architecture:** All new figures derive from the existing movement log via the pure `stats.ts` module — no schema change, no data-layer change. Components take a `UseCoffee` and call pure functions; they never touch `db.ts`. New stats land first (build stays green), then the components are rewritten, then the two now-dead stats functions are deleted last.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5.9 · Tailwind v4 · Vitest + @testing-library/react (jsdom) · oxlint · oxfmt

**Spec:** `docs/superpowers/specs/2026-07-20-dashboard-over-time-design.md`

## Global Constraints

- **TypeScript house bans:** no `any`, no `as` casts (`as const` is fine), no `!` non-null assertion, no `// @ts-*` comments. `type` over `interface`. Prefer `for..of`.
- **Money is always an integer minor unit (satang).** Never a float. Round only at the boundary.
- **Figures use `.tnum`** (tabular-nums). Never a monospace font.
- **Date/time:** all formatting through `Intl`, never string slicing or manual zero-padding. All period boundaries use local-timezone `Date` arithmetic.
- **Accessibility target: WCAG 2.2 AA.** Body text ≥4.5:1, large text ≥3:1. Value is never carried by colour alone. `--color-faint` measures 4.4:1 on `--color-surface` and is already under AA for small text — prefer `--color-muted` for any text carrying information.
- **Quality gates (all must pass before any commit):** `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
- **Commit format:** `type(scope): description` with a body explaining WHY. Single scope word. Use repeated `-m` flags — never `-F` or heredoc.
- **Branch:** `feat/dashboard-over-time` (already created).

---

### Task 1: Add `weekGrid` alongside `timeOfDay`

Merges the four time-of-day buckets and the new day-of-week stat into one function. The old four buckets are this grid's row sums, which is what the equivalence test asserts — that proves the merge lost nothing.

**`timeOfDay` is NOT deleted here.** It still has a caller (`DashboardView`) until Task 7, and deleting it now would commit a red `typecheck`, which the Global Constraints forbid. It is removed in Task 8 with the other dead functions. Keeping it also lets the equivalence test assert against the real function rather than hand-written numbers — a stronger proof, which is why this ordering is better and not merely safer.

**Files:**

- Modify: `src/features/coffee/stats.ts` (append `WeekGrid` type and `weekGrid` function; leave `timeOfDay` untouched)
- Modify: `src/features/coffee/stats.test.ts` (append tests; leave the `timeOfDay` tests untouched)

**Interfaces:**

- Consumes: `Movement` from `./db`, `startOfDaysAgo` from `./datetime` (both already imported at the top of `stats.ts`)
- Produces: `weekGrid(rows, days?) => WeekGrid` where `WeekGrid = { cells: number[][]; max: number }`. `cells` is `[4 bands][7 weekdays]`; bands are ordered night, morning, afternoon, evening; weekdays are Monday-first. Used by Task 6 and Task 7.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/coffee/stats.test.ts`. Leave the existing `timeOfDay` tests exactly as they are — they still guard a live function.

```ts
// The grid's row sums are exactly the four buckets the old timeOfDay returned. Asserting on the
// sums — not just on individual cells — is what proves merging day-of-week into it lost nothing.
function rowSums(grid: WeekGrid): number[] {
  return grid.cells.map((row) => row.reduce((total, cups) => total + cups, 0));
}

test('weekGrid buckets each cup by its local hour band', () => {
  const at = (daysAgo: number, hour: number) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d.getTime();
  };
  const rows = [
    { delta: -1, at: at(0, 3) }, // night
    { delta: -1, at: at(0, 7) }, // morning
    { delta: -1, at: at(0, 9) }, // morning
    { delta: -1, at: at(0, 14) }, // afternoon
    { delta: -1, at: at(0, 20) }, // evening
  ];

  expect(rowSums(weekGrid(rows))).toEqual([1, 2, 1, 1]);
});

test('weekGrid bucket boundaries land in the later band', () => {
  const at = (hour: number) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };
  const rows = [
    { delta: -1, at: at(0) }, // night
    { delta: -1, at: at(6) }, // morning
    { delta: -1, at: at(12) }, // afternoon
    { delta: -1, at: at(18) }, // evening
  ];

  expect(rowSums(weekGrid(rows))).toEqual([1, 1, 1, 1]);
});

// getDay() is Sunday-first; the grid is Monday-first, because that is how the week reads on screen.
// An off-by-one here silently shifts every column, which no other assertion would catch.
test('weekGrid columns are Monday-first', () => {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  // Step back to the most recent Sunday, which must land in the LAST column.
  d.setDate(d.getDate() - d.getDay());
  const sunday = d.getTime();

  const grid = weekGrid([{ delta: -1, at: sunday }], 30);

  expect(grid.cells[1]?.[6]).toBe(1); // morning band, Sunday column
  expect(grid.cells[1]?.[0]).toBe(0); // morning band, Monday column
});

test('weekGrid counts multi-cup deltas and ignores orders', () => {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  const rows = [
    { delta: -3, at: d.getTime() },
    { delta: 50, at: d.getTime() },
  ];

  expect(rowSums(weekGrid(rows))).toEqual([0, 3, 0, 0]);
});

// Mirrors the dailyCups boundary test: a cup on the oldest day of the window counts, one the day
// before does not.
test('weekGrid includes the oldest day in the window and excludes the day before it', () => {
  const inWindow = startOfDaysAgo(4) + 9 * 3_600_000;
  const tooOld = startOfDaysAgo(5) + 9 * 3_600_000;
  const rows = [
    { delta: -3, at: inWindow },
    { delta: -9, at: tooOld },
  ];

  expect(rowSums(weekGrid(rows, 5))).toEqual([0, 3, 0, 0]);
});

test('weekGrid reports the largest cell, floored at 1 so callers never divide by zero', () => {
  const d = new Date();
  d.setHours(9, 0, 0, 0);

  expect(weekGrid([{ delta: -4, at: d.getTime() }]).max).toBe(4);
  expect(weekGrid([]).max).toBe(1);
});

test('weekGrid on an empty log is a full grid of zeros', () => {
  const grid = weekGrid([]);

  expect(grid.cells).toHaveLength(4);
  for (const row of grid.cells) expect(row).toEqual([0, 0, 0, 0, 0, 0, 0]);
});

// THE point of the merge: weekGrid's row sums must equal what timeOfDay returns for the same input.
// Asserted against the real function rather than hand-written numbers, so it cannot drift. This test
// is deleted in Task 8 along with timeOfDay itself — it exists to prove the transition, and the
// hand-written row-sum tests above are what remain afterwards.
test('weekGrid row sums equal the timeOfDay buckets it replaces', () => {
  const at = (daysAgo: number, hour: number) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d.getTime();
  };
  const rows = [
    { delta: -2, at: at(0, 2) },
    { delta: -1, at: at(1, 8) },
    { delta: -3, at: at(4, 13) },
    { delta: -1, at: at(9, 19) },
    { delta: -1, at: at(11, 23) },
    { delta: 30, at: at(3, 10) }, // an order — must be ignored by both
  ];

  const buckets = timeOfDay(rows, 30);

  expect(rowSums(weekGrid(rows, 30))).toEqual([
    buckets.night,
    buckets.morning,
    buckets.afternoon,
    buckets.evening,
  ]);
});
```

Then update the import block at the top of `src/features/coffee/stats.test.ts` — KEEP `timeOfDay`, and add `weekGrid`, the `WeekGrid` type, and `startOfDaysAgo`:

```ts
import {
  averageCups,
  costPerCapsule,
  dailyCups,
  daysOfStockLeft,
  monthComparison,
  timeOfDay,
  weekGrid,
  type WeekGrid,
} from './stats';
import { startOfDaysAgo } from './datetime';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- stats`
Expected: FAIL — `weekGrid` is not exported from `./stats`.

- [ ] **Step 3: Write the implementation**

Append to `src/features/coffee/stats.ts`, leaving `TimeOfDay` and `timeOfDay` in place:

```ts
export type WeekGrid = {
  // [band][weekday]. Four bands in the order night, morning, afternoon, evening; seven weekdays
  // Monday-first. Shape is asserted in the tests rather than encoded in the type: a readonly
  // 4-tuple of 7-tuples cannot be built without a cast, and casts are banned house-wide.
  cells: number[][];
  // Largest single cell, floored at 1 so a caller scaling by it never divides by zero on an empty
  // log. Returned rather than recomputed by every caller, which would walk the grid a second time.
  max: number;
};

const BANDS = 4;
const WEEKDAYS = 7;

// When you drink, split by weekday AND time of day, over the last `days` local days. Consumption
// only — when you *bought* capsules says nothing about the habit. Bands read off the local hour via
// getHours(), following the device timezone the same way the rest of datetime.ts does.
//
// This replaces the old timeOfDay(), whose four buckets are exactly this grid's row sums. One
// function where there were two: a separate day-of-week stat would have been a second pass over the
// same rows producing a second block on a page whose actual problem is block count.
export function weekGrid(rows: Pick<Movement, 'delta' | 'at'>[], days = 30): WeekGrid {
  const since = startOfDaysAgo(days - 1);
  const cells: number[][] = [];
  for (let band = 0; band < BANDS; band++) cells.push(new Array<number>(WEEKDAYS).fill(0));

  let max = 0;
  for (const m of rows) {
    if (m.delta >= 0 || m.at < since) continue;
    const at = new Date(m.at);
    const hour = at.getHours();
    const band = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
    // getDay() is Sunday-first (0 = Sunday); the grid is Monday-first, so Sunday moves to index 6.
    const weekday = (at.getDay() + 6) % WEEKDAYS;
    const row = cells[band];
    if (row === undefined) continue;
    const next = (row[weekday] ?? 0) + -m.delta;
    row[weekday] = next;
    if (next > max) max = next;
  }

  return { cells, max: Math.max(max, 1) };
}
```

- [ ] **Step 4: Run the full quality gates**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: all pass. `timeOfDay` is still present and still has its caller, so nothing is broken. If `format:check` fails, run `npm run format` and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "feat(stats): add a weekday by time-of-day grid" -m "A separate day-of-week stat would have been a second pass over the same rows producing a second block, on a page whose actual problem is block count. One grid answers both questions." -m "weekGrid's row sums are exactly what timeOfDay returns, asserted against the real function rather than hand-written numbers, so the merge is provably lossless. timeOfDay stays until its caller is rewritten, so every commit typechecks."
```

---

### Task 2: Add `startOfMonthsAgo` and `spendByMonth`

**Files:**

- Modify: `src/features/coffee/datetime.ts:52-58` (add `startOfMonthsAgo` after `startOfPrevMonth`)
- Modify: `src/features/coffee/stats.ts` (append `spendByMonth`)
- Modify: `src/features/coffee/stats.test.ts` (append tests)

**Interfaces:**

- Consumes: `startOfMonthsAgo(n) => number` from `./datetime`
- Produces: `spendByMonth(rows, months) => MonthSpend[]` where `MonthSpend = { at: number; satang: number }`, oldest→newest, exactly `months` entries. Used by Task 7.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/coffee/stats.test.ts`:

```ts
test('spendByMonth returns exactly `months` entries, oldest first', () => {
  const series = spendByMonth([], 6);

  expect(series).toHaveLength(6);
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    expect(prev === undefined || cur === undefined || prev.at < cur.at).toBe(true);
  }
});

// A month with no orders is a zero entry, never a missing one — same reasoning as dailyCups. A
// missing month would silently compress the timeline and make a quiet month look like a busy one.
test('spendByMonth zero-fills months with no orders', () => {
  const series = spendByMonth([], 3);

  expect(series.map((m) => m.satang)).toEqual([0, 0, 0]);
});

test('spendByMonth sums order prices into their calendar month and ignores drinks', () => {
  const thisMonth = startOfMonth() + 1_000;
  const lastMonth = startOfPrevMonth() + 1_000;
  const rows = [
    { delta: 10, price: 30_000, at: thisMonth },
    { delta: 10, price: 20_000, at: thisMonth },
    { delta: 10, price: 50_000, at: lastMonth },
    { delta: -1, price: 0, at: thisMonth },
  ];

  const series = spendByMonth(rows, 2);

  expect(series[0]?.satang).toBe(50_000); // last month
  expect(series[1]?.satang).toBe(50_000); // this month, two orders summed
});

// Pins the bucket edge: an order at the exact first millisecond of a month belongs to the month that
// starts there, not the one before it.
test('spendByMonth puts a midnight-on-the-1st order in the month that starts there', () => {
  const rows = [{ delta: 10, price: 12_345, at: startOfMonth() }];
  const series = spendByMonth(rows, 2);

  expect(series[0]?.satang).toBe(0);
  expect(series[1]?.satang).toBe(12_345);
});

test('spendByMonth excludes orders older than the window', () => {
  const rows = [{ delta: 10, price: 99_999, at: startOfMonthsAgo(5) }];

  expect(spendByMonth(rows, 2).reduce((total, m) => total + m.satang, 0)).toBe(0);
});
```

Update the `./datetime` import in `src/features/coffee/stats.test.ts` to:

```ts
import { startOfDaysAgo, startOfMonth, startOfMonthsAgo, startOfPrevMonth } from './datetime';
```

and add `spendByMonth` to the `./stats` import list.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- stats`
Expected: FAIL — `spendByMonth` and `startOfMonthsAgo` are not exported.

- [ ] **Step 3: Write the implementation**

In `src/features/coffee/datetime.ts`, insert after `startOfPrevMonth` (line 58):

```ts
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
```

In `src/features/coffee/stats.ts`, append:

```ts
export type MonthSpend = {
  at: number; // local midnight on the 1st of the month
  satang: number; // integer satang actually spent that month
};

// What you ACTUALLY paid, per local calendar month, oldest→newest. Deliberately calendar months
// rather than a rolling window: a bar series needs stable, comparable buckets, and a rolling window
// drawn as bars would have every bar mean something slightly different.
//
// This is cash, not the accrual rate that habitCost reports. The two genuinely differ — you drink
// every day and buy every three weeks — and the labels on screen are what keep them from reading as
// a contradiction.
export function spendByMonth(
  rows: Pick<Movement, 'delta' | 'price' | 'at'>[],
  months: number,
): MonthSpend[] {
  const series: MonthSpend[] = [];
  for (let i = months - 1; i >= 0; i--) series.push({ at: startOfMonthsAgo(i), satang: 0 });

  for (const m of rows) {
    if (m.delta <= 0) continue;
    // Walk newest-first and take the first bucket that starts at or before the order. An order
    // older than the oldest bucket matches nothing and is correctly dropped.
    for (let i = series.length - 1; i >= 0; i--) {
      const bucket = series[i];
      if (bucket === undefined) continue;
      if (m.at >= bucket.at) {
        bucket.satang += m.price;
        break;
      }
    }
  }

  return series;
}
```

Add `startOfMonthsAgo` to the `./datetime` import at the top of `stats.ts`:

```ts
import {
  dayKey,
  startOfDaysAgo,
  startOfMonth,
  startOfMonthsAgo,
  startOfPrevMonth,
} from './datetime';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- stats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/datetime.ts src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "feat(stats): add monthly spend series" -m "Turns cost from a snapshot into a trend, which is the page's new remit. Calendar months rather than a rolling window because a bar series needs stable buckets — a rolling window drawn as bars would have every bar mean something slightly different." -m "startOfMonthsAgo generalises startOfPrevMonth and keeps its setDate-before-setMonth ordering, without which the 31st overflows into the wrong month."
```

---

### Task 3: Add `orderCadence`

**Files:**

- Modify: `src/features/coffee/stats.ts` (append)
- Modify: `src/features/coffee/stats.test.ts` (append tests)

**Interfaces:**

- Produces: `orderCadence(rows, now?) => OrderCadence | null` where `OrderCadence = { medianGapDays: number | null; daysSinceLast: number }`. Used by Task 7.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/coffee/stats.test.ts`:

```ts
const DAY_MS = 86_400_000;

test('orderCadence is null when nothing has ever been ordered', () => {
  const now = Date.now();

  expect(orderCadence([], now)).toBeNull();
  expect(orderCadence([{ delta: -1, at: now }], now)).toBeNull();
});

test('orderCadence reports days since the last order', () => {
  const now = Date.now();
  const rows = [{ delta: 10, at: now - 12 * DAY_MS }];

  expect(orderCadence(rows, now)?.daysSinceLast).toBe(12);
});

// One order has no gap to measure. Reporting 0 would read as "you order every day".
test('orderCadence has no gap figure with only one order', () => {
  const now = Date.now();
  const rows = [{ delta: 10, at: now - 3 * DAY_MS }];

  expect(orderCadence(rows, now)?.medianGapDays).toBeNull();
});

test('orderCadence measures the median gap between consecutive orders', () => {
  const now = Date.now();
  const rows = [
    { delta: 10, at: now - 60 * DAY_MS },
    { delta: 10, at: now - 40 * DAY_MS }, // gap 20
    { delta: 10, at: now - 20 * DAY_MS }, // gap 20
    { delta: 10, at: now - 2 * DAY_MS }, // gap 18
  ];

  expect(orderCadence(rows, now)?.medianGapDays).toBe(20);
});

// The whole reason for median over mean: one stock-up trip after a long absence must not redefine
// the cadence. The mean here is 40; the median is 21.
test('orderCadence is not moved by a single outlier gap', () => {
  const now = Date.now();
  const rows = [
    { delta: 10, at: now - 160 * DAY_MS },
    { delta: 10, at: now - 60 * DAY_MS }, // gap 100 — the outlier
    { delta: 10, at: now - 39 * DAY_MS }, // gap 21
    { delta: 10, at: now - 18 * DAY_MS }, // gap 21
  ];

  expect(orderCadence(rows, now)?.medianGapDays).toBe(21);
});

// With an even number of gaps the median is the mean of the two middle values. Spelled out because
// it is exactly the detail two implementations would disagree on.
test('orderCadence averages the two middle gaps when there is an even number', () => {
  const now = Date.now();
  const rows = [
    { delta: 10, at: now - 40 * DAY_MS },
    { delta: 10, at: now - 30 * DAY_MS }, // gap 10
    { delta: 10, at: now - 10 * DAY_MS }, // gap 20
  ];

  expect(orderCadence(rows, now)?.medianGapDays).toBe(15);
});

// movements arrives newest-first from listMovements. Every other function in this module is
// order-independent, and this one must not be the exception that quietly isn't.
test('orderCadence does not depend on the order rows arrive in', () => {
  const now = Date.now();
  const rows = [
    { delta: 10, at: now - 2 * DAY_MS },
    { delta: 10, at: now - 22 * DAY_MS },
    { delta: 10, at: now - 44 * DAY_MS },
  ];

  expect(orderCadence(rows, now)?.medianGapDays).toBe(21);
  expect(orderCadence([...rows].reverse(), now)?.medianGapDays).toBe(21);
});
```

Add `orderCadence` to the `./stats` import list in the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- stats`
Expected: FAIL — `orderCadence` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/features/coffee/stats.ts`:

```ts
export type OrderCadence = {
  // null with fewer than two orders — a single order has no gap to measure, and reporting 0 would
  // read as "you order every day".
  medianGapDays: number | null;
  daysSinceLast: number; // whole local days, floored
};

const MS_PER_DAY = 86_400_000;

// How often you restock, and how long since you last did. Null when nothing has ever been ordered.
//
// MEDIAN, not mean: one stock-up trip after an unusually long absence should not redefine the
// cadence, and with a handful of orders the mean is dominated by exactly that outlier. With an even
// number of gaps the median is the mean of the two middle values.
//
// `now` is a parameter rather than a Date.now() call so the behaviour is pinnable in tests, matching
// consumptionPerDay in db.ts. Rows are sorted rather than assumed ordered: they arrive newest-first
// from listMovements, and every other function here is order-independent.
export function orderCadence(
  rows: Pick<Movement, 'delta' | 'at'>[],
  now = Date.now(),
): OrderCadence | null {
  const times: number[] = [];
  for (const m of rows) if (m.delta > 0) times.push(m.at);
  if (times.length === 0) return null;

  times.sort((a, b) => a - b);
  const last = times[times.length - 1];
  if (last === undefined) return null;
  const daysSinceLast = Math.max(0, Math.floor((now - last) / MS_PER_DAY));

  if (times.length < 2) return { medianGapDays: null, daysSinceLast };

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const previous = times[i - 1];
    const current = times[i];
    if (previous === undefined || current === undefined) continue;
    gaps.push((current - previous) / MS_PER_DAY);
  }

  gaps.sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  const upper = gaps[middle];
  const lower = gaps[middle - 1];
  if (upper === undefined) return { medianGapDays: null, daysSinceLast };
  const median = gaps.length % 2 === 1 || lower === undefined ? upper : (lower + upper) / 2;

  return { medianGapDays: Math.round(median), daysSinceLast };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- stats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "feat(stats): add reorder cadence" -m "The supply-side pattern that complements Home's forward-looking runway: how often you actually restock, and how long since you last did." -m "Median rather than mean, because one stock-up trip after a long absence would otherwise redefine the cadence. Takes `now` as a parameter and sorts its own input, matching consumptionPerDay and the module's order-independence."
```

---

### Task 4: Add `habitCost`

**Files:**

- Modify: `src/features/coffee/stats.ts` (append)
- Modify: `src/features/coffee/stats.test.ts` (append tests)

**Interfaces:**

- Consumes: `costPerCapsule`, `dailyCups`, `averageCups` — all already in `stats.ts`
- Produces: `habitCost(rows, days?) => HabitCost | null` where `HabitCost = { perCapsule: number; perDay: number; perMonth: number; cheapestShop: string | null }`, all satang integers. Used by Task 7.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/coffee/stats.test.ts`:

```ts
// Builds a log with a known price and a known drinking rate: `cups` capsules a day for `days` days.
function habitRows(perCapsuleSatang: number, cups: number, days: number) {
  const rows = [{ delta: 100, price: perCapsuleSatang * 100, shop: 'Tops', at: startOfDaysAgo(0) }];
  for (let d = 0; d < days; d++) {
    for (let c = 0; c < cups; c++) {
      rows.push({ delta: -1, price: 0, shop: '', at: startOfDaysAgo(d) + 9 * 3_600_000 });
    }
  }
  return rows;
}

test('habitCost is null when nothing has been ordered', () => {
  expect(habitCost([])).toBeNull();
  expect(habitCost([{ delta: -1, price: 0, shop: '', at: Date.now() }])).toBeNull();
});

test('habitCost multiplies the capsule price by the daily rate', () => {
  // ฿20.00 a capsule, 2 a day across all 30 days of the window.
  const cost = habitCost(habitRows(2_000, 2, 30), 30);

  expect(cost?.perCapsule).toBe(2_000);
  expect(cost?.perDay).toBe(4_000);
  expect(cost?.perMonth).toBe(120_000);
});

// Zero-cup days stay in the divisor: they are real days you did not drink. Dropping them would
// answer "what it costs on days I drink", a different and much larger number.
test('habitCost divides by every day in the window, including the zero ones', () => {
  // 2 a day for 15 of 30 days = 1 a day overall.
  const cost = habitCost(habitRows(2_000, 2, 15), 30);

  expect(cost?.perDay).toBe(2_000);
});

// perMonth is computed from the rate directly, NOT as perDay * 30, which would multiply a sub-satang
// rounding error thirty-fold. With 1 cup every 7 days at ฿15.55 the two differ.
test('habitCost derives the month from the rate, not from the rounded day', () => {
  const rows = [
    { delta: 7, price: 15_55 * 7, shop: 'Tops', at: startOfDaysAgo(0) },
    { delta: -1, price: 0, shop: '', at: startOfDaysAgo(3) + 9 * 3_600_000 },
  ];
  const cost = habitCost(rows, 7);

  expect(cost).not.toBeNull();
  expect(cost?.perMonth).not.toBe((cost?.perDay ?? 0) * 30);
});

// A zero-price order means "cost unknown" (an opening-balance row), not "free". costPerCapsule
// already excludes them and habitCost must inherit that, or the whole habit reads as cheaper.
test('habitCost inherits the zero-price exclusion', () => {
  const rows = [
    { delta: 100, price: 0, shop: 'Free', at: startOfDaysAgo(0) },
    { delta: 10, price: 20_000, shop: 'Tops', at: startOfDaysAgo(0) },
    { delta: -1, price: 0, shop: '', at: startOfDaysAgo(0) + 9 * 3_600_000 },
  ];

  expect(habitCost(rows, 30)?.perCapsule).toBe(2_000);
});

test('habitCost carries the cheapest shop through', () => {
  const rows = [
    { delta: 10, price: 20_000, shop: 'Tops', at: startOfDaysAgo(0) },
    { delta: 10, price: 30_000, shop: 'Makro', at: startOfDaysAgo(1) },
    { delta: -1, price: 0, shop: '', at: startOfDaysAgo(0) + 9 * 3_600_000 },
  ];

  expect(habitCost(rows, 30)?.cheapestShop).toBe('Tops');
});
```

Add `habitCost` to the `./stats` import list in the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- stats`
Expected: FAIL — `habitCost` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/features/coffee/stats.ts`:

```ts
export type HabitCost = {
  perCapsule: number; // integer satang, ALL-TIME, quantity-weighted
  perDay: number; // integer satang, price × the `days`-window drinking rate
  perMonth: number; // integer satang, the same rate over 30 days
  cheapestShop: string | null;
};

// What the habit costs: the price of a capsule, and what that price times your current drinking rate
// adds up to per day and per month.
//
// TWO WINDOWS, DELIBERATELY. The price is ALL-TIME; the rate is the rolling `days` window. These are
// different kinds of fact — what a capsule costs moves slowly and is best estimated from all
// history, while how fast you drink is a current behaviour. Forcing the price to 30 days means that
// after four weeks without reordering (entirely normal at a ~21-day cadence) the price is null and
// the whole cost section collapses to dashes, on a page whose stated job is what this costs. The
// labels on screen state both windows; see the spec's Deviation section.
//
// perDay uses the ROUNDED per-capsule price on purpose, so the three figures reconcile with what is
// actually printed. perMonth is computed from the rate directly rather than as perDay * 30, which
// would multiply a sub-satang rounding error thirty-fold.
export function habitCost(
  rows: Pick<Movement, 'delta' | 'price' | 'shop' | 'at'>[],
  days = 30,
): HabitCost | null {
  const cost = costPerCapsule(rows);
  if (cost === null) return null;

  const cupsPerDay = averageCups(dailyCups(rows, days));

  return {
    perCapsule: cost.satang,
    perDay: Math.round(cost.satang * cupsPerDay),
    perMonth: Math.round(cost.satang * cupsPerDay * 30),
    cheapestShop: cost.cheapestShop,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- stats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "feat(stats): express cost per capsule, per day and per month" -m "PRODUCT.md names 'what is this habit costing me' as an occasional job, and a per-capsule price alone does not answer it — the rate is what turns a price into a cost." -m "The price stays all-time while the rate is the rolling window: forcing both to 30 days collapses the whole section to dashes after four weeks without a reorder, which is normal at a three-week cadence. perMonth comes from the rate directly, not perDay times thirty."
```

---

### Task 5: Extract `TrendChart`

Lifts the existing `Chart` out of `DashboardView`, so the rewrite in Task 7 is composition rather than composition plus a chart rewrite.

**Not a pure move — three deliberate visual changes ride along**, because this chart is now the page's hero rather than the contents of the second of five cards: container `h-24` → `h-28` (96px → 112px), `mt-3` → `mt-4`, and non-today bar opacity `0.55` → `0.5`. The logic (scaling, average line, min-height floor, per-bar labels) is unchanged. Expect a visibly taller, slightly crisper chart after Task 7 swaps it in.

**Files:**

- Create: `src/features/coffee/components/TrendChart.tsx`

**Interfaces:**

- Consumes: `CupDay` from `../stats`
- Produces: `<TrendChart series={CupDay[]} average={number} />`. Used by Task 7.

- [ ] **Step 1: Create the component**

Create `src/features/coffee/components/TrendChart.tsx`:

```tsx
'use client';

import type { CupDay } from '../stats';

const dayShort = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

// The 30-day trend. CSS bars: a chart library would be ~90kB gzipped for flex and a percentage
// height. The chart is a list, not decoration — each bar carries a label so it is readable without
// sight. Bars are min-height 2px so a zero day still shows as a baseline tick rather than vanishing.
export function TrendChart({ series, average }: { series: CupDay[]; average: number }) {
  const max = Math.max(...series.map((day) => day.cups), 1);

  return (
    <div className="relative mt-4 h-28">
      <ul className="flex h-full items-end gap-[3px]">
        {series.map((day, i) => (
          <li
            key={day.at}
            aria-label={`${dayShort.format(day.at)}: ${day.cups} capsules`}
            className="flex-1 rounded-sm bg-[var(--color-accent)]"
            style={{
              height: `${Math.max((day.cups / max) * 100, 2)}%`,
              // Today is the bar you're standing on — full strength, the rest recede.
              opacity: i === series.length - 1 ? 1 : 0.5,
            }}
          />
        ))}
      </ul>

      {/* Average reference line — what turns 30 bars from "tallest vs rest" into "above or below
          normal". A recessive 1px SOLID hairline, not dashed (dashes read as a second data series);
          aria-hidden because the header already states the value as text. Skipped at zero, where it
          would just trace the baseline. */}
      {average > 0 ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 block border-t border-[var(--color-muted)]"
          style={{ bottom: `${(average / max) * 100}%` }}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass, clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/coffee/components/TrendChart.tsx
git commit -m "refactor(dashboard): lift the trend chart into its own file" -m "Extracted unchanged ahead of the view rewrite, so that change is composition rather than composition plus a chart rewrite, and so the rewritten DashboardView stays a file that can be read in one screen."
```

---

### Task 6: Build `WeekGrid`

**Files:**

- Create: `src/features/coffee/components/WeekGrid.tsx`

**Interfaces:**

- Consumes: `WeekGrid` type from `../stats` (imported aliased, since the component shares the name)
- Produces: `<WeekGrid grid={WeekGrid} />`. Used by Task 7.

- [ ] **Step 1: Create the component**

Create `src/features/coffee/components/WeekGrid.tsx`:

```tsx
'use client';

import type { WeekGrid as Grid } from '../stats';

// Row order matches WeekGrid.cells: night, morning, afternoon, evening.
const BANDS = ['night', 'morning', 'afternoon', 'evening'] as const;
// Column order matches WeekGrid.cells: Monday-first.
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

// When you drink, as a real TABLE rather than a picture. Colour carries the value visually, so the
// count is present as text in every cell and the swatch is aria-hidden: to a screen reader this is a
// table of numbers, which is what keeps it inside WCAG 1.4.1 (value never carried by colour alone).
//
// The floor of 0.18 opacity on a non-zero cell keeps "one capsule" visible against the page rather
// than fading to nothing; a true zero drops to 0.06 so an empty cell reads as empty, not as faint.
export function WeekGrid({ grid }: { grid: Grid }) {
  return (
    <table className="mt-3 w-full border-separate border-spacing-1">
      <caption className="sr-only">Capsules by weekday and time of day, last 30 days</caption>
      <thead>
        <tr>
          <td className="w-12" />
          {DAYS.map((day, i) => (
            <th key={day} scope="col" className="text-[10px] font-normal text-[var(--color-muted)]">
              <span aria-hidden="true">{INITIALS[i]}</span>
              <span className="sr-only">{day}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {BANDS.map((band, b) => (
          <tr key={band}>
            <th scope="row" className="text-left text-[10px] font-normal text-[var(--color-muted)]">
              {band}
            </th>
            {DAYS.map((day, d) => {
              const cups = grid.cells[b]?.[d] ?? 0;
              return (
                <td key={day} className="p-0">
                  <span className="sr-only">{cups}</span>
                  <span
                    aria-hidden="true"
                    className="block h-5 rounded-sm bg-[var(--color-accent)]"
                    style={{ opacity: cups === 0 ? 0.06 : 0.18 + (cups / grid.max) * 0.82 }}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass, clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/coffee/components/WeekGrid.tsx
git commit -m "feat(dashboard): add the weekday by time-of-day grid" -m "Renders both 'when you drink' stats as one object instead of two lists, which is what lets the page carry more information in fewer blocks." -m "Built as a table with per-cell counts as text and an aria-hidden swatch, so colour is never the only carrier of the value."
```

---

### Task 7: Rewrite `DashboardView`

**Files:**

- Create: `test/coffee-fixture.ts`
- Create: `src/features/coffee/dashboard-view.test.tsx`
- Modify: `src/features/coffee/home-view.test.tsx:29-47` (replace the local `coffeeWith` with the shared import)
- Modify: `src/features/coffee/components/DashboardView.tsx` (full rewrite)

**Interfaces:**

- Consumes: `TrendChart` (Task 5), `WeekGrid` (Task 6), `habitCost` (Task 4), `orderCadence` (Task 3), `spendByMonth` (Task 2), `weekGrid` (Task 1), `dailyCups` / `averageCups` (existing), `formatSatang` from `../money`
- Produces: the rewritten page. Nothing depends on it.

- [ ] **Step 1: Extract the shared test fixture**

Create `test/coffee-fixture.ts`:

```ts
import { vi } from 'vitest';
import type { UseCoffee } from '@features/coffee/use-coffee';

// One UseCoffee stub for both view test files. Extracted on the second consumer rather than the
// third: the shape has eleven members, and two copies drift the moment one gains a field.
export function coffeeWith(overrides: Partial<UseCoffee>): UseCoffee {
  return {
    ready: true,
    movements: [],
    stock: 0,
    blend: null,
    consumedToday: 0,
    consumedWeek: 0,
    consumedMonth: 0,
    spentMonth: 0,
    drink: vi.fn(async () => {}),
    addOrder: vi.fn(async () => {}),
    removeMovement: vi.fn(async () => {}),
    editMovementTime: vi.fn(async () => {}),
    editOrder: vi.fn(async () => {}),
    restore: vi.fn(async () => 0),
    ...overrides,
  } satisfies UseCoffee;
}
```

In `src/features/coffee/home-view.test.tsx`, delete the local `coffeeWith` function (lines 29–47) and add the import:

```ts
import { coffeeWith } from '../../../test/coffee-fixture';
```

Then remove `UseCoffee` from the type imports there if it is no longer referenced.

- [ ] **Step 2: Verify the extraction did not break Home's tests**

Run: `npm test -- home-view`
Expected: PASS, same count as before (12 tests).

- [ ] **Step 3: Write the failing dashboard tests**

Create `src/features/coffee/dashboard-view.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { Movement } from './db';
import { DashboardView } from './components/DashboardView';
import { startOfDaysAgo } from './datetime';
import { coffeeWith } from '../../../test/coffee-fixture';

// Home answers "now"; this page answers "over time". These tests pin the figures it volunteers and,
// just as importantly, the ones it stays silent about — a dashboard that fills every slot with a
// zero or a delta from nothing is the failure this redesign exists to remove.

function drink(daysAgo: number, hour = 9, id = `d${daysAgo}-${hour}`): Movement {
  return {
    id,
    shop: '',
    brand: '',
    beanName: '',
    delta: -1,
    price: 0,
    at: startOfDaysAgo(daysAgo) + hour * 3_600_000,
  };
}

// Orders sit at exactly local midnight, NOT at an hour offset. daysSinceLast floors
// (now - at) / 86_400_000, so an order at 10:00 N days ago reads as N-1 whenever the test runs
// before 10:00 — a test that passes all afternoon and fails every morning. From midnight the
// difference is always N days plus however far into today it is, which always floors to N.
function order(daysAgo: number, price: number, shop = 'Tops'): Movement {
  return {
    id: `o${daysAgo}`,
    shop,
    brand: '',
    beanName: '',
    delta: 30,
    price,
    at: startOfDaysAgo(daysAgo),
  };
}

// Two capsules a day for the last 30 days, and none before that.
function steadyDrinker(): Movement[] {
  const rows: Movement[] = [];
  for (let d = 0; d < 30; d++) {
    rows.push(drink(d, 9, `a${d}`), drink(d, 15, `b${d}`));
  }
  return rows;
}

test('an empty log says so once rather than showing a page of zeros', () => {
  render(<DashboardView coffee={coffeeWith({ movements: [] })} />);

  expect(screen.getByText(/Log a few cups/)).toBeInTheDocument();
  expect(screen.queryByText(/a capsule/)).not.toBeInTheDocument();
});

// Queried by test id, not by text: the grid renders a count in all 28 cells, so getByText('2')
// would be matching the hero against a field of loose integers and could resolve to a cell.
test('the hero leads with the daily rate over the window', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.getByTestId('trend-average')).toHaveTextContent('2');
  expect(screen.getByText(/capsules a day/)).toBeInTheDocument();
});

// A delta from nothing is not information — the same rule that keeps percentages off a zero
// baseline. A new user must not be told they are "up from 0".
test('with no history before the window the comparison line is omitted', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.queryByText(/the 30 days before/)).not.toBeInTheDocument();
});

test('with history on both sides it states the direction of the change', () => {
  const rows = steadyDrinker();
  // Four a day across the PREVIOUS 30 days, against two a day in the current window.
  for (let d = 30; d < 60; d++) {
    for (let c = 0; c < 4; c++) rows.push(drink(d, 9, `p${d}-${c}`));
  }
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  expect(screen.getByText(/down from 4 the 30 days before/)).toBeInTheDocument();
});

test('the cost section states all three figures and both windows', () => {
  // ฿20.00 a capsule; two a day gives ฿40.00 a day and ฿1,200.00 a month.
  const rows = [order(0, 60_000), ...steadyDrinker()];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  expect(screen.getByText(/a capsule/)).toBeInTheDocument();
  expect(screen.getByText(/฿40\.00/)).toBeInTheDocument();
  expect(screen.getByText(/฿1,200\.00/)).toBeInTheDocument();
  expect(screen.getByText(/price all-time · rate over the last 30 days/)).toBeInTheDocument();
});

test('with no orders the cost section admits it rather than printing zero', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.getByText(/no orders logged yet/)).toBeInTheDocument();
  expect(screen.queryByText(/฿0\.00/)).not.toBeInTheDocument();
});

test('a single order reports days since it without inventing a cadence', () => {
  const rows = [order(12, 60_000), ...steadyDrinker()];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  expect(screen.getByText(/12d ago/)).toBeInTheDocument();
  expect(screen.queryByText(/every ~/)).not.toBeInTheDocument();
});

test('two orders report the gap between them', () => {
  const rows = [order(2, 60_000), order(23, 60_000), ...steadyDrinker()];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  expect(screen.getByText(/every ~21 days/)).toBeInTheDocument();
});

// The grid carries its values as colour, so every count must also be readable as text or the block
// is inaccessible by construction.
test('the grid is a table whose cells carry their counts as text', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  const table = screen.getByRole('table', { name: /Capsules by weekday and time of day/ });
  expect(table).toBeInTheDocument();
  expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  expect(screen.getAllByRole('rowheader')).toHaveLength(4);
});

// A page that logged cups but never an order still has a trend and a rhythm to show; only the cost
// block should degrade.
test('a log with no orders still renders the trend and the grid', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.getByText(/capsules a day/)).toBeInTheDocument();
  expect(screen.getByRole('table')).toBeInTheDocument();
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- dashboard-view`
Expected: FAIL — the current `DashboardView` renders "Stock runway" and has no "capsules a day" hero.

- [ ] **Step 5: Rewrite the view**

Replace the entire contents of `src/features/coffee/components/DashboardView.tsx` with:

```tsx
'use client';

import type { UseCoffee } from '../use-coffee';
import { formatSatang } from '../money';
import {
  averageCups,
  dailyCups,
  habitCost,
  orderCadence,
  spendByMonth,
  weekGrid,
  type MonthSpend,
} from '../stats';
import { TrendChart } from './TrendChart';
import { WeekGrid } from './WeekGrid';

const number = new Intl.NumberFormat('en-US');
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const dayShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' });

const WINDOW_DAYS = 30;
const SPEND_MONTHS = 6;

// Dashboard: the zoomed-out view. Home answers "now" — what's left, what today looks like, what this
// month has cost. This answers "over time": am I drinking more than I was, what is the habit costing
// me, and when do I actually drink. Nothing Home already states appears here as a raw figure; only
// change over time does.
//
// Three blocks, not five cards. The trend is drawn unboxed, directly on the page, and that absence
// of card chrome is what makes it read as the hero rather than the first of N equal rectangles —
// PRODUCT.md names stacked equal-weight rounded rectangles as the failure mode this app is closest
// to. Every figure comes from the pure stats module; this file only formats and lays out.
export function DashboardView({ coffee }: { coffee: UseCoffee }) {
  const { movements } = coffee;

  // A dashboard of zeros teaches nothing and looks broken. One honest line until there's data.
  if (movements.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] bg-[var(--color-surface)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
        Log a few cups and your stats will show up here.
      </p>
    );
  }

  // One call covers both windows: the last 30 entries are what's drawn, the first 30 are what it's
  // compared against. A second dailyCups call would walk the same rows twice for the same answer.
  const both = dailyCups(movements, WINDOW_DAYS * 2);
  const series = both.slice(WINDOW_DAYS);
  const average = averageCups(series);
  const previous = averageCups(both.slice(0, WINDOW_DAYS));

  // These all read the clock (period boundaries, and orderCadence's default `now`). That is safe
  // here only because `movements` is [] on the server AND on the client's first render — use-coffee
  // loads in a mount effect — so both passes take the early return above and never reach this line.
  // The same reasoning is why HomeView can call consumptionPerDay in render. If that ever changes,
  // this is where a hydration mismatch appears.
  const cost = habitCost(movements, WINDOW_DAYS);
  const spend = spendByMonth(movements, SPEND_MONTHS);
  const cadence = orderCadence(movements);
  const grid = weekGrid(movements, WINDOW_DAYS);

  const first = series[0];
  const last = series[series.length - 1];

  return (
    <section className="flex flex-col gap-7">
      {/* 1 — The trend. Unboxed: this is the hero. */}
      <div>
        <p className="flex items-baseline gap-2">
          <span data-testid="trend-average" className="tnum text-[32px] font-semibold leading-none">
            {average > 0 ? oneDecimal.format(average) : '—'}
          </span>
          <span className="text-[var(--color-muted)]">capsules a day</span>
        </p>

        {/* Silent unless there is something to say. No comparison against an empty previous window —
            a delta from nothing is not information, the same rule that keeps percentages off a zero
            baseline — and no "same as" line when nothing changed. */}
        {average === 0 ? (
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            no capsules logged in the last {WINDOW_DAYS} days
          </p>
        ) : previous > 0 && average !== previous ? (
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {average < previous ? 'down' : 'up'} from {oneDecimal.format(previous)} the{' '}
            {WINDOW_DAYS} days before
          </p>
        ) : null}

        <TrendChart series={series} average={average} />

        <p className="mt-2 flex justify-between text-xs text-[var(--color-muted)]">
          <span>{first ? dayShort.format(first.at) : ''}</span>
          <span aria-hidden="true">line is the average</span>
          <span>{last ? dayShort.format(last.at) : ''}</span>
        </p>
      </div>

      {/* 2 — What it costs. */}
      <div className="border-t border-[var(--color-border)] pt-6">
        <h2 className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]">
          What it costs
        </h2>

        {cost ? (
          <>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="tnum text-[30px] font-semibold leading-none">
                {formatSatang(cost.perCapsule)}
              </span>
              <span className="text-[var(--color-muted)]">a capsule</span>
            </p>

            <p className="tnum mt-1.5 text-sm text-[var(--color-muted)]">
              about{' '}
              <span className="font-semibold text-[var(--color-text)]">
                {formatSatang(cost.perDay)}
              </span>{' '}
              a day ·{' '}
              <span className="font-semibold text-[var(--color-text)]">
                {formatSatang(cost.perMonth)}
              </span>{' '}
              a month
            </p>

            {/* The price and the rate use different windows on purpose; saying so is what keeps the
                three figures from looking like they fail to reconcile. */}
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              price all-time · rate over the last {WINDOW_DAYS} days
            </p>

            <SpendBars spend={spend} />

            <dl className="mt-4">
              {cost.cheapestShop ? (
                <div className="flex items-baseline justify-between border-t border-[var(--color-border)] py-2.5">
                  <dt className="text-sm text-[var(--color-muted)]">Cheapest at</dt>
                  <dd className="font-semibold">{cost.cheapestShop}</dd>
                </div>
              ) : null}
              {cadence ? (
                <div className="flex items-baseline justify-between border-t border-[var(--color-border)] py-2.5">
                  <dt className="text-sm text-[var(--color-muted)]">You order</dt>
                  <dd className="tnum">
                    {cadence.medianGapDays !== null ? (
                      <span className="font-semibold">
                        every ~{number.format(cadence.medianGapDays)} days
                      </span>
                    ) : null}
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      last one {number.format(cadence.daysSinceLast)}d ago
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          </>
        ) : (
          <>
            <p className="mt-2 text-[30px] font-semibold leading-none">—</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">no orders logged yet</p>
          </>
        )}
      </div>

      {/* 3 — When you drink. */}
      <div className="border-t border-[var(--color-border)] pt-6">
        <h2 className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]">
          When you drink
        </h2>
        <WeekGrid grid={grid} />
      </div>
    </section>
  );
}

// Actual cash per calendar month — the lumpy reality behind the smooth rate above. Each bar carries
// its month and amount as a label, so the series is readable without sight; a zero month keeps a 2px
// baseline tick rather than vanishing, matching the trend chart.
function SpendBars({ spend }: { spend: MonthSpend[] }) {
  const max = Math.max(...spend.map((m) => m.satang), 1);
  const first = spend[0];
  const last = spend[spend.length - 1];

  return (
    <>
      <ul className="mt-4 flex h-10 items-end gap-1.5">
        {spend.map((month) => (
          <li
            key={month.at}
            aria-label={`${monthShort.format(month.at)}: ${formatSatang(month.satang)}`}
            className="flex-1 rounded-sm bg-[var(--color-accent)] opacity-50"
            style={{ height: `${Math.max((month.satang / max) * 100, 2)}%` }}
          />
        ))}
      </ul>
      <p className="mt-1.5 flex justify-between text-xs text-[var(--color-muted)]">
        <span>{first ? monthShort.format(first.at) : ''}</span>
        <span aria-hidden="true">actually spent, by month</span>
        <span>{last ? monthShort.format(last.at) : ''}</span>
      </p>
    </>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- dashboard-view`
Expected: PASS (10 tests).

- [ ] **Step 7: Run the full quality gates**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: all pass. `DashboardView` no longer imports `daysOfStockLeft`, `monthComparison` or `timeOfDay` — those three are now unreferenced by app code and get deleted in Task 8. `lint` may warn that they are unused exports; that is expected and is resolved by Task 8, not here.

- [ ] **Step 8: Commit**

```bash
git add test/coffee-fixture.ts src/features/coffee/dashboard-view.test.tsx src/features/coffee/home-view.test.tsx src/features/coffee/components/DashboardView.tsx
git commit -m "feat(dashboard): rebuild the page around patterns over time" -m "Home owns now; this owns over time. The runway card went because it restated Home's hero, and the month card reduced to its delta because Home already prints the totals. The trend leads unboxed — the absence of card chrome is what makes it the hero rather than the first of five equal rectangles." -m "Three blocks carrying seven stats, against five carrying five. The UseCoffee stub moved to test/coffee-fixture.ts on its second consumer, since two copies of an eleven-member shape drift the moment one gains a field."
```

---

### Task 8: Delete the three dead stats and run the gates

`daysOfStockLeft`, `monthComparison` and `timeOfDay` all lost their only callers in Task 7. Deleted last, together, so every earlier commit stayed green.

**Files:**

- Modify: `src/features/coffee/stats.ts` (delete `StockRunway` + `daysOfStockLeft`, `MonthComparison` + `monthComparison`, `TimeOfDay` + `timeOfDay`)
- Modify: `src/features/coffee/stats.test.ts` (delete their tests, and the weekGrid equivalence test that depends on `timeOfDay`)

- [ ] **Step 1: Confirm they are genuinely unreferenced**

Run: `grep -rn "daysOfStockLeft\|monthComparison\|timeOfDay" src/`
Expected: matches ONLY in `src/features/coffee/stats.ts` and `src/features/coffee/stats.test.ts`. If anything else matches — in particular any component — STOP: the assumption behind this task is wrong. Report it rather than deleting.

- [ ] **Step 2: Delete the functions**

In `src/features/coffee/stats.ts`, delete:

- the `StockRunway` type and `daysOfStockLeft` function (originally lines 10–28)
- the `MonthComparison` type and `monthComparison` function (originally lines 69–99)
- the `TimeOfDay` type and `timeOfDay` function (originally lines 155–180)

Remove now-unused imports from the top of the file: `countConsumed` (used only by `daysOfStockLeft`) and `startOfMonth` / `startOfPrevMonth` (used only by `monthComparison`). Keep `startOfMonthsAgo`, `startOfDaysAgo` and `dayKey`.

The import lines should end up as:

```ts
import { type Movement } from './db';
import { dayKey, startOfDaysAgo, startOfMonthsAgo } from './datetime';
```

- [ ] **Step 3: Delete their tests**

In `src/features/coffee/stats.test.ts`:

- delete every `test(...)` block whose name begins `daysOfStockLeft` (originally lines 64–118), `monthComparison` (originally lines 168–208), or `timeOfDay` (originally lines 279–328)
- delete the `test('weekGrid row sums equal the timeOfDay buckets it replaces', …)` block added in Task 1 — it calls `timeOfDay`, which no longer exists. Its job was to prove the transition, and it has. The hand-written `rowSums` assertions from Task 1 remain and are what guard `weekGrid` from here on. Keep the `rowSums` helper — those tests still use it.
- remove `daysOfStockLeft`, `monthComparison` and `timeOfDay` from the `./stats` import list

`startOfMonth` and `startOfPrevMonth` are still used by the `spendByMonth` tests from Task 2 — keep those `./datetime` imports.

- [ ] **Step 4: Run the full quality gates**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: all pass. If `format:check` fails, run `npm run format` and re-run the gates.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "refactor(stats): drop the three derivations the dashboard no longer needs" -m "daysOfStockLeft and monthComparison lost their only callers when the runway card went and the month card reduced to a delta; timeOfDay lost its when weekGrid absorbed it. Home computes its own runway through consumptionPerDay and never used any of them." -m "Deleted last, together, after the view stopped importing them, so every earlier commit typechecked."
```

---

## Verification

After Task 8, confirm the page in a real browser — the orb regression this work interrupted was invisible to every gate and only showed up on screen:

- [ ] `npm run dev`, open the dashboard tab at 412×860
- [ ] Trend, cost and grid all render; no card chrome on the trend
- [ ] The comparison line is absent for a log with no history before the window
- [ ] The cost block degrades to `—` with no orders, and the rest of the page still renders
- [ ] `--color-muted` and `--color-faint` text on `--color-bg` (not `--color-surface`) meet AA — re-measure, per the spec's accessibility note. `--color-faint` is already 4.4:1 on surface and may fail on bg.
- [ ] The grid reads as calm rather than as a dashboard. If it does not, the documented fallback is 7 day-bars plus the existing 4 time-bars.

## Out of scope

- Unifying the two runway implementations. Home's floors to a minimum of 1 day; `daysOfStockLeft` did not. Consolidating changes what Home displays and needs its own decision.
- Any change to Home, the schema, or the data layer.
