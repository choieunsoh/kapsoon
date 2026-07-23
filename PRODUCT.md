# Product

## Register

product

## Users

One person — the owner — on their own phone (Samsung S24 Ultra, dark room, often one-handed,
frequently mid-task while the machine is actually brewing). No accounts, no sharing, no
onboarding: the user already knows what every number means, because they are the only one who
ever puts data in.

The job to be done is two-sided and asymmetric:

- **Many times a day, in two seconds:** log that a capsule was used. This is the whole product.
  It happens while holding a cup, so it must survive a careless one-handed thumb tap.
- **Occasionally, deliberately:** answer "am I about to run out?" and "what is this habit
  costing me?" — then record a restock order.

## Product Purpose

Kapsoon tracks a capsule coffee stash: what's left, how fast it's going, and what it costs.
It exists because the alternative is a mental note that fails exactly once — the morning the
box is empty. Success is that the user never runs out unexpectedly, and never has to think
about the app to get that guarantee.

It is offline-first and local-only by design (SQLite in OPFS). The data lives on the device;
the backup is a file the user owns. No server means no account, no sync conflicts, and nothing
to log into at 7am.

## Brand Personality

**Calm, warm, effortless.**

Voice: plain and unhurried. Lowercase hints over shouted labels. It states facts ("about 5 days
left") rather than issuing instructions ("BUY MORE NOW!"). It never congratulates, never nags,
and never celebrates a cup of coffee — drinking coffee is not an achievement.

Emotionally it should feel like a well-made physical object on the counter: warm to the touch,
obvious how to use, silent until it has something worth saying. The single warm espresso accent
against a cold near-black is the whole emotional argument — the app is dark and quiet, and the
one warm thing in it is the coffee.

## Anti-references

- **Gamified habit trackers** (Streaks, Habitica, Duolingo-style). No streaks, no badges, no
  confetti, no "🔥 7 days!", no guilt when a day is missed. Coffee is a supply to manage, not a
  habit to be coached on.
- **Sterile fintech dashboards.** The spend figure is context, not a KPI. No hero-metric slab,
  no sparkline-and-percentage-delta template, no "insights" the user didn't ask for.
- **Chatty consumer apps.** No mascot, no exclamation marks, no "Good morning, coffee lover!".
- **Undifferentiated card grids.** Equal-weight rounded rectangles stacked down the page are the
  failure mode this app is already closest to; every block must earn its visual weight.

## Design Principles

1. **One thing is the product.** Logging a capsule is the primary action and should dominate the
   screen. Everything else is reference material and must visibly rank below it.
2. **Numbers answer questions, not just report values.** "12 capsules" is a value; "12 left ·
   about 5 days" answers the question the user actually opened the app with. Prefer the
   projection over the raw figure.
3. **Speak only when there's something to say.** Low stock earns emphasis; healthy stock earns
   silence. Escalation is reserved, so it still means something when it appears.
4. **Warm is a budget, not a wash.** The accent is a scarce resource spent on the orb and on real
   signals. Spending it everywhere makes it say nothing.
5. **Thumb-first.** The primary action sits where a thumb rests on a 6.8" phone. Reading material
   can live up top; tappable things cannot.

## Accessibility & Inclusion

Target **WCAG 2.2 AA**, no known individual needs.

- Body text ≥4.5:1, large text ≥3:1 — including text on the warm accent orb, where the default
  cold `--color-muted` token fails and a warm off-white is derived instead.
- Interactive targets clear 44px (enforced globally in `globals.css`).
- Every animation has a `prefers-reduced-motion: reduce` path; motion never carries information
  on its own.
- Status is never encoded in color alone — a low-stock state must also change its wording.
