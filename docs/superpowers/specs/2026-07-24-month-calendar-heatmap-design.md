# Month calendar heatmap (replaces the weekday heatmap)

**Date:** 2026-07-24
**Status:** approved design, ready for planning
**Area:** `src/features/coffee` — Dashboard, block 3

## Problem

The dashboard's third block is a weekday × time-of-day heatmap (`WeekGrid`). It
doesn't answer a question the user actually asks. The user wants a **month
calendar heatmap** instead: which calendar days had coffee, and how much, laid
out as familiar month grids they can scroll through.

## Decision summary

| Decision | Choice | Why |
| --- | --- | --- |
| Replace or add | **Replace** `WeekGrid` | Keeps the dashboard at 3 blocks; the app's stated failure mode is too many equal rectangles. |
| Layout | **Vertical month stack** | Native page scroll on a tall phone; no horizontal drag; reads as a real calendar. |
| Depth | **All months with data** | From the current month back to the earliest logged cup, contiguous. No paging state; user has < 1 year of data so a height cap is YAGNI. |
| Shade scale | **One global scale** across all months | A dark cell must mean the same cup-count in every month, matching the app's "a mark's intensity means one thing" rule. |
| Per-day numbers | **sr-only only**, no tap-to-reveal | Grid is for pattern-spotting; exact counts live in the screen-reader layer — same contract as the current heatmap. |

## Non-goals

- No year/month paging controls (◀ ▶). The stack is contiguous and scrolls with
  the page.
- No horizontal-scroll GitHub-strip layout.
- No tap/hover tooltip revealing a day's count.
- No height cap / windowing. Revisit only when a real user has enough history
  that the scroll is a problem.

## Data — `stats.ts`

Add one pure function; remove `weekGrid` and its `WeekGrid` type.

```ts
export type MonthGrid = {
  at: number;        // local midnight on the 1st of the month
  days: number[];    // cups per day-of-month, 1-indexed (days[1] = the 1st)
};
export type MonthGrids = {
  months: MonthGrid[]; // newest month first
  max: number;         // largest single-day cup count across ALL months, floored at 1
};

export function monthGrids(rows: Pick<Movement, 'delta' | 'at'>[]): MonthGrids;
```

Rules:

- **Consumption only** (`delta < 0`), summed per **local calendar day** (reuse
  `dayKey` / the local-day helpers in `datetime.ts`, consistent with
  `dailyCups`).
- **Span:** contiguous months from the month of the **earliest logged cup**
  through the **current month**, inclusive. No month is skipped — a month with
  zero cups is present as an all-outline grid, so the timeline never silently
  compresses (same principle as `dailyCups` keeping zero-cup days).
- **`max`** is the largest single-day total across every month, floored at 1 so
  a caller scaling by it never divides by zero.
- **No consumption at all** (empty log, or orders on file but zero cups ever) →
  `months: []`. The component renders the degraded one-line state, mirroring how
  the cost block degrades to "no orders logged yet".
- Reads the clock for "current month". Safe for the same reason the rest of the
  dashboard's clock-reading stats are: `movements` is `[]` on the server and on
  the client's first render (`use-coffee` loads in a mount effect), so both
  passes take `DashboardView`'s `movements.length === 0` early return and never
  reach this call. If that load timing ever changes, this is a hydration-mismatch
  site.
- Keep it `O(n + span)`: one pass to bucket consumption by day key and track the
  earliest day, then build the contiguous month list off that.

Purity contract unchanged for this module: plain rows in, numbers out; no React,
no DB, no async, no throws; testable with array literals.

## Component — `components/MonthCalendar.tsx` (replaces `WeekGrid.tsx`)

A vertical stack of month grids, newest first. Each month is a real `<table>`:

- **Monday-first**, 7 columns. Weekday header row shows initials (`M T W T F S S`,
  `aria-hidden`) with sr-only full day names, matching `WeekGrid`.
