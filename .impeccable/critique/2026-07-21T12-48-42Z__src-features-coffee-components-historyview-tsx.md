---
target: History tab (HistoryView.tsx + MovementRow.tsx)
total_score: 23
p0_count: 1
p1_count: 2
timestamp: 2026-07-21T12-48-42Z
slug: src-features-coffee-components-historyview-tsx
---
# Critique — History tab (HistoryView.tsx + MovementRow.tsx)

Third run on this target. Measured against the current tree, after the search field and the
three-tile KPI row were deleted ("make the log the page"). Real device: 606 movements, 127 days,
9 orders.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Loading frame, early-mounted `role="status"`, `aria-expanded`, paging announcement all correct. Sighted users never see *position*: "Showing 60 of 127 days" exists only in the sr-only region (`:199-201`); the visible button shows a remainder. |
| 2 | Match System / Real World | 3 | "Today / Yesterday", "6 capsules · 07:12 – 21:08". Loses one for **"Drinks"** (`:29`) — the app's only use of that noun; `HomeView.tsx:273-275` forbids a second word for the same unit. |
| 3 | User Control and Freedom | 2 | Confirm but no undo. The armed confirm never disarms — not on scroll, blur, filter change, or collapse. Tab switch destroys expansions, page depth, scroll (`Coffee.tsx:31` `key={tab}`). |
| 4 | Consistency and Standards | 2 | Contradicts the un-carding both siblings underwent. Filter-empty state is a dead `<p>` (`:162`) where Home offers a button — `onAdd` already in props at `:34`. |
| 5 | Error Prevention | 2 | Inline two-step confirm is a real safeguard, but the affirmative sits under the finger that opened it (P0). |
| 6 | Recognition Rather Than Recall | 2 | 127 groups, no month landmarks, no date jump. Expanded days are rows that all read "Drank a coffee", identified only by `HH:mm`. |
| 7 | Flexibility and Efficiency | 2 | Arrow-key filter nav is a genuine accelerator. But March is 4 taps away, and at 606:9 the **Drinks** filter removes nine rows from six hundred. |
| 8 | Aesthetic and Minimalist Design | 2 | Nothing decorative; minimal ≠ ranked. The day heading (`:170`, 14px semibold) is quieter than the row it heads (`:296`, 16px semibold). |
| 9 | Error Recovery | 2 | `onDelete?.(movement.id)` (`MovementRow.tsx:100`) drops the promise. `HomeView.tsx:176` catches exactly this class. History's delete fails silently. |
| 10 | Help and Documentation | 3 | Correctly zero help UI. Loses one for the dead-end empty state. |
| **Total** | | **23/40** | **Acceptable — the invisible half is excellent, the visible half is unfinished** |

Trend note (21 → 26 → 23): each run was assessed blind by a different reviewer. This run found two
things prior runs missed entirely (delete geometry, focus-obscured conformance failure) while the
previous run's whole P0/P1 backlog — stranded controls, KPI triplet, both AA contrast failures — is
genuinely gone. Scores across blind runs are not a time series; the findings are.

## Anti-Patterns Verdict

**Deterministic scan**: `detect.mjs --json` over HistoryView + MovementRow → 0 findings, exit 0.
Over all of `components/` → 0 findings, exit 0. No false positives. Browser overlays: not attempted
(component-level source critique, no dev server running).

**LLM assessment: not slop — under-designed.**

The code would survive any review: live region mounted above the branch switch (`:106-115`),
conditional `aria-controls` avoiding 59 dangling IDREFs (`:290-293`), roving tabindex with wrap
(`:46-61`).

The page is the app's closest approach to its own named anti-reference. At real scale: **two type
ranks, one shape** — ~30 identical `bg-surface` + `radius-md` rectangles at one width. The order row
is taller only as an accident of the 44px icon targets.

The fill doing all the "this is a record" work measures **1.06:1** (`#16181d` on `#101114`,
recomputed independently). The comment at `:283-286` argues the fill must sit on the row so each cup
reads as its own record — sound reasoning, but at a 6% luminance step the fill isn't perceptible
enough to make it true. The page pays a card grid's cost without collecting the benefit.

Root defect: the un-carding pass produced **three different answers in three views** —
hairline-divided block (`HomeView.tsx:263-270`), unboxed hero (`DashboardView.tsx:30-34`), filled
pills (History). Two cite the same PRODUCT.md line as justification. Nothing is written down.

## Measured evidence

Contrast (WCAG 2.x, computed from `globals.css` tokens):

