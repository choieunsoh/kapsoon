# App-icon Badge + Order-form Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show capsules-left on the installed PWA's home-screen icon, and add native autocomplete to the order form so shop/brand/bean typos stop fragmenting the Dashboard's cheapest-shop ranking.

**Architecture:** Two independent, no-schema-change features. The badge is a navigator-guarded helper in `db.ts` called from the single `refresh()` point in `use-coffee.ts`. Autocomplete is a pure `orderSuggestions()` reducer in `stats.ts` feeding three native `<datalist>`s in `AddOrderSheet`, fed the `movements` array already in memory at the call site.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Vitest, the Web Badging API (`navigator.setAppBadge`/`clearAppBadge`), native HTML `<datalist>`.

## Global Constraints

- TypeScript house bans: no `any`, no `as` (except `as const`), no `!`, no `// @ts-*`. `type` over `interface`. Prefer `for..of`.
- Money is integer satang — not touched here, but don't introduce floats.
- Device/navigator helpers are guarded (`typeof navigator !== 'undefined'` + feature check) and swallow errors — an unsupported browser is a weaker guarantee, not an error. Mirror `requestPersistence()` in `db.ts`.
- Pure reducers in `stats.ts` take plain rows, return values, no React/DB/async/throws — testable with array literals.
- All quality gates must pass: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`.
- Tests use Vitest (`import { expect, test } from 'vitest'`), one behavior-named `test(...)` per case, following the existing `stats.test.ts` style.

---

### Task 1: `setStockBadge` device helper

**Files:**

- Modify: `src/features/coffee/db.ts` (add after `isStoragePersisted`, ~line 329, alongside the other navigator-guarded helpers)

**Interfaces:**

- Consumes: nothing.
- Produces: `export async function setStockBadge(count: number): Promise<void>` — sets the app-icon badge to `count` when `count > 0`, clears it otherwise; guarded and error-swallowing.

- [ ] **Step 1: Write the implementation**

Add to `src/features/coffee/db.ts` after `isStoragePersisted`:

```typescript
// Paint the current capsule count on the installed PWA's home-screen icon (Web Badging API). This
// is the only thing that reaches the user while the app is closed, which is the whole point of the
// runway — so a healthy stash shows a number and an empty one clears the badge rather than showing
// 0. Guarded + fire-and-forget like requestPersistence: the API is absent on desktop/older webviews
// and setAppBadge can reject, and a missing badge is a weaker guarantee, not an error. The badge is
// only ever as fresh as the last log, because nothing runs while the app is closed — correct, since
// stock only changes when you log a cup or an order, both of which route through refresh().
export async function setStockBadge(count: number): Promise<void> {
  if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return;
  try {
    if (count > 0) {
      await navigator.setAppBadge(count);
    } else {
      await navigator.clearAppBadge();
    }
  } catch {
    // No badge available (unsupported, or the tab isn't an installed PWA) — carry on.
  }
}
```

- [ ] **Step 2: Verify types and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (`navigator.setAppBadge`/`clearAppBadge` are in the TS DOM lib; if typecheck reports them missing, that's a real signal the lib target excludes them — stop and report rather than casting.)

- [ ] **Step 3: Commit**

```bash
git add src/features/coffee/db.ts
git commit -m "feat(coffee): add setStockBadge Web Badging helper"
```

---

### Task 2: Call `setStockBadge` from `refresh()`

**Files:**

- Modify: `src/features/coffee/use-coffee.ts:5-22` (import), `:45-55` (`refresh`)

**Interfaces:**

- Consumes: `setStockBadge(count)` from Task 1; `stockLevel(rows)` (already imported).
- Produces: nothing new — `refresh()` keeps its signature.

- [ ] **Step 1: Add the import**

In `src/features/coffee/use-coffee.ts`, add `setStockBadge,` to the existing named import from `./db` (alphabetical order puts it after `seedIfEmpty,`):

```typescript
  seedIfEmpty,
  setStockBadge,
  stockLevel,
