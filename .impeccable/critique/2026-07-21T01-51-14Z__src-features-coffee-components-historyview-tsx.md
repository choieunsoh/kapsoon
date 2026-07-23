---
target: History tab (HistoryView.tsx + MovementRow.tsx)
total_score: 21
p0_count: 1
p1_count: 4
timestamp: 2026-07-21T01-51-14Z
slug: src-features-coffee-components-historyview-tsx
---
# Critique — History tab (HistoryView.tsx + MovementRow.tsx)

Measured against the real DB, not a fixture: 606 movements, 597 capsules, 9 orders, ฿9,276 all-time.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Only view that ignores `ready`; filter change announces nothing |
| 2 | Match System / Real World | 3 | "Drank a coffee"/"Today"/"Yesterday" are excellent; the `-1` ledger delta is machine language |
| 3 | User Control and Freedom | 2 | Delete confirms but cannot be undone; no way to jump to a date |
| 4 | Consistency and Standards | 2 | Day-grouping built for drinks applied to orders yields 1-row groups; 127 `<h2>` in one view |
| 5 | Error Prevention | 3 | Inline delete confirm is good; free-text shop already produced "VVIP LUXERY" vs "VVIP LUXURY" |
| 6 | Recognition Rather Than Recall | 1 | Finding one order costs 53 screens of scroll. No search, no date jump, no index |
| 7 | Flexibility and Efficiency | 1 | One rigid path: scroll. No search, no range, no bulk delete, no collapse |
| 8 | Aesthetic and Minimalist Design | 2 | 606 equal-weight rows; longest run of 11 byte-identical rows |
| 9 | Error Recovery | 2 | No undo after delete |
| 10 | Help and Documentation | 3 | Single expert user; empty state teaches. Genuinely not a gap |
| **Total** | | **21/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**Deterministic scan**: `detect.mjs` over both files returned `[]`. Zero findings. No gradient text, no side-stripes, no eyebrows, no glassmorphism.

**LLM assessment**: This is not AI slop in the visual sense — the craft is unusually high and the comments show real design reasoning. It fails a different test, and it is the project's *own* named anti-reference:

> **Undifferentiated card grids.** Equal-weight rounded rectangles stacked down the page are the failure mode this app is already closest to; every block must earn its visual weight. — PRODUCT.md

At 606 rows that is not a risk; it is the page. Measured in the browser at 412×915:

| Metric | Value |
|---|---|
| Rows mounted | 606 |
| Day headers (`<h2>`) | 127 |
| Scroll height | 48,453px = **53 screens** |
| DOM nodes | 9,044 |
| Longest run of identical rows | **11** |

## Overall Impression

Two products share this screen and only one works.

**The Orders view is genuinely good** — every row is distinct and informative (shop, brand·bean, +120, ฿2,015.00). **The Drinks view is a wall.** Every drink row is byte-identical apart from a timestamp: same label, same `-1`, same two icons. Eleven in a row at one point. The page spends 90% of its pixels rendering the least informative thing it knows.

The single biggest opportunity: **stop rendering a drink as a row.** A day's drinking is one fact ("6 capsules"), not six identical lines.

## What's Working

1. **Order rows.** Shop as the lead, brand·bean subordinate, cup delta in accent, cost quiet beneath. Correct hierarchy, earned use of the scarce accent.
2. **Day labels.** "Today / Yesterday / Sunday, Jul 19" via Intl, with the honest comment about why rows carrying only HH:mm need them.
3. **The delete confirm.** Inline swap, no modal — exactly the register's "modal as first thought is laziness" rule, and the row keeps its place.

## Priority Issues

**[P0] The log has no ceiling and no entrance.** 606 rows / 9,044 DOM nodes / 53 screens, all mounted, with the only navigation being a thumb-flick. After a year this is 1,500+ rows. There is no way to reach March.
*Fix:* scope the log to a period (This month / Last month / All) with progressive "load older", so the default view is one screen, not fifty-three.

