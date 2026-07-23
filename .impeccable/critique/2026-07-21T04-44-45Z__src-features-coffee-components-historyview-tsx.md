---
target: History tab (HistoryView.tsx + MovementRow.tsx)
total_score: 26
p0_count: 1
p1_count: 3
timestamp: 2026-07-21T04-44-45Z
slug: src-features-coffee-components-historyview-tsx
---
# Critique — History tab (HistoryView.tsx + MovementRow.tsx)

Second run on this target. Measured against the current tree (post the seven `feat/fix/test(history)` commits),
real device data: 606 movements, 127 days, 9 orders.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Totals track the visible set live. But `!ready` blanks the tab while Header prints "0 capsules"; the stat triplet swaps question with no announcement; no "showing 30 of 127 days" |
| 2 | Match System / Real World | 4 | Day labels, `07:12 – 21:08`, ฿ via Intl, singular/plural, single-cup degenerate case. Best line on the page |
| 3 | User Control and Freedom | 3 | Two-step delete, cancellable dialogs, paging reset on filter change. No undo on a 606-row ledger; search can't be cleared one-handed |
| 4 | Consistency and Standards | 2 | Contradicts the deliberate un-carding of Home and Dashboard; segmented control is `role="group"`+`aria-pressed`, so exclusivity is never announced |
| 5 | Error Prevention | 2 | UI permits `filter='drinks'` + query — a provably empty state; destructive delete with no undo; clock/trash targets share a 0px boundary |
| 6 | Recognition Rather Than Recall | 2 | Filter and search scroll out of view on a page built to be 30+ screens tall; tile slot 1 means "Capsules" or "Orders" depending on invisible state |
| 7 | Flexibility and Efficiency | 2 | No date jump, no month anchors, no scroll-to-top. Day 120 of 127 is 4 taps and ~40 screens of swiping |
| 8 | Aesthetic and Minimalist Design | 2 | ~35 equal-weight cards; a banned KPI triplet; the only organizing element (day header) is the smallest, faintest text on screen |
| 9 | Error Recovery | 3 | `emptyMessage` computed once so visible and announced copy cannot drift — correct and rare. Offers no recovery action |
| 10 | Help and Documentation | 3 | Single-user app; copy carries the load. Chevron is sufficient signposting |
| **Total** | | **26/40** | **Acceptable — up from 21, real gains, one structural problem left** |

## Anti-Patterns Verdict

**LLM assessment: partial slop — the thinking is not slop, the composition is.**

What earns trust: "Today / Yesterday"; "6 capsules · 07:12 – 21:08"; "Search only matches orders — a drink
has no text to match." No app in the slop genus writes that empty-state line.

What breaks it: scroll the page and count visual weights. There is **one**. `bg-surface` + `radius-md`
appears on the three Stat tiles (`HistoryView.tsx:308`), the search container (`:133`), the filter group
(`:149`), every `MovementRow` (`MovementRow.tsx:44`), and every `DrinkDayRow` (`:273`) — roughly 35 identical
rounded rectangles down the page, separated by a uniform `gap-5` (`:85`) that asserts stats, controls and
records are all the same rank.

Against the project's own anti-reference — *"Undifferentiated card grids. Equal-weight rounded rectangles
stacked down the page are the failure mode this app is already closest to"* — the honest answer is **yes, this
page is that**, and it is the only one of the three views that still is. `HomeView.tsx:112` and `:265` and
`DashboardView.tsx:32` all carry comments diagnosing and fixing exactly this. History never got the pass.

Second tell: the `grid grid-cols-3` at `:101` is a KPI row, which PRODUCT.md bans ("no hero-metric slab").
It also violates Design Principle 2 by construction — "Capsules 597 / Spent ฿6,240 / Orders 9" are values,
not answers to a question History is opened with.

