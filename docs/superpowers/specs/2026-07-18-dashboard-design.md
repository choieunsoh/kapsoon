# Dashboard view — design

Date: 2026-07-18

## Goal

A zoomed-out view answering the questions Home structurally can't: _am I drinking more than I
was, when do I run out, and what is this costing me per cup?_ Home stays the "today" surface.

Five tiles, one thumb-scroll on a 430px column. Anything that doesn't change a decision or reveal
a pattern was cut.

## Scope

**In:** a fourth tab + view, a pure `stats.ts` module, unit tests for the stats.
**Out:** routing (the app has none), schema changes, a chart library, per-shop tables, streaks,
all-time totals, date-range pickers.

## Architecture

The app is a single page (`src/app/page.tsx` → `Coffee.tsx`) that swaps views off
`useState<Tab>`. There is no App Router segment for Home or History, and the Dashboard gets none
either — "/dashboard" here means a tab, not a URL. This keeps the single shared `useCoffee()`
instance, so switching to Dashboard never re-reads OPFS.

`BottomNav.tsx` already reserves a disabled Dashboard slot with a comment saying to give it a
`Tab` value and a view when it's real. This design does exactly that.

### Files

| File                                               | Change                                                    |
| -------------------------------------------------- | --------------------------------------------------------- |
| `src/features/coffee/stats.ts`                     | **new** — pure derivations over `Movement[]`              |
| `src/features/coffee/components/DashboardView.tsx` | **new** — the view                                        |
| `src/features/coffee/components/BottomNav.tsx`     | add `'dashboard'` to `Tab`; drop `disabled`, wire `onTab` |
| `src/features/coffee/components/Coffee.tsx`        | render `DashboardView` for the new tab                    |
| `src/features/coffee/stats.test.ts`                | **new** — unit tests                                      |
| `src/features/coffee/datetime.ts`                  | add `startOfDaysAgo(n)`                                   |

`use-coffee.ts` is **not** touched. It already returns the full `movements` array; the view calls
`stats.ts` on it directly. Adding six more `useState` fields to the hook would mean six more
`setX` calls in `refresh()` for numbers only one view reads.

### Data flow

```
OPFS/SQLite → useCoffee().movements → stats.ts (pure) → DashboardView (presentational)
```

`stats.ts` takes `Movement[]` and returns plain numbers/arrays. No React, no DB import, no
formatting — callers format via the existing `money.ts` / `Intl` helpers. This is what makes it
testable with plain arrays and no OPFS.

## The five tiles

### 1. Days of stock left

`daysOfStockLeft(movements, stock)` → `number | null`

Burn rate = cups consumed in the last 14 days ÷ 14. Days left = `stock / burnRate`, floored.
Returns `null` when burn rate is 0 (no cups in 14 days) — the view renders "—" rather than
`Infinity`. Also `null` when `stock <= 0`; the tile shows "Out of stock" instead.

The only actionable number in the app: it says _reorder now_. Leads the page for that reason.

Copy: `~12 days left` / `at ~1.4 cups a day`.

### 2. Cups per day, last 30 days

`dailyCups(movements, days)` → `{ at: number; cups: number }[]`, oldest→newest, one entry per
local calendar day including zero days (gaps must render as gaps, not be dropped).

Rendered as CSS bars: a flex row of 30 divs, each `height: (cups / max) * 100%`. No chart
library — Recharts is ~90kB gzipped for what `flex` and a `%` height already do. Bars use
`--color-accent`; today's bar is full-opacity, the rest at 60%.

Accessibility: the chart is a `<ul>` where each bar is an `<li>` with an `aria-label` of
`"Tue Jul 15: 3 cups"`, so it reads as a list rather than as decoration.

### 3. This month vs last month

`monthComparison(movements)` → `{ cups, spent, prevCups, prevSpent }`

Two rows — cups and spend — each with the current figure and a ± delta against the same metric
last calendar month. Percentages are omitted when the previous value is 0 (no "+∞%"); the view
shows "no data last month".

Note this is **calendar** months, so early in a month the comparison is unfair by construction.
Accepted: the label says "This month vs last", and a single-user app doesn't need
month-to-date-vs-same-day-last-month machinery.

