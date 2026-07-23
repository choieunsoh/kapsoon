# History Filter + Order Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-way type filter to the History view and let a mis-logged order be corrected by tapping its row.

**Architecture:** Filtering is a pure `useMemo` over the in-memory movement array — `useCoffee` already caches every row, so no SQL and no hook change. Editing adds one `UPDATE` to `db.ts`, one hook callback, and reuses the existing `AddOrderSheet` in an edit mode rather than cloning it.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5.9 · Tailwind v4 · Drizzle ORM over SQLocal (SQLite-WASM + OPFS) · Vitest (jsdom).

## Global Constraints

- **No `any`, no `as` casts** (`as const` is fine), **no `!` assertions**, **no `// @ts-*` comments**. `type` over `interface`. Prefer `for..of`.
- Money is always an **integer minor unit (satang)** — never a float.
- Figures render with the `.tnum` class (tabular-nums). Never a monospace font.
- Colors come from CSS custom properties (`var(--color-…)`), never hardcoded hex.
- The pure, node-safe logic lives in `db.ts` beside `stockLevel`/`countConsumed`/`totalSpent`; OPFS-touching code is never unit-tested (jsdom has no OPFS).
- Quality gates, all must pass: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
- Work happens on a feature branch, never directly on `main`.

## File Structure

| File                                               | Responsibility               | Change                                                      |
| -------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `src/features/coffee/db.ts`                        | data layer + pure reducers   | add `HistoryFilter`, `matchesFilter`, `updateOrder`         |
| `src/features/coffee/use-coffee.ts`                | React read-cache over the DB | add `editOrder` callback                                    |
| `src/features/coffee/components/HistoryView.tsx`   | the History screen           | filter state + control; own an edit sheet; route row clicks |
| `src/features/coffee/components/MovementRow.tsx`   | one log line                 | optional `onEdit`; text region becomes a button             |
| `src/features/coffee/components/AddOrderSheet.tsx` | order form sheet             | optional `movement` → prefill, retitle, relabel             |
| `src/features/coffee/coffee.test.ts`               | pure-logic unit tests        | add 2 tests                                                 |

---

## Task 0: Create the feature branch

- [ ] **Step 1: Branch off main**

```bash
cd H:/code/coffee-app
git checkout -b feat/history-filter-edit
```

- [ ] **Step 2: Confirm a clean tree on the new branch**

Run: `git status --short && git rev-parse --abbrev-ref HEAD`
Expected: no output from `git status --short`, then `feat/history-filter-edit`.

---

## Task 1: History type filter

**Files:**

- Modify: `src/features/coffee/db.ts` (append to the pure-reducers section, after `latestBlend`, before the `// ── Writes ──` banner)
- Modify: `src/features/coffee/components/HistoryView.tsx`
- Test: `src/features/coffee/coffee.test.ts`

**Interfaces:**

- Consumes: `Movement` (already exported from `db.ts`).
- Produces: `type HistoryFilter = 'all' | 'drinks' | 'orders'` and
  `matchesFilter(row: Pick<Movement, 'delta'>, filter: HistoryFilter): boolean`, both exported from `db.ts`. Task 4 does not use these.

- [ ] **Step 1: Write the failing test**

Add to the end of `src/features/coffee/coffee.test.ts`:

```ts
test('matchesFilter narrows the log by movement type', () => {
  const drink = { delta: -1 };
  const order = { delta: 10 };

  expect(matchesFilter(drink, 'all')).toBe(true);
  expect(matchesFilter(order, 'all')).toBe(true);

  expect(matchesFilter(drink, 'drinks')).toBe(true);
  expect(matchesFilter(order, 'drinks')).toBe(false);

  expect(matchesFilter(drink, 'orders')).toBe(false);
  expect(matchesFilter(order, 'orders')).toBe(true);
});
```

And add `matchesFilter` to the existing import block at the top of the file, keeping it alphabetical:

```ts
import {
  assertIntegerMinor,
  assertPositiveInt,
  countConsumed,
  isMovement,
  latestBlend,
  matchesFilter,
  stockLevel,
  totalSpent,
} from './db';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- coffee.test.ts`
Expected: FAIL — `matchesFilter` is not exported from `./db` (a TypeScript/import error, not an assertion failure).

- [ ] **Step 3: Implement the predicate**

In `src/features/coffee/db.ts`, insert immediately after the `latestBlend` function and before the `// ── Writes ──` banner comment:

```ts
// Which movements the History log shows. Drinks are negative deltas, orders positive — the same
// sign convention every reducer above relies on.
export type HistoryFilter = 'all' | 'drinks' | 'orders';

export function matchesFilter(row: Pick<Movement, 'delta'>, filter: HistoryFilter): boolean {
  if (filter === 'drinks') return row.delta < 0;
  if (filter === 'orders') return row.delta > 0;
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- coffee.test.ts`
Expected: PASS — all tests green, including the new `matchesFilter` case.

- [ ] **Step 5: Wire the filter into HistoryView**

In `src/features/coffee/components/HistoryView.tsx`, change the import of `db` types from:

```ts
import type { Movement } from '../db';
```

to:

```ts
import { matchesFilter, type HistoryFilter, type Movement } from '../db';
```

Then, inside `HistoryView`, add the filter state next to the existing `editing` state:

```ts
const [filter, setFilter] = useState<HistoryFilter>('all');
```

Replace the existing `groups` memo:

```ts
const groups = useMemo(() => groupByDay(movements), [movements]);
```

with a filtered one:

```ts
// Totals above stay all-time on purpose; only the log narrows.
const visible = useMemo(
  () => movements.filter((m) => matchesFilter(m, filter)),
  [movements, filter],
);
const groups = useMemo(() => groupByDay(visible), [visible]);
```

- [ ] **Step 6: Add the segmented control and an empty state for the filter**

Still in `HistoryView.tsx`, insert the control between the stats grid and the log — i.e. directly after the closing `</div>` of the `grid grid-cols-3` block and before the `{/* Full log, grouped by day */}` comment:

```tsx
{
  /* Type filter. Narrows the log only — the totals above remain all-time. */
}
<div
  role="group"
  aria-label="Filter history"
  className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-1"
>
  <FilterTab label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
  <FilterTab label="Drinks" active={filter === 'drinks'} onClick={() => setFilter('drinks')} />
  <FilterTab label="Orders" active={filter === 'orders'} onClick={() => setFilter('orders')} />
</div>;
```

Then replace the log block so an empty filter result reads as a filter result, not as an empty app. Replace this entire block:

```tsx
{
  /* Full log, grouped by day */
}
<div className="flex flex-col gap-5">
  {groups.map((group) => (
    <div key={group.key}>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
        {formatDayLabel(group.at)}
      </h2>
      <ul className="flex flex-col gap-2">
        {group.rows.map((m) => (
          <MovementRow key={m.id} movement={m} onEditTime={setEditing} onDelete={removeMovement} />
        ))}
      </ul>
    </div>
  ))}
</div>;
```

with:

```tsx
{
  /* Full log, grouped by day. An empty result here means the FILTER matched nothing — the
          "nothing logged yet" early return above already covers a genuinely empty app. */
}
{
  visible.length === 0 ? (
    <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center text-sm text-[var(--color-muted)]">
      No {filter === 'drinks' ? 'drinks' : 'orders'} logged yet.
    </p>
  ) : (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.key}>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
            {formatDayLabel(group.at)}
          </h2>
          <ul className="flex flex-col gap-2">
            {group.rows.map((m) => (
              <MovementRow
                key={m.id}
                movement={m}
                onEditTime={setEditing}
                onDelete={removeMovement}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

Finally add the `FilterTab` component at the bottom of the file, next to the existing `Stat` component:

```tsx
function FilterTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-[var(--radius-sm)] py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-[var(--color-surface-2)] text-[var(--color-text)]'
          : 'text-[var(--color-muted)]'
      }`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 7: Verify the gates pass**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all four pass. If `format:check` fails, run `npm run format` and re-check.

- [ ] **Step 8: Commit**

```bash
git add src/features/coffee/db.ts src/features/coffee/components/HistoryView.tsx src/features/coffee/coffee.test.ts
git commit -m "feat(history): filter the log by movement type" -m "The log rendered every movement with no way to narrow it. A 3-way All/Drinks/Orders control filters it in memory - useCoffee already caches every row, so no SQL is involved." -m "Totals stay all-time deliberately: recomputing them per filter would render a confusing 'Spent 0' on the Drinks tab." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `updateOrder` write + `editOrder` hook callback

**Files:**

- Modify: `src/features/coffee/db.ts` (in the Writes section, after `updateMovementTime`)
- Modify: `src/features/coffee/use-coffee.ts`
- Test: `src/features/coffee/coffee.test.ts`

**Interfaces:**

- Consumes: `assertPositiveInt`, `assertIntegerMinor`, `getDb`, `movementsTable`, `eq` — all already present in `db.ts`.
- Produces:
  - `updateOrder(id: string, shop: string, brand: string, beanName: string, quantity: number, price: number): Promise<void>` exported from `db.ts`.
  - `editOrder(id: string, shop: string, brand: string, beanName: string, quantity: number, price: number): Promise<void>` returned from `useCoffee()`. Task 4 calls this.