**Deterministic scan**: `detect.mjs --json` over HistoryView + MovementRow → **0 findings, exit 0**. Over all
15 files in `components/` → **0 findings, exit 0**. No false positives to triage. The slop here is
compositional, which is exactly the class a pattern detector cannot see.

**Visual overlays**: not attempted — component-level source critique, no dev server started.

## Measured evidence

Contrast (WCAG 2.x, recomputed and confirmed independently):

| Pair | Ratio | Verdict |
|---|---|---|
| `--color-faint` #7a7e8f on `--color-surface` #16181d | **4.36:1** | **FAILS AA body (4.5)**, passes UI 3:1 |
| `--color-faint` on `--color-bg` #101114 | 4.68:1 | PASS |
| white on `--color-danger` #e5645d @ `text-sm` | **3.33:1** | **FAILS AA body** |
| `--color-muted` on `--color-surface` | 6.92:1 | PASS |
| `--color-accent` on `--color-surface-2` | 5.50:1 | PASS |
| `--color-text` on `--color-surface` | 15.18:1 | PASS |
| `--color-surface-2` on `--color-surface` | 1.10:1 | non-signal (matches the in-code comment) |

The 4.36 lands on `HistoryView.tsx:141` (search placeholder, `text-sm`) and `MovementRow.tsx:38` (order
subtitle, `text-xs`). The same token pair on non-text glyphs (`:134`, `:285`, `MovementRow:113/123`) clears the
3:1 UI bar and is fine. `HomeView.tsx:283` already asserts this pair is "just under AA" — that comment is
correct and this file contradicts it.

Touch targets: **100% clear 44×44** via the `globals.css` rule. Two spacing facts: `MovementRow.tsx:107` puts
the clock and trash buttons in a `flex` with **no gap** — two 44px targets, one destructive, sharing a 0px
boundary; the confirm pair at `:90` uses `gap-1.5` (6px).

Color-alone: exactly one true instance — `FilterTab` selection (`:329-336`), differentiated only by text
color plus a 1.10:1 fill. `aria-pressed` covers assistive tech; sighted users get color only.

## Overall Impression

This reads as a good product whose third screen ran out of design budget. Every hard problem is solved — the
drink-day collapse, filter-aware totals, the live-region pattern, the paging reset — and then all of it is
rendered in one undifferentiated stack of cards with both controls stranded at the top of a 30-screen page.
The single biggest opportunity is not new features; it is spending the un-carding pass that Home and Dashboard
already got, and making the controls reachable.

## What's Working

**1. The drink-day collapse (`:250-303` + `buildDayEntries`).** Takes the worst data shape in the app — 597
byte-identical rows — and replaces it with the sentence the log is actually opened with, collapsing *display*
without collapsing *control*: every cup keeps edit and delete one tap away. Gets the degenerate case right
(`:267` — one cup shows a time, not `07:12 – 07:12`).

**2. Totals bound to the visible set, triplet swapping with the filter (`:44`, `:101-128`).** The default
implementation shows all-time totals above a filtered list — a control that visibly does nothing. This
computes over `visible`, then goes further so each mode answers its own question. The reasoning is right even
where the execution undercuts it.

**3. The status region mounted from first render with `emptyMessage` computed once (`:75-95`).** Closes two
real bug classes at once — a live region inserted already-populated is never announced, and visible copy
drifting from announced copy. Solved identically in `MovementRow.tsx:86`. That's a pattern, not a one-off.

## Priority Issues

### [P0] Both controls sit atop a page built to be 30+ screens tall, and neither sticks
- **What**: search (`:133`) and filter (`:146`) are static content at the top of a list that starts at 30 day-groups and grows by 30 per tap.
- **Why it matters**: PRODUCT.md Principle 5 is unambiguous — *"Reading material can live up top; tappable things cannot."* This is the most literal violation of it in the app. One-handed on a 6.8" S24 Ultra, both controls start in the far-reach zone and are unreachable after the first swipe. The comment at `:24-27` names "every control stranded at the top" as the pathology paging was meant to fix — paging shortened the page but left the controls exactly where they were. Compounding it, the paging reset at `:48-50` changes list height under a user scrolled deep, with no scroll correction.
- **Fix**: make the filter row sticky beneath the sticky Header (`sticky top-[calc(env(safe-area-inset-top)+56px)] z-10`, `--color-bg` backing to match Header). Fold search into that bar. Add a scroll-to-top to the reset effect so a filter change lands on the result it produced.
- **Suggested command**: `/impeccable adapt`

