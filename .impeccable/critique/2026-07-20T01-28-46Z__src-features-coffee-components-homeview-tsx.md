---
target: homepage (HomeView.tsx)
total_score: 24
p0_count: 1
p1_count: 3
timestamp: 2026-07-20T01-28-46Z
slug: src-features-coffee-components-homeview-tsx
---
# Critique — `src/features/coffee/components/HomeView.tsx`

Register: **product** · single-user · dark-only · mobile-only (S24 Ultra, 360–412 CSS px).
Three lenses: LLM design review (Assessment A), impeccable deterministic detector (Assessment B),
and Vercel Web Interface Guidelines (via `ui-skills`).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No loading state anywhere in `src/`; cold boot paints a confident wrong answer |
| 2 | Match System / Real World | 3 | Voice is excellent; `Figure` values are unit-less integers above a currency row |
| 3 | User Control and Freedom | 1 | No undo on Home for the most likely error; `outOfStock` refuses to record a real event |
| 4 | Consistency and Standards | 3 | Three "add an order" affordances; "This month" labels two different quantities |
| 5 | Error Prevention | 2 | `void drink()` discards the promise; double-tap silently logs twice; negative stock clamped |
| 6 | Recognition Rather Than Recall | 3 | User must supply the unit for the two `Figure` values from memory |
| 7 | Flexibility and Efficiency | 3 | Orb is a genuinely excellent 2-second interaction; no correct/backdate path from Home |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained and earned; docked for `· tap` and uniform `gap-7` flattening two ranks |
| 9 | Error Recovery | 1 | No error state in this file or `use-coffee.ts`; a failed write looks like a success |
| 10 | Help and Documentation | 3 | Correctly absent per PRODUCT.md; empty state teaches the one thing a new install needs |
| **Total** | | **24/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**Does this look AI-generated? No.**

**LLM assessment.** It would pass a Linear/Raycast/Stripe-fluent user. No status badge, no sparkline,
no percentage delta, no gradient hero slab — the sterile-fintech anti-reference is genuinely avoided.
No streaks, no confetti, no emoji; the 520ms ping is a receipt, not a celebration. Copy states facts
and names next steps. The card-grid anti-reference is actively fought in the figures block (one
surface, hairline splits) with a measured reason.

Two things a fluent user would clock:

1. The bottom third relapses into the anti-reference. `MovementRow` renders a rounded
   `--color-surface` rectangle per row; five cups today = five equal-weight cards each carrying one
   bit. The failure mode defeated in the figures block is re-imported below it.
2. `· tap` is permanent instructional chrome in an app whose PRODUCT.md says there is no onboarding.

**Deterministic scan.** `detect.mjs` returned `[]`, exit 0, on `HomeView.tsx`, all of
`src/features/coffee/components/`, and `src/app/`. Zero findings. The syntactic slop tells
(gradient text, side-stripe borders, uppercase eyebrows, `transition: all`, `outline-none`) are all
genuinely absent. The scan is correct and it is also blind to every issue below — it matches
grammar, not argument.

**Vercel Web Interface Guidelines.** One real miss the other two lenses did not catch, plus two
minor ones. See Priority Issues P2 and Minor Observations.

**Visual overlays.** Not available — no dev server running; no browser inspection was performed.
All geometry and contrast below is computed from source and resolved token values, not measured
in a live page.

## Overall Impression

This is a designed screen with a point of view, not a generated one. The contrast work on the orb is
real engineering that almost nobody does, and the comments are unusually honest — the claim that
`--color-faint` measures 4.4:1 on `--color-surface` checks out at **4.40:1** exactly.

The single biggest opportunity is that the file's craft is concentrated on the *steady state* and
almost absent from the *transitional and failure states*. Every session opens on a frame that
asserts the user has run out of coffee. That is the exact scenario the product exists to prevent.

## What's Working

**1. The orb's contrast work is real, not a comment claiming to be.** The code rejects
`--color-muted` on the brown orb and derives `color-mix(in oklab, var(--color-text) 82%,
var(--color-accent))`. Resolved: the rejected token lands at **2.06–2.40:1**; the derived value at
**4.96–5.67:1** across the label's actual y-band on the gradient. Clears AA with margin, survives a
reskin of `--color-accent`, and the comment's reasoning is accurate.

**2. Escalation discipline.** `aria-live` is applied *only* while escalated, for a technically
correct reason: the healthy wording carries a pace figure that moves on every write, so an always-on
region would re-announce a whole sentence per tap. Colour is never the sole channel — both
`outOfStock` and `reorderSoon` change the wording too. The healthy state is silent. Design
Principle 3 implemented rather than quoted.

**3. The figures block refuses the card grid for a measured reason.** One surface split by hairlines
instead of three filled cards; cups share a two-way split, money gets a full-width row because a THB
string needs ~90px and a three-way split at 360px leaves ~80px. Verified: the row lands with ~24px
of slack at 360px. Design-by-measurement.