### 4. Cost per capsule

`costPerCapsule(movements)` → `{ satang: number; cheapestShop: string | null } | null`

All-time `Σprice / Σdelta` over orders (`delta > 0`) only. **Weighted by quantity** — averaging
each order's own per-capsule rate would let a 1-capsule order swing the mean as hard as a
50-capsule one. Returns `null` when there are no orders.

Orders with `price === 0` are excluded entirely, from both the average and the ranking below.
Zero price means "cost unknown" (e.g. an opening-balance row for stock already on hand when the
log began) — not "free". Averaging it in as free capsules understates the real cost and lets a
priceless row win "cheapest shop" trivially.

`cheapestShop` is the shop with the lowest weighted per-capsule cost, ties broken by most
capsules bought. Named in the sub-line: `cheapest at Tops`. A full per-shop table is out of
scope — this is the useful half of it in one line.

Rounding: satang stays an integer throughout (`Math.round` at the end), per the house money rule.

### 5. Time of day

`timeOfDay(movements)` → `{ morning, afternoon, evening, night }` cup counts over the last 30
days.

Buckets by local hour: night 0–5, morning 6–11, afternoon 12–17, evening 18–23. Rendered as four
horizontal bars with counts. Consumption only (`delta < 0`) — when you _bought_ capsules is
noise.

## Empty and edge states

The view is reached from a bottom-nav tab, so it must survive an empty DB and a fresh install.

- **No movements at all:** the whole view is replaced by one centred line — "Log a few cups and
  your stats will show up here." No skeleton grid of zeros.
- **Movements but no orders** (seeded/imported consumption only): tiles 1 and 4 render "—";
  2, 3, 5 render normally.
- **Fewer than 30 days of history:** the chart still renders 30 slots; missing days are zero-height
  bars. Truncating the axis to the data would make a 3-day-old install look like a full month.
- **`stock <= 0`:** tile 1 reads "Out of stock" and is tinted with the accent, matching how
  `HomeView` disables the drink orb.

## Error handling

There is none to add. `stats.ts` is pure and total: every function takes an array and returns a
value or `null`, with no throws, no I/O, no async. All existing DB error surface stays in
`use-coffee.ts` / `db.ts`, unchanged.

Division-by-zero and empty-array cases are handled by returning `null`, which the view renders as
"—". This is deliberate over returning `0`: a zero cost-per-capsule is a lie, a dash is honest.

## Testing

`stats.test.ts`, Vitest, plain `Movement[]` fixtures — no OPFS, no React, no mocks. This is the
payoff of keeping `stats.ts` pure.

Cases that must be covered because they're where the logic actually breaks:

- `costPerCapsule` weights by quantity — a fixture with one cheap 50-capsule order and one
  expensive 1-capsule order must not return the unweighted mean.
- `daysOfStockLeft` returns `null` at zero burn rate rather than `Infinity`.
- `dailyCups` emits zero-cup days inside gaps and returns exactly `days` entries.
- `timeOfDay` bucket boundaries (00:00, 06:00, 12:00, 18:00) land in the expected bucket.
- `monthComparison` with no previous-month data returns `prevCups: 0` and the view's
  no-percentage path is exercised.
- Every function on `[]` returns the documented empty value.

Period boundaries are computed with local-timezone `Date` arithmetic via `datetime.ts` (never
string slicing), per the house date rules — tests construct fixture timestamps the same way.

## House rules honoured

- No `any`, no `as`, no `!`, no `@ts-*`. `type` over `interface`. `for..of` over `forEach`.
- Money is integer satang end to end; formatting only at the view boundary via `formatSatang`.
- Figures use `.tnum`, one typeface, no monospace.
- Colours come from the existing `@theme` tokens — no new tokens; a reskin still flows through
  `--color-accent`.

## Deliberate simplifications

- CSS bars instead of a chart library. Upgrade path: if a tooltip/zoom/multi-series need appears,
  reach for a library then — not before.
- Stats recompute on every render from the in-memory array. At single-user scale (thousands of
  rows at most) this is microseconds. If a profile ever says otherwise, wrap the call in `useMemo`.
- Fixed windows (14d burn, 30d chart, 30d time-of-day). No range picker.