### [P1] The page is the anti-reference; the fix is already written in HomeView
- **What**: identical `bg-surface` + `radius-md` on Stat (`:308`), search (`:133`), filter (`:149`) and every row; uniform `gap-5` (`:85`).
- **Why it matters**: every filled rounded rectangle currently means nothing, so the ones that *are* records carry no more weight than a text field. This is the one screen in Kapsoon that reads as generated.
- **Fix**: borrow `HomeView.tsx:271-290` in spirit. Strip fills from the three tiles → one unboxed or hairline-split block. Strip the fill from search (bottom hairline only) and from the filter group (bare row). Reserve `bg-surface` for data rows exclusively, so a filled rectangle means *this is a record*. Break the uniform gap: tighter between controls, wider before the list.
- **Suggested command**: `/impeccable layout`

### [P1] Money in a 3-column grid overflows at today's real data
- **What**: `Stat` (`:306-312`) has no truncate, nowrap, or min-width guard inside `grid-cols-3 gap-3` on a 360px column — ~77px per tile after `p-3`, against "฿6,240.00" at ~85px in `text-lg font-semibold`.
- **Why it matters**: it breaks at the user's *current* ledger, not hypothetically, and worsens with every order. `HomeView.tsx:265-268` documents this exact failure ("a currency string needs ~90px at 360px wide and a three-way split leaves it 80px") and moved money to its own row. History repeats the mistake three lines below a comment explaining it.
- **Fix**: two-up for counts, money on its own full-width row — falls out for free from the un-carding above.
- **Suggested command**: `/impeccable layout`

### [P1] Two confirmed AA contrast failures
- **What**: `--color-faint` on `--color-surface` = **4.36:1** at `HistoryView.tsx:141` (placeholder) and `MovementRow.tsx:38` (order subtitle). White on `--color-danger` = **3.33:1** at `text-sm` (`MovementRow.tsx:101`).
- **Why it matters**: PRODUCT.md targets WCAG 2.2 AA and names body text ≥4.5:1 explicitly. The placeholder is the search field's only visible label. The Delete button is the confirm step of the only irreversible action in the app.
- **Fix**: placeholder and subtitle → `--color-muted` (6.92:1). Delete button → darken `--color-danger` or use `--color-text` on it; verify ≥4.5:1 at 14px.
- **Suggested command**: `/impeccable audit`

### [P2] Filter selection is color-alone, and announces as three unrelated toggles
- **What**: `:329-336` — active = accent text on a fill measuring 1.10:1. The comment concedes the riser "carries none of the signal on its own."
- **Why it matters**: PRODUCT.md — *"Status is never encoded in color alone."* Selection is status. Separately, Principle 4 makes the accent a scarce resource; it now means "reorder now" (HomeView:130), "+50 capsules" (MovementRow:69), and "you tapped All".
- **Fix**: add `font-semibold` when active, or an accent underline. Swap `role="group"`/`aria-pressed` for `role="radiogroup"` + `role="radio" aria-checked` so exclusivity, position, and arrow keys all work.
- **Suggested command**: `/impeccable polish`

### [P2] Search: unclearable, dead-endable, and mis-commented
- **What**: `matchesSearch` excludes every drink on any non-empty query, so a search silently drops 98% of the ledger with no statement of it — the "Search orders" placeholder, the only cue, disappears the moment you type. Drinks stays tappable while a query is live, producing a state that can never return a row. The comment at `:132` claims `type="search"` gives Android a clear button; it does not — `::-webkit-search-cancel-button` is desktop Chrome only.
- **Fix**: render an ✕ inside the field when the query is non-empty; disable Drinks while a query is live with a one-line note; correct the comment.
- **Suggested command**: `/impeccable clarify`

