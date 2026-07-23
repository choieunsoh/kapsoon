# Dashboard: patterns over time — design

Supersedes `2026-07-18-dashboard-design.md`, which specified the current five-card page. That page
works but violates two of PRODUCT.md's stated anti-references, and repeats Home. This redesign
replaces it.

## Problem

Two problems, one structural and one editorial.

**Structural.** PRODUCT.md names the failure mode directly:

> **Undifferentiated card grids.** Equal-weight rounded rectangles stacked down the page are the
> failure mode this app is already closest to; every block must earn its visual weight.

`DashboardView` is exactly that — five `<Card>`s in a `gap-4` column. It also names
"sterile fintech dashboards… no sparkline-and-percentage-delta template", which `CompareRow` is.
Home escaped this when the orb landed; the dashboard never got the same pass.

**Editorial.** Roughly 40% of the page restates Home in a different font size:

| Fact                | Home              | Dashboard today |
| ------------------- | ----------------- | --------------- |
| Days of runway      | hero, 32px        | card 1, 30px    |
| Capsules this month | supporting figure | card 3          |
| Spent this month    | supporting figure | card 3          |

The only genuinely new thing in card 3 is the month-over-month delta.

## Decisions

**Division of labour.** Home owns **now** (runway, today, this month). The dashboard owns
**patterns over time**. Nothing that Home already states appears here as a raw figure; only change
over time does.

**Hero.** The 30-day trend leads and takes the page's largest visual weight. It is drawn _unboxed_,
directly on the page background — that absence of card chrome is what makes it read as the hero
rather than as the first of N equal blocks.

**Window.** Every _rate_ on the page is a rolling 30 local days, matching the chart. Two deliberate
exceptions:

- the **capsule price** is all-time (see Deviation below);
- the **monthly spend bars** are calendar months, because a time series needs stable, comparable
  buckets — a rolling window drawn as a bar series would have every bar mean something slightly
  different. They are labelled as calendar months and carry actual cash, not a rate, which is what
  keeps them from reading as a contradiction of the rate above them.

**Blocks.** Three, carrying seven stats. Today's page is five blocks carrying five.

### Deviation: price is all-time, rates are 30-day

`perCapsule` stays **all-time** and quantity-weighted. `perDay` / `perMonth` use the **rolling 30
days**.

Rationale: these are different kinds of fact. What a capsule _costs_ moves slowly and is best
estimated from all history; how fast you _drink_ is a current behaviour. Forcing the price to 30
days means that after four weeks without reordering — entirely normal at a ~21-day cadence with any
slack — the price is `null` and the whole cost section collapses to dashes, on a page whose stated
job is "what is this habit costing me?".

The cost is that two adjacent lines use different windows, so **the labels must state both**:
`price all-time · rate over the last 30 days`. This is a deliberate, documented trade, not an
oversight.

## Page structure

### 1 — Hero: 30-day trend (unboxed)

- `4.2` at ~32px + `capsules a day`
- Comparison line: `down from 5.1 the 30 days before`
- The existing bar chart with its average reference line
- Footnote: date range · `line is the average`

Computed from **one** `dailyCups(movements, 60)` call: `slice(30)` is the drawn window, `slice(0, 30)`
is the comparison. **No new stats function.**

If the previous 30 days average zero, the comparison line is **omitted entirely** — not rendered as
"up from 0". Same reasoning as the existing rule against percentages on a zero baseline: a delta
from nothing is not information.

### 2 — What it costs

- `฿18.40` at ~30px + `a capsule`
- `about ฿77 a day · ฿2,320 a month`
- Window note: `price all-time · rate over the last 30 days`
- Six monthly bars of **actual cash spend**, labelled `actually spent, by month`
- Two hairline-divided rows: `Cheapest at <shop>` · `You order every ~21 days / last one 12d ago`

The monthly bars are actual cash and the figures above are an accrual rate. These genuinely differ,
and the labels are what keep them from reading as a contradiction.

