# History: the log is the page — design

Follows `2026-07-21-history-redesign.md`, which rebuilt History's _behaviour_ — day-collapsed
drinks, filter-aware totals, paging, the live-region pattern. That work landed and holds. This
redesign fixes what it did not touch: the page's _composition_, and the fact that both of its
controls sit at the top of a list built to be thirty screens tall.

Measured before this change: **26/40** on the impeccable critique (up from 21), 1 P0, 3 P1.
Snapshot: `.impeccable/critique/2026-07-21T04-44-45Z__src-features-coffee-components-historyview-tsx.md`.

## Problem

Three problems: one structural, one editorial, one physical.

**Structural.** PRODUCT.md names the failure mode:

> **Undifferentiated card grids.** Equal-weight rounded rectangles stacked down the page are the
> failure mode this app is already closest to; every block must earn its visual weight.

History is that. `bg-[var(--color-surface)]` + `rounded-[var(--radius-md)]` appears on the three
stat tiles, the search container, the filter group, every `MovementRow`, and every `DrinkDayRow` —
roughly thirty-five identical rounded rectangles under a uniform `gap-5` that asserts readouts,
controls and records all rank the same. Home and Dashboard both got the un-carding pass and carry
comments explaining it (`HomeView.tsx:112`, `:265`; `DashboardView.tsx:32`). History never did. It
is the only view still in the anti-reference.