### [P2] Adjacent benign and destructive targets with zero separation
- **What**: `MovementRow.tsx:107` — clock and trash, both `size-11`, `flex items-center`, no gap, at the right edge of every row, directly in the thumb arc.
- **Fix**: `gap-1` minimum.
- **Suggested command**: `/impeccable adapt`

### [P3] `!ready` blanks the tab while the header lies
- **What**: `:61` renders nothing for the OPFS beat while Header prints "0 capsules". `HomeView.tsx:51-53` spends real effort on this exact frame and explains why the pre-ready zero "made the launch frame lie."
- **Fix**: keep heading and controls mounted; render the list region as one quiet "Loading your history…" line.
- **Suggested command**: `/impeccable harden`

## Persona Red Flags

**Casey (distracted, one-handed, mid-brew)**: cannot reach either control after one swipe; cannot clear a
search at all; clock and trash share a 0px boundary at the thumb's arc, on the app's only irreversible action;
after deleting the last drink of an expanded day, focus drops to `<body>` and the group vanishes, losing
scroll position mid-correction.

**Sam (screen reader / keyboard / low vision)**: filter announces as three unrelated toggles — no exclusivity,
no "2 of 3", no arrow keys. The tile set changes the *question* all three figures answer with no announcement.
Two confirmed 4.36:1 text failures. Placeholder-as-label — sighted low-vision users lose the field's purpose
the moment they type. No `aria-controls` linking the disclosure to its `<ul>`. "Show older" appends 30 groups
silently, and shift-tab then walks backwards into never-announced content. Genuine credit: the `sr-only h2`,
the first-render live region, and per-row labels naming the action *and* the row are all correct.

**Riley (stress tester)**: empty state drops the `sr-only h2` so heading nav lands nowhere, and is inert text
where Home's equivalent is a button that adds the first order. `buildDayEntries` runs un-memoized for all 30
shown days on every keystroke (~30 calls over ~600 items per character) — cheap on an S24, worth noting. `Stat`
doesn't truncate. Page deep then filter strands you at the bottom of a suddenly-shorter list. Expansion
correctly survives "Show older" (stable keys); it does not survive a filter round-trip.

## Minor Observations

- "Per order" (`:107`) divides by orders including `price === 0` rows, which `MovementRow.tsx:72` explicitly
  guards against displaying. The average absorbs them silently and reads low.
- Three stacked bars at three heights (~66px, 44px, 52px) separated by one identical 20px gap — nothing in the
  rhythm says which two are controls.
- `new Intl.NumberFormat('en-US')` named `number` is now duplicated at module scope in five files
  (HistoryView:21, MovementRow:9, HomeView:10, DashboardView:18, Header:3). `src/shared/` exists for this, and
  today they are identical — which is exactly when consolidating is cheap.
- 127 days yields up to 30 `h3`s under a single `sr-only h2`; month-level headings would give Sam a skeleton.
- `Show older (97 more days)` counts days not rows — correct, since days are the window's unit.

## Questions to Consider

1. Home answers "how many and what did it cost." Dashboard answers "over time, and from where." What question
   is left for History's three tiles that isn't answered one tab away — and if the answer is "none," why is the
   log's entire first screenful three numbers instead of the log?
2. 597 of 606 movements carry no text to search. Is free text the right control for locating one of nine
   orders — or is the Orders tab plus a short scroll already the whole feature?
3. History is the one screen where the user is looking for something they know exists. Nothing supports that:
   no date jump, no month anchors, no "you started Mar 15." If the real job is "find the day I ordered from the
   cheap shop," why is the primary means of navigation a button that says "Show older (97 more days)"?