### 3 — When you drink

A 7-column (Mon–Sun) × 4-row (night / morning / afternoon / evening) grid, replacing the four
time-of-day bars and absorbing the new day-of-week stat into the same object.

## `stats.ts` changes

### Delete

- **`daysOfStockLeft`** — its only caller was the runway card. Home computes its runway
  independently via `consumptionPerDay`.
- **`monthComparison`** — its only caller was `CompareRow`; the page is now rolling-window.

Both are dead after this change. Their tests go with them (~55 lines).

### Replace

**`timeOfDay` → `weekGrid`.**

```ts
export type WeekGrid = {
  // [band][weekday]. 4 bands in the order night, morning, afternoon, evening;
  // 7 weekdays Monday-first. Shape is asserted in tests.
  cells: number[][];
  max: number; // largest single cell, floor 1, so callers can scale without a zero divisor
};

export function weekGrid(rows: Pick<Movement, 'delta' | 'at'>[], days = 30): WeekGrid;
```

The old four buckets are this grid's row sums, so this is one function where there were two.
Weekday index is `(new Date(at).getDay() + 6) % 7` — `getDay()` is Sunday-first, the grid is
Monday-first. Band boundaries are unchanged from `timeOfDay` (night <6, morning <12, afternoon <18,
else evening) and read off the local hour, as before.

Consumption only (`delta < 0`). When you _bought_ capsules says nothing about the habit.

### Add

```ts
export type MonthSpend = { at: number; satang: number };

// Actual cash per local calendar month, oldest→newest, exactly `months` entries.
// A month with no orders is a zero entry, never a missing one — same reasoning as dailyCups.
export function spendByMonth(
  rows: Pick<Movement, 'delta' | 'price' | 'at'>[],
  months: number,
): MonthSpend[];
```

```ts
export type OrderCadence = {
  medianGapDays: number | null; // null with fewer than 2 orders — one order has no gap
  daysSinceLast: number; // whole local days, floored
};

// null when nothing has ever been ordered.
export function orderCadence(rows: Pick<Movement, 'delta' | 'at'>[]): OrderCadence | null;
```

**Median, not mean.** One stock-up trip after an unusually long gap should not redefine the cadence,
and with a handful of orders the mean is dominated by exactly that outlier. With an even number of
gaps the median is the mean of the two middle values, rounded — spelled out because "the median of
an even set" is exactly the kind of detail two implementations would disagree on.

Gaps are measured between consecutive orders in time order. `movements` arrives newest-first from
`listMovements`, so this function sorts rather than assuming order — the rest of `stats.ts` is
order-independent and this must not be the exception that quietly isn't.

```ts
export type HabitCost = {
  perCapsule: number; // integer satang, all-time, quantity-weighted
  perDay: number; // integer satang
  perMonth: number; // integer satang
  cheapestShop: string | null;
};

// null when costPerCapsule is null (nothing ordered, or every order zero-price).
export function habitCost(
  rows: Pick<Movement, 'delta' | 'price' | 'shop' | 'at'>[],
  days = 30,
): HabitCost | null;
```

Composes `costPerCapsule` (unchanged, still exported and independently tested) with the 30-day
consumption rate. `perDay` and `perMonth` are both derived from the **unrounded** product and
rounded only at the boundary, per the house money rule — never `perMonth = perDay * 30`, which
compounds a rounding error 30×.

`costPerCapsule`'s existing exclusions carry through unchanged: `price === 0` orders mean _cost
unknown_, not free, and are excluded entirely.

### Unchanged

`dailyCups`, `averageCups`, `costPerCapsule`.

## `datetime.ts` addition

```ts
// Local midnight on the 1st of the calendar month `n` months ago (0 = this month).
export function startOfMonthsAgo(n: number): number;
```

Must call `setDate(1)` **before** `setMonth()`, for the same reason `startOfPrevMonth` does: on the
31st, decrementing the month first overflows into the wrong month. Generalises `startOfPrevMonth`,
which stays (it has its own callers in tests and reads better at the call site).