**[P1] Repeated drinks are rendered one per row.** Longest identical run: 11. Four rows reading `10:30 · Drank a coffee · -1` stacked on each other carry one fact between them.
*Fix:* collapse a day's drinks into a single row — `6 capsules · 07:12 – 21:08` — expandable when a specific cup needs editing or deleting.

**[P1] No retrieval path.** 9 orders are buried in 606 rows across 127 day groups. Answering "what did I pay Edition Roasters?" means scrolling past 597 identical drink rows.
*Fix:* a search field over shop/brand/bean, and make the Orders filter reachable without scrolling past the totals.

**[P1] The totals row does not answer to the filter.** Tap Orders and "Capsules 597" — a drinks figure — stays lit above a list containing zero drinks. The code comments this as deliberate; on screen it reads as a control that did nothing.
*Fix:* let the totals follow the filter (Orders → orders + spend; Drinks → capsules + daily average), or demote them so they clearly aren't the filtered result.

**[P2] The only view that ignores `ready`.** HomeView gates on it in 12 places, including `!ready ? null` before its own empty state. HistoryView renders "Nothing logged yet. Drink a coffee…" whenever `movements.length === 0` — which is also the state while OPFS is still answering. use-coffee's own comment names this exact trap.
*Fix:* one guard, matching the house convention.

## Persona Red Flags

**Casey (distracted mobile user)** — the target persona. The filter tabs and totals are at the top of a 48,000px page; scroll 3 screens and every control is gone with no sticky return. Interruption loses scroll position entirely (view state is component-local; switching tabs and back remounts at the top). Deleting a mis-tapped cup means finding it among 11 identical siblings.

**Riley (stress tester)** — already broke it, in production data: `VVIP LUXURY` / `VVIP LUXERY` / `Edition Roasters` are three free-text spellings of shop names with no autocomplete, silently fragmenting per-shop history. The 606-row render is the edge case, and it shipped.

**Sam (accessibility)** — 127 `<h2>` elements in one view make heading navigation useless, and none of them names the view itself; jumping by heading yields "Today, Yesterday, Sunday Jul 19…" with no page identity. The filter change is silent to a screen reader — no live region announces how many rows survived.

## Minor Observations

- The `-1` column is pure noise on the dominant row type — 100% redundant with "Drank a coffee", yet occupies the row's strongest right-edge position.
- Day headers applied to orders produce single-row groups (Jul 11, Jun 9, May 31…) — a drinks-shaped affordance costing more vertical space than the rows it labels.
- Order subtitles truncate ("Starbucks · House Bl…") when the number column is wide; the number column is fixed-width regardless of content.
- `filter === 'drinks' ? 'drinks' : 'orders'` in the empty-filter copy silently treats `'all'` as `'orders'` — currently unreachable, but fragile.
- The active filter tab reads adequately in the browser (surface-2 fill + full-strength text); an earlier concern that it was invisible did not survive visual inspection.

## Questions to Consider

- If a day's drinking is one fact, why is it 11 rows?
- What is History actually *for* — auditing a specific cup, or remembering what you paid? The current design optimizes for the first and the data says you do the second.
- Would this screen be better as "months, drill into one" than "everything, scroll"?

## Accessibility Pass (independent agent + browser verification)

- **[P1] Touch targets are 36×44px, not 44×44.** `size-9` on the clock/trash buttons sets `width:2.25rem`; the global `min-height:44px` rescues the height but nothing constrains the width. Measured live: `{w:36, h:44}` on every row. PRODUCT.md asserts 44px is "enforced globally in globals.css" — it is not, for width. Two adjacent 36px targets, one of them an unrecoverable delete. Fix: `size-11`.
- **[P2] The confirm-delete swap is silent to screen readers.** Tapping trash replaces the icon pair with Cancel/Delete with no `aria-live` announcement (WCAG 4.1.3).
- **[P2] Filter result count is never announced.** The "No drinks logged yet" message needs `role="status"`.
- **Passed:** heading levels (h1→h2, no skips), global focus-visible ring, all token contrast ratios (faint on surface 4.95:1, muted on surface 7.3:1), Cancel/Delete button height, `role="group"`+`aria-pressed` as a toggle pattern.