```

- [ ] **Step 2: Call it at the end of `refresh`**

`refresh` already computes `stockLevel(rows)` and passes it to `setStock`. Capture it once and badge it. Replace the `setStock(stockLevel(rows));` line with:

```typescript
const stock = stockLevel(rows);
setStock(stock);
```

and add, as the last statement inside the `refresh` callback (after `setBackup(...)`):

```typescript
// Fire-and-forget: keep the icon badge in sync with the stash on every write. Not awaited —
// the UI must not wait on a home-screen paint, and setStockBadge swallows its own failures.
void setStockBadge(stock);
```

- [ ] **Step 3: Verify types, lint, tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. Existing tests don't exercise the badge (jsdom has no `setAppBadge`, so the guard early-returns); nothing should break.

- [ ] **Step 4: Commit**

```bash
git add src/features/coffee/use-coffee.ts
git commit -m "feat(coffee): badge the app icon with capsules left on every refresh"
```

---

### Task 3: `orderSuggestions` pure reducer

**Files:**

- Modify: `src/features/coffee/stats.ts` (add at end of file)
- Test: `src/features/coffee/stats.test.ts` (add one `test(...)`)

**Interfaces:**

- Consumes: `Movement` type (already imported in `stats.ts` as `type Movement`).
- Produces: `export type OrderSuggestions = { shops: string[]; brands: string[]; beans: string[] }` and `export function orderSuggestions(rows: Pick<Movement, 'delta' | 'shop' | 'brand' | 'beanName'>[]): OrderSuggestions` — distinct, non-empty, locale-sorted values drawn from order rows (`delta > 0`) only.

- [ ] **Step 1: Write the failing test**

Add to `src/features/coffee/stats.test.ts`. Add `orderSuggestions,` to the existing import from `./stats`, then:

```typescript
test('orderSuggestions returns distinct sorted values from orders only', () => {
  const order = (shop: string, brand: string, beanName: string) => ({
    delta: 10,
    shop,
    brand,
    beanName,
  });
  const drink = { delta: -1, shop: '', brand: '', beanName: '' };

  const rows = [
    order('7-Eleven', 'Nescafe', 'House Blend'),
    order('Amazon', 'Nescafe', 'Crema'),
    order('7-Eleven', 'Bosch', ''), // repeat shop, empty bean
    drink, // drinks contribute nothing
  ];

  expect(orderSuggestions(rows)).toEqual({
    shops: ['7-Eleven', 'Amazon'],
    brands: ['Bosch', 'Nescafe'],
    beans: ['Crema', 'House Blend'],
  });

  // Empty log → three empty lists, never undefined.
  expect(orderSuggestions([])).toEqual({ shops: [], brands: [], beans: [] });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- stats.test.ts`
Expected: FAIL — `orderSuggestions is not a function` (or an import error).

- [ ] **Step 3: Write the implementation**

Add at the end of `src/features/coffee/stats.ts`:

```typescript
export type OrderSuggestions = {
  shops: string[];
  brands: string[];
  beans: string[];
};

// Distinct, non-empty, locale-sorted shop/brand/bean values seen on past ORDERS — the option lists
// behind the order form's <datalist> autocomplete. Orders only (delta > 0): a drink carries no
// shop/brand/bean, and its empty strings would just be filtered out anyway. Deduping here is the
// actual point of the feature: costPerCapsule groups shops by exact string, so surfacing the
// spelling you already used stops "7-11" and "7-Eleven" ranking as two shops.
export function orderSuggestions(
  rows: Pick<Movement, 'delta' | 'shop' | 'brand' | 'beanName'>[],
): OrderSuggestions {
  const shops = new Set<string>();
  const brands = new Set<string>();
  const beans = new Set<string>();
  for (const m of rows) {
    if (m.delta <= 0) continue;
    if (m.shop !== '') shops.add(m.shop);
    if (m.brand !== '') brands.add(m.brand);
    if (m.beanName !== '') beans.add(m.beanName);
  }
  const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return { shops: sorted(shops), brands: sorted(brands), beans: sorted(beans) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/stats.ts src/features/coffee/stats.test.ts
git commit -m "feat(coffee): add orderSuggestions reducer for order autocomplete"
```

---

### Task 4: Wire `<datalist>` autocomplete into `AddOrderSheet`

**Files:**

- Modify: `src/features/coffee/components/AddOrderSheet.tsx` (props, derive suggestions, three inputs + datalists)
- Modify: `src/features/coffee/components/Coffee.tsx:58` (pass `movements`)

**Interfaces:**

- Consumes: `orderSuggestions(rows)` / `OrderSuggestions` from Task 3; `Movement` (already imported in `AddOrderSheet`).
- Produces: `AddOrderSheet` gains a required `movements: Movement[]` prop.

- [ ] **Step 1: Add the `movements` prop**

In `src/features/coffee/components/AddOrderSheet.tsx`, add to the `Props` type (after `movement?`):

```typescript
  // Past movements, for order-field autocomplete. Passed in (not queried) because the parent
  // already holds the full list — see Coffee.tsx.
  movements: Movement[];
```

Update the destructure in the component signature:

```typescript
export function AddOrderSheet({ open, movement, movements, onClose, onSubmit }: Props) {
```

- [ ] **Step 2: Import the reducer and derive suggestions**

Add to the top-of-file imports:

```typescript
import { orderSuggestions } from '../stats';
```

Inside the component, after `const editing = movement != null;` (~line 39):

```typescript
// Derived every render — the list is tiny (distinct shops/brands/beans) and recomputing it is
// cheaper than a memo's bookkeeping. Native <datalist> filters as the user types; no JS.
const suggestions = orderSuggestions(movements);
```

- [ ] **Step 3: Wire the three text inputs to datalists**

For the **shop** input (~line 121), add `list={`${uid}-shops`}` and render a datalist beside it. Replace the shop `<input>` block:

```tsx
          <input
            id={`${uid}-shop`}
            list={`${uid}-shops`}
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            placeholder="e.g. Amazon"
            autoComplete="off"
            className={fieldClass}
          />
          <datalist id={`${uid}-shops`}>
            {suggestions.shops.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
```

For the **brand** input (~line 136), replace with:

```tsx
            <input
              id={`${uid}-brand`}
              list={`${uid}-brands`}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Starbucks"
              autoComplete="off"
              className={fieldClass}
            />
            <datalist id={`${uid}-brands`}>
              {suggestions.brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
```

For the **bean** input (~line 149), replace with:

```tsx
            <input
              id={`${uid}-bean`}
              list={`${uid}-beans`}
              value={beanName}
              onChange={(e) => setBeanName(e.target.value)}
              placeholder="House Blend"
              autoComplete="off"
              className={fieldClass}
            />
            <datalist id={`${uid}-beans`}>
              {suggestions.beans.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
```

- [ ] **Step 4: Pass `movements` at the call site**

In `src/features/coffee/components/Coffee.tsx:58`, add the prop:

```tsx
<AddOrderSheet
  open={addOpen}
  movements={coffee.movements}
  onClose={() => setAddOpen(false)}
  onSubmit={coffee.addOrder}
/>
```

- [ ] **Step 5: Verify types, lint, format, tests, build**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: PASS. If `format:check` flags the edited files, run `npm run format` and re-check.

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/components/AddOrderSheet.tsx src/features/coffee/components/Coffee.tsx
git commit -m "feat(coffee): autocomplete order fields from past orders via datalist"
```

---

### Task 5: Manual verification on device

**Files:** none (verification only).

- [ ] **Step 1: Run the app on the phone over LAN**

Run: `npm run dev -- -H 0.0.0.0`, open the LAN URL on the phone, install to home screen.

- [ ] **Step 2: Verify the badge**

Log a cup or confirm existing stock, background the app. Expected: the home-screen icon shows the capsule count. Drink down to 0 stock (or check an out-of-stock DB) → the badge clears. (Android/Chrome installed PWA; desktop and iOS may not show it — that's the documented limit, not a failure.)

- [ ] **Step 3: Verify autocomplete**

Open Add Order, focus Shop → past shops appear as suggestions; typing filters them. Same for Brand and Bean. A brand-new value is still typeable. Confirm on the Dashboard that reusing a suggested shop keeps "Cheapest at" grouped rather than split.

- [ ] **Step 4: Update the branch / open PR**

Per project convention, confirm with the user before pushing/PR.

---

## Self-Review

**Spec coverage:**

- Feature 1 (badge helper + call in refresh) → Tasks 1, 2. ✓
- Feature 2 (`orderSuggestions` reducer + `<datalist>` wiring + call-site prop) → Tasks 3, 4. ✓
- Testing (unit test for `orderSuggestions`; `setStockBadge` covered by the light navigator-guard touch, no dedicated test) → Task 3 test; Task 1 relies on typecheck/lint, matching `requestPersistence`. ✓
- Deliberate limits (badge fresh-as-of-last-log; autocomplete narrows not eliminates typos) → documented in code comments (Task 1, Task 3). ✓
- Out-of-scope items (push notifications, prefill-last-order, DB typo normalization, closed vocabulary) → not implemented, correct. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows complete code. ✓

**Type consistency:** `setStockBadge(count: number): Promise<void>` used identically in Tasks 1–2. `orderSuggestions(rows): OrderSuggestions` with `{ shops, brands, beans }` used identically in Tasks 3–4. `movements: Movement[]` prop defined in Task 4 Step 1, passed in Step 4. ✓
