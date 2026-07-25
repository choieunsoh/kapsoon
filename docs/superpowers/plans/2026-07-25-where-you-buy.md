# Where You Buy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Where you buy` section to the Dashboard listing every shop you have ordered from with its quantity-weighted per-capsule rate, cheapest first — and delete the single `Cheapest at` row it supersedes.

**Architecture:** `costPerCapsule` in `core/stats.ts` already builds a full per-shop rate map and discards everything but the argmin. Task 1 extracts that map as an exported pure function `shopRates()` and reduces `costPerCapsule` to reading the winner off the front of it, so per-shop ranking has one definition instead of two. Task 2 renders the list as a fourth Dashboard section and removes the now-duplicated row.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, Tailwind v4, Vitest + @testing-library/react, oxlint, oxfmt.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-25-where-you-buy-design.md`.
- **`core/` is platform-free.** Nothing under `src/features/coffee/core/` may import outside `core/` (bar `drizzle-orm`) or touch a browser global. `core/boundary.test.ts` fails the build otherwise.
- **TypeScript house bans:** no `any`, no `as` casts (`as const` is fine), no `!` assertions, no `// @ts-*` comments. `type` over `interface`. Prefer `for..of`.
- **Money is always an integer minor unit (satang).** Never a float. Round only at the display/derivation boundary with `Math.round`.
- **Figures use `.tnum`** (tabular numerals). Never a monospace font.
- **Voice (PRODUCT.md):** plain and unhurried, states facts rather than issuing instructions, never congratulates. No new copy may read as an instruction.
- **Silence over empty states (Principle 3):** a section with nothing to say renders nothing, not a zero-filled card.
- **Quality gates, all must pass:** `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
- **Commits:** `type(scope): description` with a body explaining WHY. Single-word scope (`coffee`). Use repeated `-m` flags — never `-F`. Never add a `Claude-Session:` trailer.
- Branch is already `shop-rates`; the spec is already committed there.

---

### Task 1: `shopRates()` and the `costPerCapsule` delegation

**Files:**

- Modify: `src/features/coffee/core/stats.ts:51-103` (the `CapsuleCost` type and `costPerCapsule`)
- Test: `src/features/coffee/core/stats.test.ts` (append after the existing `costPerCapsule` block, which ends at line 186)

**Interfaces:**

- Consumes: `Movement` from `./movement` (already imported at the top of `stats.ts`).
- Produces, for Task 2:
  - `export type ShopRate = { shop: string; satang: number; capsules: number }`
  - `export function shopRates(rows: Pick<Movement, 'delta' | 'price' | 'shop'>[]): ShopRate[]` — cheapest first.
  - `costPerCapsule`'s public behaviour and `CapsuleCost` type are **unchanged**.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/coffee/core/stats.test.ts`:

```ts
test('shopRates ranks every shop cheapest first, not just the winner', () => {
  const rows = [
    { delta: 10, price: 30_000, shop: 'Tops' }, // ฿30.00/capsule
    { delta: 10, price: 20_000, shop: 'Makro' }, // ฿20.00/capsule — cheapest
    { delta: 10, price: 40_000, shop: 'Cafe' },
  ];
  expect(shopRates(rows).map((r) => r.shop)).toEqual(['Makro', 'Tops', 'Cafe']);
});

test('shopRates weights repeat visits by quantity rather than averaging receipts', () => {
  const rows = [
    { delta: 1, price: 500, shop: 'Makro' }, // a cheap one-off…
    { delta: 99, price: 99_000, shop: 'Makro' }, // …outweighed by the bulk buy
    { delta: 10, price: 6_000, shop: 'Tops' }, // ฿6.00/capsule — actually cheapest
  ];
  // 99_500 satang / 100 capsules = 995. Averaging the two receipts' own rates would give 750.
  expect(shopRates(rows)).toEqual([
    { shop: 'Tops', satang: 600, capsules: 10 },
    { shop: 'Makro', satang: 995, capsules: 100 },
  ]);
});

test('shopRates excludes drinks, unnamed shops and zero-price orders', () => {
  const rows = [
    { delta: -1, price: 0, shop: '' }, // a drink
    { delta: 10, price: 20_000, shop: '' }, // an order that cannot be attributed
    { delta: 175, price: 0, shop: 'Opening balance' }, // cost UNKNOWN, not free
    { delta: 10, price: 15_000, shop: 'Makro' },
  ];
  expect(shopRates(rows)).toEqual([{ shop: 'Makro', satang: 1_500, capsules: 10 }]);
});

test('shopRates breaks a tie toward the shop with more capsules behind the rate', () => {
  const rows = [
    { delta: 5, price: 5_000, shop: 'Cafe' }, // ฿10.00/capsule on 5 capsules
    { delta: 50, price: 50_000, shop: 'Makro' }, // ฿10.00/capsule on 50 — better evidenced
  ];
  expect(shopRates(rows).map((r) => r.shop)).toEqual(['Makro', 'Cafe']);
});

// Rows are sorted on the ROUNDED rate — the figure actually printed. Sorting on the unrounded rate
// would order two rows that both display ฿10.00 by a difference the reader cannot see, which reads
// on screen as a broken sort. The capsule tie-break then decides, as it does for an exact tie.
test('shopRates sorts on the rate it prints, not on sub-satang precision', () => {
  const rows = [
    { delta: 3, price: 3_001, shop: 'Cafe' }, // 1000.33 → ฿10.00
    { delta: 30, price: 30_002, shop: 'Makro' }, // 1000.07 → ฿10.00, more capsules
  ];
  const rates = shopRates(rows);
  expect(rates.map((r) => r.satang)).toEqual([1_000, 1_000]);
  expect(rates.map((r) => r.shop)).toEqual(['Makro', 'Cafe']);
});

test('shopRates is empty when no order carries a shop name', () => {
  expect(shopRates([])).toEqual([]);
  expect(shopRates([{ delta: 10, price: 20_000, shop: '' }])).toEqual([]);
});

// The refactor moves cheapestShop onto shopRates' ranking. These pin that the delegation kept the
// old answers — including the two cases that are NOT symmetric with shopRates: an unnamed-shop order
// still counts toward the overall average, and an all-unnamed log still yields a price.
test('costPerCapsule still names the same cheapest shop after delegating the ranking', () => {
  const rows = [
    { delta: 175, price: 0, shop: 'Opening balance' },
    { delta: 10, price: 20_000, shop: 'Tops' },
    { delta: 10, price: 15_000, shop: 'Makro' },
  ];
  expect(costPerCapsule(rows)?.cheapestShop).toBe('Makro');
  expect(costPerCapsule(rows)?.cheapestShop).toBe(shopRates(rows)[0]?.shop);
});

test('costPerCapsule still costs an unnamed-shop order it cannot rank', () => {
  const rows = [{ delta: 10, price: 20_000, shop: '' }];
  expect(costPerCapsule(rows)?.satang).toBe(2_000);
  expect(costPerCapsule(rows)?.cheapestShop).toBeNull();
  expect(shopRates(rows)).toEqual([]);
});
```

Add `shopRates` to the existing import from `./stats` at the top of the file (alphabetical, between `orderSuggestions` and `spendByMonth`):

```ts
import {
  averageCups,
  costPerCapsule,
  dailyCups,
  habitCost,
  monthGrids,
  orderCadence,
  orderSuggestions,
  shopRates,
  spendByMonth,
} from './stats';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- stats`
Expected: FAIL — `shopRates is not a function` / TypeScript reports no exported member `shopRates`.

- [ ] **Step 3: Implement `shopRates` and reduce `costPerCapsule`**

In `src/features/coffee/core/stats.ts`, replace the whole `CapsuleCost` + `costPerCapsule` block (lines 51-103) with:

```ts
export type ShopRate = {
  shop: string;
  satang: number; // quantity-weighted per-capsule rate, integer satang
  capsules: number; // capsules bought there, all-time
};

// Every shop you have ordered from and what a capsule actually costs there — cheapest first. This
// is the map costPerCapsule used to build privately and throw away after reading one name off it;
// it is now the single definition of per-shop ranking, so the Dashboard's list and the
// `cheapestShop` field cannot drift apart.
//
// WEIGHTED per shop (Σprice / Σcapsules), so repeat visits aggregate before ranking: averaging each
// receipt's own rate would let a single-capsule impulse buy pull a shop as hard as a 50-capsule bulk
// order. Three exclusions, all inherited: a drink carries no price; a `price === 0` order means cost
// UNKNOWN (an opening-balance row for stock already owned) rather than free, and would otherwise win
// "cheapest" on no evidence at all; an order with no shop name can be costed but not attributed.
//
// Sorted on the ROUNDED rate — the figure that is printed. Sorting on the unrounded one would order
// two rows both displaying ฿10.00 by a difference the reader cannot see, which reads as a broken
// sort. Ties then break toward the shop you have bought more from: the better-evidenced rate.
export function shopRates(rows: Pick<Movement, 'delta' | 'price' | 'shop'>[]): ShopRate[] {
  const byShop = new Map<string, { price: number; capsules: number }>();
  for (const m of rows) {
    if (m.delta <= 0 || m.price === 0 || m.shop === '') continue;
    const shop = byShop.get(m.shop) ?? { price: 0, capsules: 0 };
    shop.price += m.price;
    shop.capsules += m.delta;
    byShop.set(m.shop, shop);
  }

  const rates: ShopRate[] = [];
  // Round only here: satang stays an integer at the boundary, per the house money rule.
  for (const [shop, sums] of byShop) {
    rates.push({ shop, satang: Math.round(sums.price / sums.capsules), capsules: sums.capsules });
  }
  return rates.toSorted((a, b) => a.satang - b.satang || b.capsules - a.capsules);
}

export type CapsuleCost = {
  satang: number; // integer satang per capsule, all-time
  cheapestShop: string | null;
};

// All-time cost per capsule, WEIGHTED BY QUANTITY (Σprice / Σdelta). Averaging each order's own
// per-capsule rate would let a single-capsule impulse buy pull the mean as hard as a 50-capsule
// bulk order — the number people actually want is what a capsule costs on average, not what an
// order costs on average.
//
// A `price === 0` order is excluded: zero price carries no price information, so it means "cost
// unknown" — e.g. an opening-balance row for stock you already had — not "free".
//
// This total is NOT the sum of shopRates': an order with no shop name is costed here and ranked
// there, which is why the loop below stays separate rather than folding into shopRates.
export function costPerCapsule(
  rows: Pick<Movement, 'delta' | 'price' | 'shop'>[],
): CapsuleCost | null {
  let price = 0;
  let capsules = 0;
  for (const m of rows) {
    if (m.delta <= 0 || m.price === 0) continue;
    price += m.price;
    capsules += m.delta;
  }

  if (capsules === 0) return null;

  return { satang: Math.round(price / capsules), cheapestShop: shopRates(rows)[0]?.shop ?? null };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- stats`
Expected: PASS — the eight new tests plus every pre-existing `costPerCapsule` test (lines 120-186), unchanged.

- [ ] **Step 5: Run the full gates**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all exit 0. `core/boundary.test.ts` must stay green — `shopRates` imports nothing new.

If `format:check` fails, run `npm run format` and re-run the gates.