| Pair | Ratio | Verdict |
|---|---|---|
| `--color-surface` on `--color-bg` | **1.06:1** | non-signal — the row fill carries no perceptible boundary |
| `--color-text` on `--color-surface` | 15.18:1 | PASS |
| `--color-muted` on `--color-surface` | 6.92:1 | PASS |
| `--color-muted` on `--color-bg` | 7.36:1 | PASS |
| `--color-accent` on `--color-bg` (active filter) | 6.44:1 | PASS |
| `--color-accent` on `--color-surface` (order delta) | 6.06:1 | PASS |
| `--color-on-danger` on `--color-danger` (Delete) | 5.87:1 | PASS — prior run's 3.33:1 failure is fixed |
| `--color-faint` on `--color-surface` (icons only) | 4.40:1 | PASS at the 3:1 UI bar |
| `--color-border-strong` on `--color-bg` | 1.77:1 | under 3:1 — framing only, documented as intentional |

All prior-run AA text failures are resolved. Touch targets: 100% clear 44×44 via the `globals.css`
rule; MovementRow's two icon buttons sit exactly at the floor.

ARIA in HistoryView is structurally valid throughout: `role="status"`, `role="radiogroup"` +
`aria-label`, `role="radio"` + `aria-checked` on every instance, `aria-expanded`, and
`aria-controls` set only while its target is mounted — no dangling IDREF in any state.

`scroll-padding` / `scroll-margin` / `scroll-mt`: **zero occurrences in `src/`** (verified).

## Overall Impression

The invisible half of this page — status, ARIA semantics, correctness under real data — is better
than most shipped products. The visible half — hierarchy, error prevention, orientation — was never
finished. The single biggest opportunity is not features: it is deciding, once and in writing, what
a filled rectangle means in this app, and then spending the reclaimed weight on the day heading and
on orders.

## What's Working

**1. The collapse is an information-theory fix, not a layout trick.** `db.ts:145-182` + `:261-303`.
597 of 606 movements carry one bit each; the summary carries count and span in one line and loses no
control. `db.ts:155-156` places the drinks entry at the day's *newest* drink, so an order logged
mid-afternoon doesn't split the day's drinking into two piles.

**2. Live-region mounting discipline, applied as a rule across two files.** `:106-115` mounts
`role="status"` above the `!ready` branch because a region created together with its text is never
announced. `:97-98` derives `statusText` so a stale `pageMessage` can't leak into the loading frame.
`MovementRow.tsx:82-88` mirrors it.

**3. The filter encodes selection twice, and the numbers justify it.** Active accent 6.44:1;
inactive muted 7.36:1 — the inactive state is the *higher*-luminance one, so hue alone would have
left the selection looking dimmer than its siblings. `font-semibold` carries it independently.

## Priority Issues

### [P0] The delete confirmation's affirmative button lands on the trash icon's coordinates, and never disarms
- **What**: both groups right-aligned in the same flex row. Trigger (`MovementRow.tsx:107-127`):
  `gap-1`, two `size-11` buttons — Trash is rightmost, 44px. Confirm (`:89-105`): `gap-1.5`, Cancel
  then Delete — **Delete is rightmost**, ~62px wide, 44px tall. Delete covers the pixels Trash
  vacated. `confirming` is cleared by nothing but an explicit Cancel.
- **Why it matters**: PRODUCT.md:9-11 — one-handed, mid-brew. `HomeView.tsx:298-301` calls a careless
  double-tap "the app's most likely error". A confirm whose Yes sits under the finger that opened it
  is a 300ms delay. This is the only unrecoverable action in the product.
- **Fix**: swap the order — Cancel on the right, Delete on the left. Clear `confirming` on blur or
  via a cleanup keyed to `movement.id`.
- **Suggested command**: `/impeccable harden`

### [P1] Keyboard focus is obscured by the sticky filter bar — WCAG 2.2 SC 2.4.11
- **What**: filter bar is `sticky`, opaque, `z-10` (`:146`); Header above it at higher z. No
  `scroll-padding` anywhere in `src/`. Tabbing through 30 day-groups scrolls each newly-focused
  element under both bars; the `:focus-visible` outline paints underneath.
- **Why it matters**: PRODUCT.md:72 commits to WCAG 2.2 AA and 2.4.11 is a 2.2 addition. Conformance,
  not judgement.
- **Fix**: `html { scroll-padding-top: calc(env(safe-area-inset-top) + var(--header-h) + 3rem); }`
  plus `scroll-padding-bottom` for the fixed BottomNav.
- **Suggested command**: `/impeccable audit`