## Priority Issues

### [P0] Cold boot renders a confident wrong answer; there is no loading state

`use-coffee.ts` seeds `stock = 0` / `movements = []` and loads in a mount effect that awaits
`seedIfEmpty()` → `fetch()` → `listMovements()` through a lazily-constructed sqlite-wasm worker and
OPFS handle. A grep for `loading|isLoading|Suspense|skeleton` across `src/` returns no matches.
During that window Home computes `outOfStock = true`, `daysLeft = null`, and `movements.length === 0`,
painting all four false states at once: "0 capsules left", "Log a few cups and this will estimate…",
a disabled orb reading "add stock to drink", and the first-run "No coffee yet" button.

**Why it matters.** The product's promise is "never run out unexpectedly." The launch frame asserts
you have run out, disables the primary action, and shows first-run copy to a two-year user — on
every single session.

**Fix.** Add `ready` state to `use-coffee.ts`, set after the first `refresh()`. In HomeView: gate
`disabled` on `ready && outOfStock`, gate the runway three-way branch so `!ready` renders a neutral
placeholder, gate the empty-state branch on `ready`, and render figures as `—` rather than `0`.

**Suggested command:** `/impeccable harden`

### [P1] No undo for a mis-tapped cup on the screen where mis-taps happen

`<MovementRow movement={m} />` is rendered with no `onDelete`. `MovementRow` already implements the
full delete + inline-confirm affordance, and `removeMovement` is already exported by `use-coffee.ts`
— it is simply not destructured here. Recovery today is four taps and a context switch (nav →
History → scan → trash → confirm) to fix the app's most probable error, on a screen already showing
the offending row.

**Fix.** Pass the handler that already exists. One-line change, no new UI.

**Suggested command:** `/impeccable harden`

### [P1] A failed write looks identical to a successful one, and success is announced to nobody

Three defects in one interaction. The ring fires *before* the write and `void drink()` discards the
promise, so an OPFS failure (which CLAUDE.md warns can happen silently if cross-origin isolation is
lost) produces the same ring with a count that just doesn't move — a confirmation that fires on
input rather than on commit. And mutating the `aria-label` of an already-focused button is not
reliably announced by TalkBack or NVDA, while the runway's `aria-live` is `undefined` in the healthy
state: a screen-reader user taps the orb and gets nothing.

**Fix.** `.catch()` the write and render the error in the runway paragraph slot (already the page's
status line, already escalates to `--color-danger`). Add an `sr-only role="status"` span carrying
only the volatile count, and reduce the `aria-label` to a static string.

**Suggested command:** `/impeccable harden`

### [P1] `disabled={outOfStock}` is the wrong model, and its visual treatment makes the app vanish

Kapsoon is a signed-delta ledger. `db.ts`'s own comment on `updateOrder` explicitly accepts that
"this can push stock negative… for a single-user log that reads as the correction it is." Home
contradicts that: drink a capsule from a sleeve you forgot to log and the app **refuses to record a
thing that happened**, to protect a derived running sum. The events are the truth; the number is
derived.

The visual treatment is separately self-defeating: `disabled:bg-[var(--color-surface)]` is
**1.06:1** against `--color-bg` and the ring is **1.38:1**. The comment traded a 2:1 label for a
1.06:1 control — at the one moment the screen most needs to be directive, a 224px element
evaporates. `disabled` also removes it from the tab order, so a keyboard user never encounters the
control or its reason.

**Fix.** Drop `disabled`. Let stock go negative and display it honestly; the danger line and the
inline "Add an order" button already carry the state. If the disabled state must stay, move the fill
to `--color-surface-2` and the ring to `--color-border-strong`, and keep it focusable via
`aria-disabled`.

**Suggested command:** `/impeccable harden`

### [P2] Missing `touch-action: manipulation` — a ~300ms delay on the app's one interaction

Caught by the Vercel guidelines, missed by both other lenses. A grep for
`touch-action|tap-highlight|overscroll` across `src/` returns nothing but comments. On mobile
Chrome, a tap target without `touch-action: manipulation` retains the double-tap-zoom detection
window, adding perceptible latency to every tap. This is a tap-to-log product whose entire premise
is a two-second interaction, repeated many times a day. `-webkit-tap-highlight-color` is also unset,
so Android paints its default translucent flash over a 224px disc that already has a bespoke ring
animation.

**Fix.** `touch-action: manipulation` on the orb (or globally on `button`), plus an intentional
`-webkit-tap-highlight-color: transparent`.

**Suggested command:** `/impeccable polish`

### [P2] Hierarchy inversion: the largest number answers the least important question

`consumedToday` is 72px. `stock` is 28px. `daysLeft` — the projection — is 14px. PRODUCT.md names
two occasional questions ("am I about to run out?", "what is this costing me?") and one constant
action. "How many have I drunk today?" is on neither list, and Design Principle 2 says explicitly:
*prefer the projection over the raw figure.* The file's own comment claims "the projection leads" —
it does not; it is the smallest text in the top block and one-fifth the size of the today-count.