- [ ] **Step 1: Write the failing test**

Add to the end of `src/features/coffee/coffee.test.ts`:

```ts
// updateOrder touches OPFS, so only its guards are unit-testable here — they run before getDb().
test('updateOrder rejects a non-positive/fractional quantity and a float price', async () => {
  await expect(updateOrder('id', 'Shopee', '', '', 0, 45000)).rejects.toThrow();
  await expect(updateOrder('id', 'Shopee', '', '', 2.5, 45000)).rejects.toThrow();
  await expect(updateOrder('id', 'Shopee', '', '', 10, 12.5)).rejects.toThrow();
  await expect(updateOrder('id', 'Shopee', '', '', 10, -1)).rejects.toThrow();
});
```

Add `updateOrder` to the same import block from `./db`, keeping it alphabetical (after `totalSpent`):

```ts
import {
  assertIntegerMinor,
  assertPositiveInt,
  countConsumed,
  isMovement,
  latestBlend,
  matchesFilter,
  stockLevel,
  totalSpent,
  updateOrder,
} from './db';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- coffee.test.ts`
Expected: FAIL — `updateOrder` is not exported from `./db`.

- [ ] **Step 3: Implement `updateOrder`**

In `src/features/coffee/db.ts`, insert directly after the `updateMovementTime` function:

```ts
// Correct a mis-logged order in place. Editing `delta` retroactively fixes stock for free — the
// balance is a running sum, so there is nothing else to recompute. This can push stock negative if
// the capsules were already drunk; for a single-user log that reads as the correction it is.
export async function updateOrder(
  id: string,
  shop: string,
  brand: string,
  beanName: string,
  quantity: number,
  price: number,
): Promise<void> {
  assertPositiveInt(quantity);
  assertIntegerMinor(price);
  const db = await getDb();
  await db
    .update(movementsTable)
    .set({ shop, brand, beanName, delta: quantity, price })
    .where(eq(movementsTable.id, id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- coffee.test.ts`
Expected: PASS — the guards throw before `getDb()` is ever reached, so no worker starts.

- [ ] **Step 5: Add the `editOrder` callback**

In `src/features/coffee/use-coffee.ts`, add `updateOrder as dbUpdateOrder` to the import block from `./db`, keeping it alphabetical among the other aliased writes:

```ts
import {
  addOrder as dbAddOrder,
  consumeOne as dbConsumeOne,
  deleteMovement as dbDeleteMovement,
  updateMovementTime as dbUpdateMovementTime,
  updateOrder as dbUpdateOrder,
  countConsumed,
  importMovements,
  latestBlend,
  listMovements,
  seedIfEmpty,
  stockLevel,
  totalSpent,
  type Movement,
} from './db';
```

Then add the callback directly after the existing `editMovementTime` callback:

```ts
// Same validate-then-write-then-refresh shape as addOrder: bad input is dropped before it can
// reach SQLite, and the refresh re-derives stock/blend/totals from the corrected row.
const editOrder = useCallback(
  async (
    id: string,
    shop: string,
    brand: string,
    beanName: string,
    quantity: number,
    price: number,
  ) => {
    if (shop.trim() === '' || !Number.isInteger(quantity) || quantity < 1) return;
    await dbUpdateOrder(id, shop.trim(), brand.trim(), beanName.trim(), quantity, price);
    await refresh();
  },
  [refresh],
);
```

And add `editOrder` to the returned object, after `editMovementTime`:

```ts
    removeMovement,
    editMovementTime,
    editOrder,
    restore,
```

- [ ] **Step 6: Verify the gates pass**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all four pass. If `format:check` fails, run `npm run format` and re-check.

- [ ] **Step 7: Commit**