**Editorial.** The three stat tiles are a KPI row, which PRODUCT.md also bans ("no hero-metric
slab"). They violate Design Principle 2 by construction — "Capsules 597 / Spent ฿6,240 / Orders 9"
are values, not answers — and every question they raise is answered one tab away:

| Fact                  | Home              | Dashboard                 | History tiles |
| --------------------- | ----------------- | ------------------------- | ------------- |
| Capsules held / drunk | hero orb          | 30-day trend              | tile 1        |
| Spend                 | supporting figure | monthly bars, per-capsule | tile 2        |
| Order count           | —                 | implied by spend bars     | tile 3        |

Nothing in the triplet answers a question History is opened with. History is opened to find a day.

**Physical.** PRODUCT.md Principle 5: _"Reading material can live up top; tappable things cannot."_
The search field and the filter group are static content above a list that starts at thirty day
groups and grows by thirty per tap. One-handed on a 6.8" S24 Ultra both start in the far-reach zone
and are unreachable after the first swipe. The comment at `HistoryView.tsx:24-27` names "every
control stranded at the top" as the pathology paging was meant to cure — paging shortened the page
and left the controls exactly where they were.

## Decisions

**The log is the page.** History's first screenful is the log, not a summary of it. The three stat
tiles are deleted outright, not restyled.

**A fill means "record".** Inside History, `bg-[var(--color-surface)]` means _this is a logged
event_. Nothing else may carry it. The filter bar becomes a bare row of text buttons over the page
background, separated from the list by a hairline; day labels are unboxed text. This is the rule
that governs every visual decision below — when in doubt during implementation, apply it.

**Search is deleted.** `matchesSearch` excludes every drink by construction, so the field exists to
locate one of nine orders — which the Orders filter already reduces to a nine-row list. Deleting it
resolves four findings at once: the 4.36:1 placeholder, the absent clear button on Android, the
`drinks` + query state that can never return a row, and half of `emptyMessage`'s branching.

Both `matchesSearch` and `historyTotals` have exactly one caller each — this view. Deleting the
tiles and the field orphans both helpers and their unit tests entirely. This is a deletion, not a
move.

**The day label carries the structure.** With the tiles and the field gone, it is the only
organizing element left, and today it is the smallest and faintest text on the page. It goes to
`text-sm` in `--color-text`.

**The filter bar sticks.** It is the only control left, and it is now small enough to pin without
eating the viewport.

### Deviation: an explicit header height token

The filter bar must stick directly beneath a header whose height is currently _emergent_ — `py-3`
plus content, never declared. Anchoring to a hard-coded `56px` creates a silent drift mode: change
the header's padding and the bar detaches or overlaps, and no test fails.

Add `--header-h: 3.5rem` to `globals.css @theme`. `Header` declares it (`h-[var(--header-h)]` on the
inner row); the filter bar consumes it:

```
sticky top-[calc(env(safe-area-inset-top)+var(--header-h))] z-10
```

One source of truth. The alternative — hoisting the filter into `Coffee.tsx` beside `Header` — is
rejected: it couples the app shell to one view's internal state, against the feature-owns-its-UI
rule in CLAUDE.md.

## Structure

```
Header                        sticky top-0                    z-20
──────────────────────────────────────────────────────────────────
[ All ][ Drinks ][ Orders ]   sticky top-[hdr], hairline      z-10
──────────────────────────────────────────────────────────────────
Today                         text-sm / --color-text
  ┌ 6 capsules · 07:12 – 21:08                        bg-surface
  ┌ Shopee   +50   ฿1,240                             bg-surface
Yesterday
  ┌ 5 capsules · 07:04 – 19:55                        bg-surface
  …
[ Show older (97 more days) ]
```

**Rhythm.** The uniform `gap-5` breaks: `gap-2` between rows inside a day (unchanged), `gap-6`
between day groups, and the sticky bar divided from the list by its hairline rather than by a gap.

## Behaviour

**Filter change resets the window and the scroll.** The reset already exists
(`HistoryView.tsx:48-50`) and is correct — it is the bug most implementations ship. What it never
did was move the viewport, so switching filters while scrolled deep strands the user at the bottom
of a suddenly-shorter list, nowhere near the control they just pressed. It gains
`window.scrollTo({ top: 0 })`. Deps drop from `[filter, query]` to `[filter]`.

Firing on mount is intentional and harmless: the view is already at the top, and a tab switch away
and back should land at the top regardless.

## Accessibility

Bundled into this change because each is a confirmed defect, not a nice-to-have:

| Fix                                                                                         | Location                   | Evidence                                                                                          |
| ------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `role="group"` + `aria-pressed` → `radiogroup` + `role="radio" aria-checked`, arrow-key nav | `FilterTab` and wrapper    | selection never announces exclusivity or position                                                 |
| Selection adds `font-semibold`; accent alone stops being the signal                         | `FilterTab`                | PRODUCT.md: "Status is never encoded in color alone"                                              |
| Order subtitle `--color-faint` → `--color-muted`                                            | `MovementRow.tsx:38`       | 4.36:1 → 6.92:1; AA body needs 4.5                                                                |
| Delete-confirm ink: add `--color-on-danger: #180806`, replacing `text-white`                | `MovementRow.tsx:101`      | white on `--color-danger` = 3.33:1; the new pair measures 5.85:1                                  |
| `gap-1` between clock and trash                                                             | `MovementRow.tsx:107`      | two 44px targets, one destructive, sharing a 0px boundary in the thumb arc                        |
| `aria-controls` linking disclosure to its `<ul>`                                            | `DrinkDayRow`              | —                                                                                                 |
| Polite announcement: "30 more days shown"                                                   | `HistoryView` "Show older" | thirty groups appear silently, before the button in DOM order                                     |
| `!ready` keeps heading + filter mounted; list region reads "Loading your history…"          | `HistoryView.tsx:61`       | blanking the tab while `Header` prints "0 capsules" reproduces the lie `HomeView.tsx:51-53` fixes |
| Empty state keeps the `sr-only h2` and becomes a button that adds the first order           | `HistoryView.tsx:63-69`    | matches `HomeView.tsx:311`; today heading nav lands nowhere                                       |

The contrast figures are recomputed and settled: `--color-faint` on `--color-surface` is **4.36:1**,
confirming the assertion already written at `HomeView.tsx:283` and correcting a looser estimate. The
same token on `--color-bg` is 4.68:1, so day labels were never affected.

The delete fix deliberately changes the _ink_, not `--color-danger` itself. The token is also the
trash icon's hover colour (`MovementRow.tsx:123`), where it sits on `--color-surface` at 5.29:1 and
is already correct; darkening the token to rescue the button would degrade the hover state to fix a
problem it does not have. A new `--color-on-danger` mirrors the existing `--color-on-accent`
pattern — dark ink on a warm fill — and keeps the change local to the one element that fails.

## Testing

`history-view.test.tsx` covers collapse, paging, the pagination reset and the filter-aware tiles.
The tile assertions are deleted with the tiles; the rest survive unchanged. `coffee.test.ts` loses
its `matchesSearch` and `historyTotals` blocks.

New coverage:

- scroll-to-top fires on filter change (assert on a stubbed `window.scrollTo`)
- the filter exposes radiogroup semantics and reflects `aria-checked`
- the not-ready state renders the loading line rather than nothing
- the empty state renders a button that opens the add-order sheet

## Out of scope

Date jump, month anchors, undo-after-delete, and consolidating the five duplicated
`Intl.NumberFormat('en-US')` instances (`HistoryView:21`, `MovementRow:9`, `HomeView:10`,
`DashboardView:18`, `Header:3`) into `src/shared/`. The last is real debt and worth its own commit —
today all five are identical, which is exactly when consolidating is cheap. It is not this change.