### [P1] The page is the card grid PRODUCT.md names, on a fill measuring 1.06:1
- **What**: ~30 identical filled rounded rectangles per page, one width, two type ranks, section
  heading quieter than its own content (`:170` vs `:296`).
- **Why it matters**: PRODUCT.md:53-54 by name, plus Design Principle 2. Breaks consistency with both
  siblings, which carry comments rejecting this exact treatment.
- **Fix**: drop the row fill, separate records with `border-b border-[var(--color-border)]`, spend
  the reclaimed weight on the day heading (a per-day total makes it answer rather than label) and on
  orders. Deletes code; aligns three views on one rule.
- **Suggested command**: `/impeccable layout`

### [P2] At real scale the 9 orders are invisible
- **What**: 9 of 606 movements are orders, in the same shell as 118 drink-days, distinguished by an
  accent `+40` on the right edge (`MovementRow.tsx:67-78`).
- **Why it matters**: PRODUCT.md:16-19's "occasionally, deliberately" half *is* orders. Drinks are
  already served by Home and Dashboard. The reason to open History is the 9 rows that look like
  everything else. The Orders filter's existence is the admission.
- **Fix**: different shape, not louder colour — keep orders filled after drink rows go to hairlines
  under P1, which separates the classes structurally for free.
- **Suggested command**: `/impeccable layout`

### [P2] Delete can fail silently, against the app's own established precedent
- **What**: `MovementRow.tsx:100` drops the promise. `use-coffee.ts:80-86` shows `removeMovement` is
  async with no internal catch, writing to OPFS.
- **Why it matters**: `HomeView.tsx:49`/`:176` establish the rule — "A rejected write must not look
  like a successful one." MovementRow is shared, so the gap is on Home's delete too: one fix at the
  shared call site, not per-caller.
- **Fix**: `onDelete?.(movement.id)?.catch(…)`, message carried by the sr-only region already mounted
  at `:86`. Widens `onDelete` to `(id: string) => void | Promise<void>`.
- **Suggested command**: `/impeccable harden`

## Persona Red Flags

**Casey (one-handed, mid-brew)**: taps trash, glances at the machine, taps the same spot to finish —
Delete is there, no undo. Expands a day, scrolls back, cannot tell which day is open without finding
an 18px `--color-faint` chevron rotation, because the fill is 1.06:1. (The sticky filter is a clear
improvement over static-top and this app puts its taps in the BottomNav — noted, not P-level.)

**Sam (screen reader / keyboard / low vision)**: SC 2.4.11 at every tab stop. TalkBack's controls
list yields ~30 buttons named "3 capsules 07:00 – 21:00" with no date — the `<h3>` supplies it in
reading order only; the day `<div>` (`:169`) is not a `<section aria-labelledby>`. After deleting the
last cup in an expanded day, focus falls to `<body>`.

**Riley (stress tester)**: arms a confirm, scrolls away, returns — still armed. Changes filter with
three days expanded — `daysShown` and scroll reset, but each `DrinkDayRow`'s local `open` survives
under a stable key, inconsistent with the reset beside it. Switches tabs — everything is lost
instead, opposite behaviour from the same class of navigation. Deletes the only order while on
Orders — dead-end `<p>`.

## Minor Observations

- `:29` "Drinks" is the app's only use of that noun — "Capsules" everywhere else.
- `:203` "Show older" has `px-4` but no `py`; its 44px height is inherited, not intended. Its border
  is 1.77:1 — the button is carried entirely by its text.
- `MovementRow.tsx:113,123` — `--color-faint` on surface = 4.40:1. Icons, so the 3:1 bar applies and
  they pass. Flagged so it is not "fixed" by mistake.
- 127 groups with no month markers; one branch in `formatDayLabel` would give a 15-screen scroll its
  only landmark.
- `:199-201` state overshoots (`d + DAYS_PER_PAGE` vs the clamped `added`) but `slice` absorbs it.

## Questions to Consider

1. What job is History actually left with? Home fixes today's mis-tap in two taps; Dashboard answers
   cost and pace. The residue is: correct an old record, inspect 9 orders. If that is the job, why is
   the default filter "All"?
2. If 597 of 606 movements are byte-identical apart from a timestamp, is this a log or a daily count?
   `WeekGrid` already renders this shape of data as a calendar.
3. Nobody reaches day 127. Is "Show older" honest pagination, or an admission that the bottom is
   unreachable? What if History covered 60 days and the rest was served by the backup file?
4. Three views, three un-carding answers, two citing the same line. Which is the rule, and what stops
   the fourth view inventing a fourth answer?