```bash
git add src/features/coffee/db.ts src/features/coffee/use-coffee.ts src/features/coffee/coffee.test.ts
git commit -m "feat(coffee): add updateOrder write and editOrder callback" -m "Correcting a mis-logged order previously meant deleting the row and retyping it. This adds the UPDATE behind the same assertPositiveInt/assertIntegerMinor guards addOrder uses." -m "Editing delta needs no stock recalculation: the balance is a running sum, so a corrected quantity re-derives it." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Edit mode for `AddOrderSheet`

**Files:**

- Modify: `src/features/coffee/components/AddOrderSheet.tsx`

**Interfaces:**

- Consumes: `Movement` from `../db`; `parseBahtToSatang` from `../money` (already imported).
- Produces: `AddOrderSheet` gains an optional `movement?: Movement | null` prop. When non-null the sheet prefills from that movement, titles itself "Edit order", and labels the submit button "Save". `onSubmit` keeps its existing signature `(shop, brand, beanName, quantity, price) => Promise<void>` — the caller in Task 4 closes over the row id.

- [ ] **Step 1: Add the prop to the type**

In `src/features/coffee/components/AddOrderSheet.tsx`, add the `Movement` type import below the existing React import:

```ts
import type { Movement } from '../db';
```

Then extend the `Props` type:

```ts
type Props = {
  open: boolean;
  // When set, the sheet edits this order instead of creating a new one: fields prefill from it and
  // the title/submit label change. The caller supplies an onSubmit closed over the row's id.
  movement?: Movement | null;
  onClose: () => void;
  onSubmit: (
    shop: string,
    brand: string,
    beanName: string,
    quantity: number,
    price: number,
  ) => Promise<void>;
};
```

- [ ] **Step 2: Destructure the prop and derive the mode**

Change the component signature from:

```ts
export function AddOrderSheet({ open, onClose, onSubmit }: Props) {
```

to:

```ts
export function AddOrderSheet({ open, movement, onClose, onSubmit }: Props) {
```

and add this line directly after the `saving` state declaration:

```ts
const editing = movement != null;
```

- [ ] **Step 3: Prefill on open**

Add this effect directly after the existing effect that drives `showModal()`/`close()`:

```ts
// Reset or prefill whenever the sheet opens. `toFixed(2)` (not Intl) on purpose: this value feeds
// an inputMode="decimal" field that parseBahtToSatang must be able to read back, and a formatted
// "฿450.00" with a currency symbol and separators would not parse.
useEffect(() => {
  if (!open) return;
  if (movement) {
    setShop(movement.shop);
    setBrand(movement.brand);
    setBeanName(movement.beanName);
    setQuantity(String(movement.delta));
    setPriceInput((movement.price / 100).toFixed(2));
  } else {
    setShop('');
    setBrand('');
    setBeanName('');
    setQuantity('');
    setPriceInput('');
  }
  setError('');
}, [open, movement]);
```

- [ ] **Step 4: Retitle and relabel**

Change the heading from:

```tsx
<h2 id={`${uid}-title`} className="mb-4 text-lg font-semibold">
  Add an order
</h2>
```

to:

```tsx
<h2 id={`${uid}-title`} className="mb-4 text-lg font-semibold">
  {editing ? 'Edit order' : 'Add an order'}
</h2>
```

and the submit button's label from:

```tsx
{
  saving ? 'Saving…' : 'Add order';
}
```

to:

```tsx
{
  saving ? 'Saving…' : editing ? 'Save' : 'Add order';
}
```

- [ ] **Step 5: Verify the gates pass**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all four pass. Existing callers pass no `movement`, so the optional prop is a no-op for them.

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/components/AddOrderSheet.tsx
git commit -m "feat(order): let AddOrderSheet edit an existing order" -m "The sheet already renders exactly the five fields an order edit needs. An optional movement prop prefills it and switches the title/submit label, so editing reuses this form instead of cloning a second 180-line sheet that would drift." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Click a row to edit

**Files:**

- Modify: `src/features/coffee/components/MovementRow.tsx`
- Modify: `src/features/coffee/components/HistoryView.tsx`

**Interfaces:**

- Consumes: `editOrder` from `useCoffee()` (Task 2); `AddOrderSheet`'s `movement` prop (Task 3).
- Produces: `MovementRow` gains an optional `onEdit?: (movement: Movement) => void`. Nothing consumes this afterwards.

- [ ] **Step 1: Add the `onEdit` prop to MovementRow**

In `src/features/coffee/components/MovementRow.tsx`, extend the `Props` type:

```ts
type Props = {
  movement: Movement;
  // When provided, the row shows edit-time / delete actions (History). Omit for a read-only row.
  onEditTime?: (movement: Movement) => void;
  onDelete?: (id: string) => void;
  // When provided, the row's text region becomes a button that opens the right editor for this
  // movement. Deliberately a SIBLING of the icon buttons below, not a wrapper: nesting them inside
  // a button is invalid HTML and announces as one confused control instead of three.
  onEdit?: (movement: Movement) => void;
};
```

and the destructure:

```ts
export function MovementRow({ movement, onEditTime, onDelete, onEdit }: Props) {
```

- [ ] **Step 2: Make the text region interactive**

Replace the whole text block — currently:

```tsx
<div className="min-w-0 flex-1">
  <p className="truncate font-medium">{isOrder ? movement.shop || 'Order' : 'Drank a coffee'}</p>
  {isOrder && subtitle ? (
    <p className="truncate text-xs text-[var(--color-faint)]">{subtitle}</p>
  ) : null}
</div>
```

with a single definition of the text wrapped in whichever element the row needs. Declare the fragment just above the `return` (after the `actionable` line):

```tsx
// Defined once and wrapped below in a <button> or a <div>. Spans, not <p>: a <p> is not valid
// inside a <button>, and only one of these two wrappers may exist per row.
const text = (
  <>
    <span className="block truncate font-medium">
      {isOrder ? movement.shop || 'Order' : 'Drank a coffee'}
    </span>
    {isOrder && subtitle ? (
      <span className="block truncate text-xs text-[var(--color-faint)]">{subtitle}</span>
    ) : null}
  </>
);
```

then render it as:

```tsx
{
  onEdit ? (
    <button type="button" onClick={() => onEdit(movement)} className="min-w-0 flex-1 text-left">
      {text}
    </button>
  ) : (
    <div className="min-w-0 flex-1">{text}</div>
  );
}
```

- [ ] **Step 3: Route row clicks in HistoryView**

In `src/features/coffee/components/HistoryView.tsx`, pull `editOrder` out of the hook. Change:

```ts
const { movements, removeMovement, editMovementTime } = coffee;
```

to:

```ts
const { movements, removeMovement, editMovementTime, editOrder } = coffee;
```

Add state for the order being edited, next to the existing `editing` state:

```ts
const [editingOrder, setEditingOrder] = useState<Movement | null>(null);
```

Add the click router directly after the `groups` memo:

```ts
// A drink has exactly one editable field, so it routes to the time dialog. An order opens the
// full sheet; its time stays with the clock icon, same as a drink's.
function openEditor(m: Movement) {
  if (m.delta > 0) setEditingOrder(m);
  else setEditing(m);
}
```

- [ ] **Step 4: Pass `onEdit` to the rows and render the edit sheet**

Still in `HistoryView.tsx`, add the prop to the `MovementRow` usage (note the indentation is one level deeper than before Task 1, which nested this block inside a ternary):

```tsx
<MovementRow
  key={m.id}
  movement={m}
  onEdit={openEditor}
  onEditTime={setEditing}
  onDelete={removeMovement}
/>
```

Import the sheet alongside the existing component imports:

```ts
import { AddOrderSheet } from './AddOrderSheet';
```

and render it directly after the existing `<EditTimeDialog … />`:

```tsx
<AddOrderSheet
  open={editingOrder !== null}
  movement={editingOrder}
  onClose={() => setEditingOrder(null)}
  onSubmit={async (shop, brand, beanName, quantity, price) => {
    if (editingOrder) await editOrder(editingOrder.id, shop, brand, beanName, quantity, price);
  }}
/>
```

- [ ] **Step 5: Verify the gates pass**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: all five pass. If `format:check` fails, run `npm run format` and re-check.

- [ ] **Step 6: Verify the behavior in the running app**

Run: `npm run dev`, open the app, go to History, then check each of:

- The All / Drinks / Orders control narrows the log; the three stat tiles do **not** change.
- Selecting Drinks or Orders with no matching rows shows the "No … logged yet." message.
- Tapping an **order** row's text opens the sheet titled "Edit order" with every field prefilled and the button reading "Save". Changing the quantity and saving updates both the row and the stock number in the header.
- Tapping a **drink** row's text opens the "Edit time" dialog.
- The clock and trash icons still work, and the trash still asks Cancel/Delete before removing.

- [ ] **Step 7: Commit**

```bash
git add src/features/coffee/components/MovementRow.tsx src/features/coffee/components/HistoryView.tsx
git commit -m "feat(history): tap a row to edit it" -m "Orders open the prefilled order sheet, drinks open the time dialog - a drink has only one editable field. The clock icon keeps owning the timestamp for both, so there is never a second control for one value." -m "The text region is a button that is a sibling of the icon buttons, not a wrapper: nesting interactive controls inside a button is invalid HTML and announces as one control instead of three." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria

- History has a working All / Drinks / Orders filter; the stat tiles stay all-time.
- Tapping an order row edits all five of its fields; tapping a drink row edits its time.
- Delete confirmation is unchanged and still works.
- `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build` all pass.
- Four commits on `feat/history-filter-edit` — one per task; Task 0 only creates the branch.
