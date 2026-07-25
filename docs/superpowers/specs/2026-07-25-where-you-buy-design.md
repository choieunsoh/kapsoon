# Where you buy — per-shop capsule rates on the Dashboard

## Problem

The Dashboard answers "what does this habit cost" with one all-time per-capsule price and a single
`Cheapest at · <shop>` row. That row names a winner without showing the field: it can't answer "by
how much", "how much have I bought there", or "is the place I usually go actually the expensive
one". The data to answer all three is already recorded on every order (`shop`, `delta`, `price`) and
already aggregated inside `costPerCapsule` — which builds a full per-shop map and then discards
everything but the argmin.

This is the second half of PRODUCT.md's asymmetric job: *"Occasionally, deliberately… record a
restock order."* Where to restock from is the one buying decision the log has enough history to
inform.

## Scope

A fourth section on the Dashboard, `Where you buy`, listing every shop you have ordered from with
its quantity-weighted per-capsule rate and total capsules, cheapest first.

Out of scope, deliberately:

- Any signal inside `AddOrderSheet`. The sheet *records* an order already paid for; a price
  comparison there is a lament, not decision support.
- Any signal on Home's reorder prompt. Considered and set aside — Home is the "now" surface and the
  Dashboard is where cost lives.
- Trend over time per shop, price-change alerts, or a recommended shop callout. No figure here is
  an instruction; the ranking is the whole message.

## Design

### 1. `shopRates()` — `src/features/coffee/core/stats.ts`

```ts
export type ShopRate = {
  shop: string;
  satang: number;   // quantity-weighted per-capsule rate, integer satang
  capsules: number; // capsules bought there, all-time
};

export function shopRates(rows: Pick<Movement, 'delta' | 'price' | 'shop'>[]): ShopRate[];
```

Returns cheapest first. Rules, all inherited unchanged from `costPerCapsule`'s existing documented
behaviour:

- **Quantity-weighted** (`Σprice / Σcapsules` per shop), not the mean of each order's own rate — a
  single-capsule impulse buy must not pull the figure as hard as a 50-capsule bulk order.
- **Repeat visits aggregate** before ranking, so a shop is ranked on all evidence, not its last
  receipt.
- **Skips non-orders** (`delta <= 0`).
- **Skips `price === 0`** entirely. Zero price means *cost unknown* (e.g. an opening-balance row for
  stock already owned), not free; counting it would let a shop win on no evidence.
- **Skips an empty `shop`** — those orders still count toward the overall `costPerCapsule` average
  but cannot be named, so they cannot be ranked.
- **Ties break toward more capsules** — the better-evidenced rate wins.
- Rounds only at the boundary (`Math.round`), keeping satang an integer per the house money rule.

Returns `[]` when no order carries a shop name.

**Window: all-time.** Matches the `price all-time` caption already on screen and
`costPerCapsule`'s stated reasoning — what a capsule costs moves slowly and is best estimated from
all history. The Dashboard has twice had to label its windows on screen to stop two figures reading
as a contradiction; this introduces no third window.

### 2. `costPerCapsule()` delegates

`costPerCapsule` keeps its own total loop (it must include unnamed-shop orders, which `shopRates`
excludes) and drops its duplicate per-shop map and argmin scan:

```ts
return { satang: Math.round(price / capsules), cheapestShop: shopRates(rows)[0]?.shop ?? null };
```

Behaviour is unchanged; the function gets shorter, and per-shop ranking has one definition instead
of two that can drift.

### 3. Dashboard section

Placed **third** — after `What it costs`, before `When you drink`. It is a cost fact and belongs
next to the other cost facts. Same chrome as the neighbouring blocks: `border-t border-[var(--color-border)] pt-6`
and the `text-[11px] uppercase tracking-[0.1em]` `h2`.

```
WHERE YOU BUY
Villa Market      ฿7.20   120 caps
7-Eleven          ฿8.50    48 caps
Central           ฿9.10    30 caps
```

- A real `<table>` with a header row. Three labelled columns is what a table is for, and it gives
  row/column navigation to a screen reader for free — the existing `<dl>` rows carry two values,
  this carries three.
- Rate right-aligned and `tnum` so the column of figures compares by eye; capsule counts likewise.
- Shop names are unbounded user data at the narrowest column on a 360px screen: `min-w-0` +
  `break-words`, matching the blend line on Home.
- No row cap. A capsule buyer has a handful of shops; truncating a list of four would hide the
  answer to the question the section exists to answer.

**Empty and degenerate states:**

- `shopRates()` returns `[]` → the section renders **nothing at all**, not an empty-state card.
  Principle 3: speak only when there's something to say.
- Exactly one shop → renders. "฿7.20 · 120 caps" is a true and useful fact about where you buy even
  with no second row to rank against.
- The whole Dashboard already early-returns on `movements.length === 0`, so the no-data case is
  handled upstream.

### 4. Deletion

The `Cheapest at` row in the `What it costs` block is removed. A ranked list that names the cheapest
shop in its first row makes a separate row naming the cheapest shop pure duplication, and PRODUCT.md
names stacked equal-weight blocks as the failure mode this app is closest to.

`HabitCost.cheapestShop` stays on the type — it is a correct derivation and removing it would ripple
through `habitCost` and its tests for no gain. It simply stops being rendered.

## Testing

Array-literal cases in `core/stats.test.ts`, no DB and no mocks (the `core/` boundary test enforces
this):

| Case | Expectation |
| --- | --- |
| Two shops, different rates | Sorted cheapest first |
| One shop, two orders at different prices | Weighted by quantity, not averaged per order |
| Order with `price === 0` | Excluded from that shop's rate entirely |
| Order with `shop === ''` | Absent from the result |
| Drinks (`delta < 0`) present | Ignored |
| Two shops, equal rate, different volume | Higher-capsule shop ranks first |
| No orders / no named shops | `[]` |

Plus one regression assertion that `costPerCapsule`'s `cheapestShop` is unchanged after the
refactor.

## Quality gates

`npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
