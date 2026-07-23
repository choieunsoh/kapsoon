# Dashboard average line — design

Date: 2026-07-19

## Goal

Give the "Last 30 days" chart a reference mark. Thirty bars show the shape of a habit but not its
level: without a baseline you cannot tell whether today is a heavy day or an ordinary one. A
horizontal rule at the mean, labelled, answers that at a glance.

## Scope

**In:** one pure `averageCups` derivation, a positioned rule and label inside the existing `Chart`
component, one unit test.

**Out:** a median or trend line, a toggle to hide the line, animation, comparing windows, any change
to the other four dashboard cards, and any chart library.

## Which average

The mean of all 30 days in the series — `total cups ÷ 30` — counting days with no coffee in the
denominator.

This is deliberately **not** the mean of only the days coffee was drunk. A line drawn across 30 bars
should be the mean of those 30 bars, or it misdescribes its own chart: excluding zero days would sit
the line above most of the bars it crosses and read as misplaced.

### The number that already exists, and why it differs

The Stock runway card displays "at ~N capsules a day", which is `daysOfStockLeft`'s **14-day** mean
(`stats.ts:21`). The dashboard will therefore show two daily averages with different values.

This is accepted, not overlooked. They answer different questions: the runway figure projects when
stock runs out and belongs to that card's forecast; the chart line describes the 30 bars beneath it.
Each is scoped inside its own card, and the chart line is visually bound to the series it summarises.

The rejected alternative was reusing the 14-day figure for the chart. It would give the dashboard one
number with one meaning, but it would draw a line describing 14 days across a chart showing 30 — a
consistency that is quietly wrong is worse than an honest difference.

## Architecture

### Where the number is computed

`averageCups(series: CupDay[]): number` joins the other pure derivations in `stats.ts`.

It is not computed inline in the component, even though it is a one-liner. `DashboardView`'s own
header comment establishes the invariant: _"Every figure comes from the pure stats module — this file
only formats and lays out"_ (`DashboardView.tsx:22-24`). A mean computed in `Chart` would contradict
a rule the file states three lines above the code that broke it.

It takes the `CupDay[]` that `dailyCups` already returns rather than raw movements, so it adds no
second pass over the data and stays independent of how the series was built.

### Rendering

`Chart` renders a flex `<ul>` of bars at a fixed `h-24`. The list is wrapped in a `relative`
container; the rule is an absolutely positioned 1px element at `bottom: (avg / max) * 100%`, scaled
against the same `max` the bars already use so the line lands where the eye expects it.

The label sits at the right end of the rule, just above it, reading `avg 2.4` — one decimal, via the
`oneDecimal` formatter already defined in `DashboardView.tsx:15`, and carrying the `.tnum` class like
every other figure in the app.

### Colour

The rule and its label use `--color-muted`, **not** `--color-accent`. The accent is the bars' colour;
an accent-coloured line would read as another bar rather than as a reference mark against them.

## Accessibility

The label is real text, not `aria-hidden`, so the average is announced rather than being purely
visual. The rule itself carries no separate ARIA node — it is the visual presentation of the number
the label states. The existing per-bar `aria-label`s are untouched.

## Edge cases

- **All-zero series** — `max` already falls back to 1 (`DashboardView.tsx:137`) and the mean is 0, so
  the line sits flat on the baseline. No division by zero.
- **Line escaping the chart** — impossible: a mean can never exceed the maximum it is drawn against,
  so `(avg / max) * 100` is bounded by 100.
- **Empty dashboard** — the early return at `DashboardView.tsx:29` means `Chart` never receives an
  empty series.
- **Bar/line scale mismatch** — bars carry a `Math.max(..., 2)` minimum-height floor so a zero day
  stays visible; the line has no floor. On a near-empty chart the line can therefore sit slightly
  below the tops of the 2% baseline ticks. Correct, and preferable to flooring the line, which would
  misreport the average.

## Files

| File                                               | Change                             |
| -------------------------------------------------- | ---------------------------------- |
| `src/features/coffee/stats.ts`                     | add `averageCups`                  |
| `src/features/coffee/components/DashboardView.tsx` | `Chart` renders the rule and label |
| `src/features/coffee/stats.test.ts`                | unit test for `averageCups`        |

## Testing

One test in the existing `stats.test.ts`:

1. A known series including zero days — asserts the zero days count in the denominator.
2. An all-zero series — asserts 0 rather than `NaN`.

The rendering is markup with no branching, covered by `typecheck` + `lint` + `build`.

## Quality gates

`npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