**Fix.** Either promote `daysLeft`/`stock` into the orb and demote the today-count to the label line,
or remove the number from the orb entirely — the file's own comment already argues "its size is the
affordance."

**Suggested command:** `/impeccable layout`

### [P2] Unit-less figures, and a duplicated label stem

"This week / 18" and "This month / 62" carry no unit, sitting directly above "Spent this month /
฿890.00" — so "This month" labels two different quantities in one card, and an unlabelled integer
next to a currency row is genuinely ambiguous at a glance. Fix: `Cups this week` / `Cups this month`.
Both fit in the 164px cell at 360px, and it kills the duplicated stem for free.

**Suggested command:** `/impeccable clarify`

## Persona Red Flags

**Casey (distracted mobile user — the literal target: one-handed, mid-brew, 7am).** The cold-boot
false-empty hits hardest: glance, see "0 capsules left", act on it. A double-tap logs two cups with
no undo on this screen. A failed write looks like a success, so the runway estimate quietly degrades
without Casey ever noticing.

**Sam (accessibility-dependent).** **No `<h1>` exists anywhere in the app** — `Header.tsx` renders
"Kapsoon" in a `<span>`, and Home's only heading is an orphaned `<h2>Today</h2>`; the stock/runway
block, the page's actual subject, has no heading at all. Tapping the orb announces nothing. Out of
stock, the orb is `disabled` and therefore unfocusable, so tabbing never reaches the primary control
or its explanation. The blend line at `--color-faint` on `--color-bg` is 4.68:1 at 12px — passing,
but the thinnest margin on the page at the smallest size.

**Riley (stress tester).** Rapid taps run overlapping `listMovements()` round-trips with no
sequencing or request id; an out-of-order resolution briefly paints stale figures. `void` makes any
rejection an unhandled promise rejection with no boundary. Negative stock renders as `0` via
`Math.max(stock, 0)`, so adding 5 against a real balance of −3 displays 0 → 2 with three capsules
unaccounted for. And `Math.max(1, …)` reports "About 1 day left" when the true runway is a third of
a day — the one case where the deliberately-under-promising floor over-promises.

**The owner (project-specific, from PRODUCT.md §Users).** The first frame of every session says
you're out of coffee and disables the button — at exactly the 7am scenario the Product Purpose
describes. And the reorder escalation uses `--color-accent`, the same token as the always-present
raised FAB ~60px below it, so Principle 4's "warm is a scarce budget" is undercut: only the wording
actually escalates. (The orb resolves to `#8e6334`, meaningfully darker, so the orb is not the
culprit — the FAB is.)

## Minor Observations

- `'capsules today · tap'` joins an interpuncted noun phrase to an imperative; two unrelated
  fragments, and `tap` is permanent onboarding in a no-onboarding product.
- Uniform `gap-7` across four children of two different ranks. Wrap stock+orb in a tighter group and
  raise the outer gap.
- The null-runway copy shows first-run text to veterans: `consumptionPerDay` returns `null` when
  nothing was consumed *in the window*, not only when nothing was ever logged. A user with 300 cups
  who skips two weeks is told "Log a few cups and this will estimate how long they last."
- `${rate.format(perDay ?? 0)}` — the `?? 0` is unreachable. Harmless dead defensiveness.
- Vercel guidelines, minor: no non-breaking space between figure and unit, so "5 days" / "12
  capsules" can wrap mid-measurement; and the blend line has no `truncate`/`break-words`/`min-w-0`,
  so a long brand + bean name can overflow.
- Vercel guidelines, **false positive**: "Title Case applied to headings/buttons" conflicts with
  PRODUCT.md's explicit "lowercase hints over shouted labels." Project voice wins; ignore the rule.
- Reduced motion is correctly double-guarded, and `orb-ping`'s resting state is `opacity: 0` so the
  reduced path shows nothing rather than a stuck ring.
- `key={pulse}` remounts the count span on every tap — harmless now, but it means a future
  `aria-live` there would be an insertion rather than a text change, which behaves differently in AT.

## Questions to Consider

1. Does "Today" earn a third of the screen? Five cups render as five rectangles that differ only in
   `HH:mm`, one bit each, when the orb already states the total.
2. Why is the biggest number the one PRODUCT.md never asks for?
3. If the `+` FAB is permanently at thumb height, why does the escalated state grow a second,
   quieter "Add an order" directly above it — and why is the *less* prominent one the contextual
   recommendation?
4. Is a numeric runway honest? "About 5 days left" carries a precision a 14-day mean over a lumpy
   weekend doesn't have, and it's the one place the app sounds like a dashboard rather than an object
   on a counter.
5. Should a ledger ever refuse a write?