> **Note:** `npm run lint` can print `✓ 0 problems` and still exit non-zero. Trust the exit code, not the text: `npm run lint; echo "exit=$?"`.

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/core/stats.ts src/features/coffee/core/stats.test.ts
git commit -m "feat(coffee): rank every shop by its per-capsule rate" -m "costPerCapsule built a full per-shop rate map and discarded everything but the argmin, so the dashboard could name a cheapest shop but never show the field it won. shopRates() returns that map, ranked, and costPerCapsule now reads its winner off the front — one definition of per-shop ranking instead of two that can drift." -m "Sorted on the rounded rate, the figure actually printed: ordering two rows that both display the same price by a difference the reader cannot see reads as a broken sort."
```

---

### Task 2: The `Where you buy` Dashboard section

**Files:**

- Modify: `src/features/coffee/components/DashboardView.tsx` (imports; delete the `Cheapest at` row at lines 165-171; add the new section between the cost block and `When you drink`)
- Modify: `src/features/coffee/dashboard-view.test.tsx` (two existing assertions collide with the new table — see Step 1)

**Interfaces:**

- Consumes: `shopRates`, `type ShopRate` from `../core/stats` (Task 1); `formatSatang` from `../core/money` (already imported).
- Produces: nothing consumed by a later task.

**Two existing tests break on this change. Both are real collisions, not flakes:**

1. `dashboard-view.test.tsx:186` asserts `getAllByRole('columnheader').length % 7 === 0`. `MonthCalendar` renders exactly one month table with 7 weekday headers; the new table adds 3 more, giving 10. Fixed by scoping the assertion to the month table, which is also a stronger check — `% 7` passes even if one table had 6 headers and another 8.
2. `dashboard-view.test.tsx:259` asserts `getByText(formatSatang(2_000))`. That fixture's single order is 30 capsules at ฿600.00 from `Tops`, so `฿20.00` will now appear twice — in the cost hero and in the new table's `Tops` row — and `getByText` throws on multiple matches. Fixed by giving the cost hero a `data-testid` and asserting on it, the same technique and for the same reason as `data-testid="trend-average"` (see the comment at line 93).

- [ ] **Step 1: Write the failing tests**

First, fix the two colliding assertions.

In `src/features/coffee/dashboard-view.test.tsx`, add `within` to the testing-library import:

```ts
import { render, screen, within } from '@testing-library/react';
```

Replace the calendar assertion (line 186) inside `test('the calendar renders month tables that carry each day count as text', ...)`:

```ts
expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
// Scoped to the month table by its accessible name ("July 2026" — the visible month heading,
// via aria-labelledby). The page now renders a second table, and an unscoped columnheader count
// would be totalling weekday headers together with the shop table's.
const monthTable = screen.getByRole('table', { name: /\d{4}$/ });
expect(within(monthTable).getAllByRole('columnheader')).toHaveLength(7);
expect(screen.getAllByText(/: 2 capsules/).length).toBeGreaterThan(0);
```

Replace the price assertion (line 259) inside `test('an order with no cups in the window prints the price without a rate of zeros', ...)`:

```ts
// By test id, not by text: the shop table below prints the same ฿20.00 for Tops, and getByText
// throws on two matches. Same reason data-testid="trend-average" exists.
expect(screen.getByTestId('cost-per-capsule')).toHaveTextContent(formatSatang(2_000));
```

Now append the new tests to the same file:

```ts
// The section supersedes the old "Cheapest at" row: a ranked list whose first row IS the cheapest
// shop makes a separate row naming it pure duplication.
test('the shop table ranks every shop cheapest first and drops the Cheapest at row', () => {
  const rows = [
    order(2, 60_000, 'Tops'), // 30 capsules, ฿600.00 → ฿20.00
    order(20, 45_000, 'Makro'), // 30 capsules, ฿450.00 → ฿15.00 — cheapest
    ...steadyDrinker(),
  ];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  const table = screen.getByRole('table', { name: 'Where you buy' });
  const shops = within(table)
    .getAllByRole('rowheader')
    .map((cell) => cell.textContent);
  expect(shops).toEqual(['Makro', 'Tops']);
  expect(within(table).getByText(formatSatang(1_500))).toBeInTheDocument();
  expect(screen.queryByText('Cheapest at')).not.toBeInTheDocument();
});