- Visible **month + year** label per grid (e.g. "July 2026"), via
  `Intl.DateTimeFormat`. sr-only `<caption>` names the grid for a screen reader.
- `table-fixed` so every column is equal width — width must not encode anything
  (same reasoning as `WeekGrid`'s comment: width reads as quantity).

Three distinct cell states:

1. **Day with cups** → filled swatch,
   `opacity = ACCENT_INK_FLOOR + (cups / max) * (1 - ACCENT_INK_FLOOR)`
   (import `ACCENT_INK_FLOOR` from `chart-ink.ts`). Every non-zero cell clears
   WCAG 1.4.11's 3:1 by construction. sr-only span carries the exact count.
2. **Day with 0 cups** → outline swatch using `--color-border-graphic` (the ramp
   rung that clears 3:1), the "positive empty" treatment from `WeekGrid`. sr-only
   count `0`.
3. **Not a day of this month** — leading blanks before the 1st, trailing blanks
   after the last day, and **future days in the current month** → blank spacer,
   `aria-hidden`, no outline, no sr-only count. A day that hasn't happened is not
   a skipped day.

Below the stack: one small `aria-hidden` legend, "less ▢▢▢■ more", anchoring the
global shade scale. `aria-hidden` because the counts are already in each cell's
sr-only span.

Accessibility contract identical to `WeekGrid`: colour carries the value
visually, but every cell's count is present as sr-only text with the swatch
`aria-hidden`, satisfying 1.1.1 and 1.3.1; the ramp floor satisfies 1.4.11.

## Wiring — `DashboardView.tsx`

- Replace `import { weekGrid } from '../stats'` usage with `monthGrids`.
- Replace `import { WeekGrid }` / `<WeekGrid grid={grid} />` with
  `<MonthCalendar data={...} />`.
- Keep the block-3 heading **"When you drink"** (still accurate — which days).
- The block renders the degraded one-line "no cups logged yet" state when
  `months` is empty. (The whole dashboard still early-returns on
  `movements.length === 0`; this covers the orders-but-no-cups case.)

## Files

| File | Change |
| --- | --- |
| `src/features/coffee/stats.ts` | Add `monthGrids` + types; **remove** `weekGrid` + `WeekGrid` type. |
| `src/features/coffee/stats.test.ts` | Remove `weekGrid` tests; add `monthGrids` tests. |
| `src/features/coffee/components/MonthCalendar.tsx` | **New.** The month stack. |
| `src/features/coffee/components/WeekGrid.tsx` | **Delete.** |
| `src/features/coffee/components/DashboardView.tsx` | Swap stat + component in block 3. |
| `src/features/coffee/dashboard-view.test.tsx` | Update block-3 assertions. |

## Testing

`monthGrids` (array-literal unit tests, the point of the pure module):

- Empty rows → `{ months: [], max: 1 }`.
- Orders only, zero cups → `{ months: [], max: 1 }`.
- Cups in one month → single month bucket, right day indices, `max` = busiest day.
- Cups spanning a month boundary → two contiguous buckets, newest first.
- A dormant middle month between two active months → present as an all-zero
  grid (contiguity, no skip).
- `max` is global: a heavy day in an old month sets the scale for a light recent
  month.
- Local-day bucketing: a cup near midnight lands on the correct local day (guard
  against a UTC off-by-one), consistent with existing `datetime` tests.

`MonthCalendar` / `dashboard-view` (component tests):

- Renders one table per returned month, newest first.
- Filled / outline / blank cell states appear for cups / zero-cup / non-day
  respectively; future days in the current month render blank, not outlined.
- sr-only counts present on real days; swatches `aria-hidden`.
- Degraded "no cups logged yet" line when `months` is empty.

## Quality gates

`npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
must all pass. House TypeScript bans apply (no `any`/`as`/`!`/`@ts-*`; `type`
over `interface`; `for..of`).