## Components

`DashboardView.tsx` would clear 350 lines as a single file. Split:

- **`DashboardView.tsx`** — composition and the cost section (layout, no logic)
- **`TrendChart.tsx`** — the bar chart + average line, extracted from today's `Chart`
- **`WeekGrid.tsx`** — the day × time grid

The monthly spend bars are a small enough variant to live inline in the cost section rather than
earning a component.

Components stay data-layer-agnostic: they take a `UseCoffee` and call the pure stats module. No
`db.ts` import.

## States

| Condition                      | Behaviour                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| No movements at all            | Existing single honest line: "Log a few cups and your stats will show up here."                           |
| No cups in 30 days             | Hero shows `—` and "no capsules logged in the last 30 days"; chart still drawn (all zeros); grid all zero |
| Previous 30 days empty         | Comparison line omitted entirely                                                                          |
| No orders ever                 | Cost section shows `—`; cadence row not rendered                                                          |
| One order only                 | Cadence shows "last one Nd ago" without a gap figure                                                      |
| Fewer than 6 months of history | Spend bars still render 6 entries; empty months are zeros                                                 |

## Accessibility

Target stays WCAG 2.2 AA.

- **The grid is a `<table>`**, not a picture: `<caption>` (sr-only), `<th scope="col">` weekdays,
  `<th scope="row">` bands, and each cell carries its count as text. The colour swatch is
  `aria-hidden`; the count is the accessible content. This satisfies 1.4.1 — value is never carried
  by colour alone.
- Chart bars keep the existing per-bar `aria-label` ("Mon, Jul 14: 3 capsules").
- Monthly spend bars get the same treatment.
- The average reference line stays `aria-hidden`; its value is already stated as text in the header.
- **Contrast re-check required.** `--color-faint` measures 4.4:1 on `--color-surface` — already under
  AA for small text, which is why HomeView avoids it for anything informational. Most of this page
  sits on `--color-bg`, not `--color-surface`, so every faint-on-bg pairing must be re-measured
  before it ships. Prefer `--color-muted` for any text carrying information.
- Motion: nothing on this page animates. Nothing to neutralise.

## Testing

- `weekGrid`: band boundaries land in the later bucket; Monday-first index mapping; orders ignored;
  window edge (oldest day in, day before out) mirroring the existing `dailyCups` / `timeOfDay`
  boundary tests; row sums equal the old `timeOfDay` output for the same input — ported from the
  tests being replaced, which is what proves the merge lost nothing.
- `spendByMonth`: exact length; zero-fill; calendar boundary on the 1st; orders only.
- `orderCadence`: median not mean (an outlier gap must not move it); `null` with no orders;
  `medianGapDays === null` with exactly one.
- `habitCost`: `null` when nothing ordered; rounding happens once at the boundary
  (`perMonth !== perDay * 30` where that would differ); zero-price orders excluded.
- `dashboard-view.test.tsx`: hero figure and omitted comparison line; cost triple; each state in the
  table above.

## Out of scope

- **Unifying the two runway implementations.** Deleting `daysOfStockLeft` leaves Home's inline
  version as the only one. They behave differently — Home floors to a minimum of 1 day,
  `daysOfStockLeft` does not — so consolidating changes what Home displays. That is a Home change,
  and it needs its own decision.
- Any change to Home, the schema, or the data layer. This is a presentation-and-derivation change
  only; every new figure comes from the existing movement log.

## Risks

**The grid is the densest object in the app**, in a product whose brand is "calm, warm, effortless"
and whose anti-references include dashboard-ese. It is kept because the page's actual disease is
block count, and the grid merges two stats into one block where separate day-bars and time-bars
would be two.

If it reads wrong on device, the documented fallback is 7 day-bars plus the existing 4 time-bars,
accepting a fourth block. This is a revert to a known-good pattern, not a redesign.