// Principle 3: a section with nothing to say says nothing. Every order here is unattributed, so
// there is no ranking to draw — and an empty card would be the equal-weight rectangle PRODUCT.md
// names as this app's nearest failure mode.
test('with no shop named on any order the section renders nothing at all', () => {
  const rows = [order(2, 60_000, ''), ...steadyDrinker()];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  expect(screen.queryByText('Where you buy')).not.toBeInTheDocument();
  expect(screen.queryByRole('table', { name: 'Where you buy' })).not.toBeInTheDocument();
  // The cost block still reports the price it can compute from an unattributed order.
  expect(screen.getByTestId('cost-per-capsule')).toHaveTextContent(formatSatang(2_000));
});

// One shop is not a ranking, but "฿20.00 across 30 capsules" is still a true and useful fact about
// where you buy. Rendering it costs nothing; suppressing it would hide the only row there is.
test('a single shop still gets a row, with its capsule count', () => {
  const rows = [order(2, 60_000, 'Tops'), ...steadyDrinker()];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  const table = screen.getByRole('table', { name: 'Where you buy' });
  expect(within(table).getByRole('rowheader')).toHaveTextContent('Tops');
  expect(within(table).getByText('30')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- dashboard-view`
Expected: FAIL — the three new tests cannot find a table named `Where you buy`; the two edited assertions fail on the missing `cost-per-capsule` test id and the missing month-table name.

- [ ] **Step 3: Implement the section**

In `src/features/coffee/components/DashboardView.tsx`:

**3a.** Add `shopRates` and the type to the `../core/stats` import (alphabetical):

```ts
import {
  averageCups,
  dailyCups,
  habitCost,
  monthGrids,
  orderCadence,
  shopRates,
  spendByMonth,
  type MonthSpend,
  type ShopRate,
} from '../core/stats';
```

**3b.** Add a module constant beside `WINDOW_DAYS` / `SPEND_MONTHS`, so the `h2` can name the table without a duplicate `<caption>` repeating the same string into the accessibility tree (the reasoning `MonthCalendar` uses for its own `aria-labelledby`). A literal id is safe because `DashboardView` renders once:

```ts
const SHOPS_HEADING_ID = 'where-you-buy';
```

**3c.** Derive the rates beside the other stats calls (after `const calendar = monthGrids(movements);`):

```ts
const rates = shopRates(movements);
```

**3d.** Give the cost hero a test id — `DashboardView.tsx:130`:

```tsx
<span data-testid="cost-per-capsule" className="tnum text-[30px] font-semibold leading-none">
  {formatSatang(cost.perCapsule)}
</span>
```

**3e.** Delete the `Cheapest at` row — the whole conditional at lines 166-171:

```tsx
{
  cost.cheapestShop ? (
    <div className="flex items-baseline justify-between border-t border-[var(--color-border)] py-2.5">
      <dt className="text-sm text-[var(--color-muted)]">Cheapest at</dt>
      <dd className="font-semibold">{cost.cheapestShop}</dd>
    </div>
  ) : null;
}
```

The surrounding `<dl>` stays — it still holds the `You order` cadence row.

**3f.** Insert the new section between the closing `</div>` of block 2 (`What it costs`, line 195) and the opening of block 3 (`When you drink`, line 197):

```tsx
{
  /* 3 — Where you buy. Renders only when an order actually names a shop: with nothing to rank
          this would be an empty rounded rectangle, which is the failure mode PRODUCT.md names.
          It replaces the old "Cheapest at" row, which named a winner without showing the field.
          A real <table>: three labelled columns is what a table is for, and it gives a screen
          reader row/column navigation that the two-value <dl> rows above cannot. */
}
{
  rates.length > 0 ? (
    <div className="border-t border-[var(--color-border)] pt-6">
      <h2
        id={SHOPS_HEADING_ID}
        className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]"
      >
        Where you buy
      </h2>
      <ShopTable rates={rates} />
    </div>
  ) : null;
}
```

**3g.** Add the component beside `SpendBars` at the bottom of the file:

```tsx
// Every shop, cheapest first. All-time, matching the "price all-time" caption in the cost block
// above — the dashboard already carries two figures on different windows and labels both to stop
// them reading as a contradiction, and a third window would need a third label.
function ShopTable({ rates }: { rates: ShopRate[] }) {
  return (
    <table aria-labelledby={SHOPS_HEADING_ID} className="mt-2 w-full">
      <thead>
        <tr className="text-xs text-[var(--color-muted)]">
          <th scope="col" className="py-1.5 text-left font-normal">
            Shop
          </th>
          <th scope="col" className="py-1.5 text-right font-normal">
            Per capsule
          </th>
          <th scope="col" className="py-1.5 text-right font-normal">
            Capsules
          </th>
        </tr>
      </thead>
      <tbody>
        {rates.map((rate) => (
          <tr key={rate.shop} className="border-t border-[var(--color-border)]">
            {/* A shop name is unbounded user data in the narrowest column on a 360px screen —
                break-words, the same treatment the blend line on Home gets. */}
            <th scope="row" className="min-w-0 break-words py-2.5 text-left text-sm font-medium">
              {rate.shop}
            </th>
            <td className="tnum whitespace-nowrap py-2.5 text-right font-semibold">
              {formatSatang(rate.satang)}
            </td>
            <td className="tnum py-2.5 text-right text-sm text-[var(--color-muted)]">
              {number.format(rate.capsules)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- dashboard-view`
Expected: PASS — all three new tests plus every pre-existing test in the file.

- [ ] **Step 5: Run the full gates**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: all exit 0.

If `format:check` fails, run `npm run format` and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/components/DashboardView.tsx src/features/coffee/dashboard-view.test.tsx
git commit -m "feat(coffee): show every shop's per-capsule rate on the dashboard" -m "The dashboard named a cheapest shop without showing the field it won, so it could not answer by how much, how much you have bought there, or whether the shop you actually use is the expensive one — all of it already recorded on every order." -m "Ranked list replaces the Cheapest at row rather than sitting above it: a first row that IS the cheapest shop makes a separate row naming it duplication. Hidden entirely when no order names a shop. Two existing assertions were scoped rather than loosened — an unscoped columnheader count and a getByText that the new table's identical price would have made ambiguous."
```

---

## Self-Review

**Spec coverage.** `shopRates()` with all five documented rules → Task 1 Step 3. `costPerCapsule` delegation → Task 1 Step 3. All-time window → pinned in the comment and by reusing the existing all-time exclusion rules. Section placed third with matching chrome → Task 2 Step 3f. `<table>`, `tnum`, right-aligned figures, `break-words`, no row cap → Step 3g. Renders nothing when empty → Step 3f guard, tested. Single shop renders → tested. `Cheapest at` deleted, `HabitCost.cheapestShop` retained on the type → Step 3e. Every test-table row in the spec → Task 1 Step 1.

**Deviation from the spec, deliberate:** the spec did not specify sort behaviour at sub-satang precision. This plan sorts on the _rounded_ rate, which can reorder a knife-edge pair relative to the old `costPerCapsule` ranking. Rationale is in the code comment and pinned by a test.

**Type consistency.** `ShopRate` fields (`shop`, `satang`, `capsules`) are used identically in Task 1's tests, Task 1's implementation, and Task 2's `ShopTable`. `shopRates` takes `Pick<Movement, 'delta' | 'price' | 'shop'>[]` throughout, and Task 2 passes the full `Movement[]`, which satisfies it.

**Placeholders:** none. Every code step carries its code; every command carries its expected result.
