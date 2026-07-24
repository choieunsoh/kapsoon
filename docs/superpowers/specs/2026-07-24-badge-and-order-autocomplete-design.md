# Home-screen badge + order-form autocomplete — design

Date: 2026-07-24

Two small features, no schema change, no new dependency. Both serve PRODUCT.md's stated
success ("never run out unexpectedly") or fix an existing correctness bug.

## Feature 1 — capsules-left on the app icon (App Badging)

### Problem

Every existing "am I about to run out?" mechanism (runway, reorder warning, cadence) only
fires **when the app is open**. The one morning the box is empty is the morning you didn't
open it. Nothing reaches the user when the app is closed — the largest gap between the
stated purpose and the shipped product.

### Approach

`navigator.setAppBadge(stock)` on the installed PWA paints the current capsule count on the
home-screen icon. No permission prompt, no service worker, no server — it works on the
installed Chrome/Android PWA via the Badging API.

- Update in **one place**: `useCoffee.refresh()` (`use-coffee.ts:45`), the single point where
  `stock` is recomputed after every write. Call a helper `setStockBadge(stock)` at the end of
  refresh.
- `setStockBadge(n)`: if `n > 0` → `navigator.setAppBadge(n)`; else `navigator.clearAppBadge()`.
  Guard on `typeof navigator !== 'undefined' && 'setAppBadge' in navigator`; wrap in try/catch
  and swallow — an unsupported browser or a rejected promise is a weaker guarantee, not an
  error. Mirrors the existing `requestPersistence()` shape in `db.ts`.
- Lives in `db.ts` alongside the other navigator-guarded device helpers (`requestPersistence`,
  `isStoragePersisted`), which `use-coffee.ts` already imports from.

### Deliberate limit

The badge is accurate **as of the last log** — nothing runs while the app is closed, so it
does not tick down on its own. That is correct: the count only changes when you log a cup or
an order, and both go through `refresh()`. No `ponytail:` ceiling to flag — this isn't a cut
corner, it's the actual semantics.

### Out of scope

Scheduled push notification ("reorder in 3 days") — needs a server (kills the no-backend
property) or Notification Triggers (not shipped in Chrome). The badge gets ~80% of the value
for ~1% of the cost.

## Feature 2 — autocomplete on the order form

### Problem

`AddOrderSheet` takes shop / brand / bean as free text. `costPerCapsule()` (`stats.ts:80`)
groups by **exact string match** on `shop`, so "7-11" and "7-Eleven" rank as two shops and the
Dashboard's "Cheapest at" silently splits on a typo. The bug is at the input, not in the stat.

### Approach

Native `<datalist>` — `<input list={id}>` — a browser feature, zero dependencies.

- Pass the already-in-memory `movements` into `AddOrderSheet` (add a `movements: Movement[]`
  prop; the call site in `Coffee.tsx:58` has `coffee.movements` in scope).
- Derive three sorted, de-duplicated suggestion lists from `movements`: distinct non-empty
  `shop`, `brand`, `beanName` from order rows (`delta > 0`). One small pure helper
  `orderSuggestions(rows)` returning `{ shops, brands, beans }` — testable with array literals,
  in keeping with the file's pure-reducer style.
- Wire each of the three text inputs (`shop`, `brand`, `bean`) to a `<datalist>` via `list=`.
  Quantity and price stay plain. Keep the existing placeholders as the empty-state hint.

Autocomplete narrows typos but does not eliminate them — a user can still type a novel value.
That is intended: a first-ever shop must be typeable. This reduces fragmentation; it does not
enforce a closed vocabulary (which would need a shops table — out of scope).

### Out of scope

- Prefill-last-order — a separate nicety; not needed to fix the ranking bug.
- Normalizing existing typo'd rows in the DB — a data-migration question, separate from
  stopping new ones.

## Testing

- `setStockBadge` / `orderSuggestions` are the two bits of real logic. `orderSuggestions` gets
  a unit test (distinct + sorted + drops drinks/empties). `setStockBadge` is a thin
  navigator-guarded wrapper like `requestPersistence` — covered by the same light touch the
  siblings get (no dedicated test unless the guard logic grows).
- Existing quality gates unchanged: `typecheck && lint && format:check && test && build`.

## Files touched

- `src/features/coffee/db.ts` — add `setStockBadge(n)`.
- `src/features/coffee/use-coffee.ts` — call it in `refresh()`.
- `src/features/coffee/stats.ts` — add `orderSuggestions(rows)`.
- `src/features/coffee/components/AddOrderSheet.tsx` — `movements` prop + three `<datalist>`s.
- `src/features/coffee/components/Coffee.tsx` — pass `movements={coffee.movements}`.
- New test for `orderSuggestions`.
