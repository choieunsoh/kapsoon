# History Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the History log from a 606-row / 53-screen wall into a scannable day-by-day record by collapsing repeated drinks into one row per day, adding text search over orders, making the totals answer to the filter, and fixing every P0/P1/P2 from the 2026-07-21 critique.

**Architecture:** Everything stays in memory. `useCoffee` already caches every movement, so the collapse, the search, and the totals are pure functions over that array — no SQL, no schema change, no hook change. The three new pure reducers live in `db.ts` beside `stockLevel`/`countConsumed`/`totalSpent` so Vitest can assert them without OPFS. `HistoryView` gains two pieces of local state (search query, days shown) and one local sub-component for the collapsed drink row; `MovementRow` is only touched for the touch-target, delta, and aria-live fixes.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5.9 · Tailwind v4 · Drizzle ORM over SQLocal (SQLite-WASM + OPFS) · Vitest (jsdom).

## Global Constraints

- **No `any`, no `as` casts** (`as const` is fine), **no `!` assertions**, **no `// @ts-*` comments**. `type` over `interface`. Prefer `for..of`.
- Money is always an **integer minor unit (satang)** — never a float.
- Figures render with the `.tnum` class (tabular-nums). Never a monospace font.
- Colors come from CSS custom properties (`var(--color-…)`), never hardcoded hex.
- All date/number formatting goes through `Intl` — never string slicing, `.split('T')[0]`, or manual zero-padding.
- The pure, node-safe logic lives in `db.ts`; OPFS-touching code is never unit-tested (jsdom has no OPFS).
- Interactive targets clear **44×44px** — both dimensions. `min-height` alone does not satisfy this.
- Quality gates, all must pass: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
- Work happens on a feature branch, never directly on `main`.

## Critique Coverage

Each issue from `.impeccable/critique/2026-07-21T01-51-14Z__src-features-coffee-components-historyview-tsx.md` maps to a task:

| Severity | Issue                                                               | Task                                        |
| -------- | ------------------------------------------------------------------- | ------------------------------------------- |
| P0       | 606 rows / 9,044 DOM nodes / 53 screens, no ceiling and no entrance | 1, 3                                        |
| P1       | Repeated drinks render one per row (longest run: 11)                | 1, 3                                        |
| P1       | No retrieval path — 9 orders buried in 606 rows                     | 1, 3                                        |
| P1       | Touch targets are 36×44px, not 44×44                                | 2                                           |
| P1       | Totals row ignores the filter                                       | 1, 3                                        |
| P2       | Only view that ignores `ready`                                      | 3                                           |
| P2       | Confirm-delete swap is silent to screen readers                     | 2                                           |
| P2       | Filter result count never announced                                 | 3                                           |
| P2       | `-1` column is constant noise on 98% of rows                        | 2                                           |
| P2       | Day headers on orders produce single-row groups                     | 1 (collapse makes every group carry weight) |
| P2       | 127 `<h2>` with no heading naming the view                          | 3                                           |

**Deliberately deferred** (P3, out of the agreed scope): the free-text shop field that produced `VVIP LUXURY` / `VVIP LUXERY` in production data needs a `<datalist>` in `AddOrderSheet.tsx` — a different file and a different feature. Undo-after-delete is also out: the row already has a two-step confirm, and a real undo needs a toast/snackbar system this app does not have.

## File Structure

| File                                             | Responsibility               | Change                                                                                                                               |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/features/coffee/db.ts`                      | data layer + pure reducers   | add `DayEntry`, `buildDayEntries`, `matchesSearch`, `historyTotals`                                                                  |
| `src/features/coffee/components/icons.tsx`       | inline SVG icons             | add `ChevronDownIcon`, `SearchIcon`                                                                                                  |
| `src/features/coffee/components/MovementRow.tsx` | one log line                 | 44×44 targets; drop the constant `-1`; announce the confirm swap                                                                     |
| `src/features/coffee/components/HistoryView.tsx` | the History screen           | `ready` guard, search field, collapsed drink days, progressive "show older", filter-aware totals, heading structure, `role="status"` |
| `src/features/coffee/coffee.test.ts`             | pure-logic unit tests        | add 5 tests                                                                                                                          |
| `src/features/coffee/history-view.test.tsx`      | component tests for the view | new file, 9 tests                                                                                                                    |

---

## Task 0: Create the feature branch

- [ ] **Step 1: Branch off main**

```bash
git checkout -b feat/history-redesign
```

- [ ] **Step 2: Confirm a clean tree on the new branch**

Run: `git status --short && git rev-parse --abbrev-ref HEAD`
Expected: no output from `git status --short`, then `feat/history-redesign`.

---

## Task 1: The three pure reducers

**Files:**

- Modify: `src/features/coffee/db.ts` (append to the pure-reducers section, directly after `matchesFilter`, before the `// ── Writes ──` banner)
- Test: `src/features/coffee/coffee.test.ts`

**Interfaces:**

- Consumes: `Movement` (already exported from `db.ts`).
- Produces, all exported from `db.ts` — Tasks 2 and 3 rely on these exact names and shapes:
  - `type DayEntry = { kind: 'drinks'; cups: number; from: number; to: number; movements: Movement[] } | { kind: 'order'; movement: Movement }`
  - `buildDayEntries(rows: Movement[]): DayEntry[]`
  - `matchesSearch(row: Pick<Movement, 'shop' | 'brand' | 'beanName' | 'delta'>, query: string): boolean`
  - `historyTotals(rows: Pick<Movement, 'delta' | 'price'>[]): { cups: number; spent: number; orders: number }`

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/features/coffee/coffee.test.ts`:

```ts
test('buildDayEntries collapses a day of drinks into one entry and keeps orders separate', () => {
  // Newest-first, exactly as listMovements returns them.
  const rows = [
    { id: 'd3', shop: '', brand: '', beanName: '', delta: -1, price: 0, at: 500 },
    {
      id: 'o1',
      shop: 'Shopee',
      brand: 'Nespresso',
      beanName: 'Ristretto',
      delta: 10,
      price: 45000,
      at: 400,
    },
    { id: 'd2', shop: '', brand: '', beanName: '', delta: -1, price: 0, at: 300 },
    { id: 'd1', shop: '', brand: '', beanName: '', delta: -1, price: 0, at: 200 },
  ];

  const entries = buildDayEntries(rows);

  // One drinks entry (placed where the newest drink was) plus the order — not four rows.
  expect(entries.length).toBe(2);

  const first = entries[0];
  if (first?.kind !== 'drinks') throw new Error('expected the first entry to be the drinks entry');
  expect(first.cups).toBe(3);
  expect(first.from).toBe(200); // earliest drink
  expect(first.to).toBe(500); // latest drink
  expect(first.movements.length).toBe(3);

  const second = entries[1];
  if (second?.kind !== 'order') throw new Error('expected the second entry to be the order');
  expect(second.movement.id).toBe('o1');
});

test('buildDayEntries counts multi-cup drinks and handles a day with no drinks', () => {
  const twoCupsAtOnce = [
    { id: 'd1', shop: '', brand: '', beanName: '', delta: -2, price: 0, at: 100 },
  ];
  const collapsed = buildDayEntries(twoCupsAtOnce)[0];
  if (collapsed?.kind !== 'drinks') throw new Error('expected a drinks entry');
  expect(collapsed.cups).toBe(2);

  const ordersOnly = [
    { id: 'o1', shop: 'Shopee', brand: '', beanName: '', delta: 10, price: 45000, at: 100 },
  ];
  expect(buildDayEntries(ordersOnly).every((e) => e.kind === 'order')).toBe(true);
  expect(buildDayEntries([]).length).toBe(0);
});

test('matchesSearch matches orders on shop/brand/bean and excludes drinks when querying', () => {
  const order = {
    shop: 'Edition Roasters',
    brand: 'Starbucks',
    beanName: 'House Blend',
    delta: 10,
  };
  const drink = { shop: '', brand: '', beanName: '', delta: -1 };

  // An empty query is not a search — everything passes, drinks included.
  expect(matchesSearch(order, '')).toBe(true);
  expect(matchesSearch(drink, '   ')).toBe(true);

  expect(matchesSearch(order, 'edition')).toBe(true); // case-insensitive shop
  expect(matchesSearch(order, 'starbucks')).toBe(true); // brand
  expect(matchesSearch(order, 'house')).toBe(true); // bean
  expect(matchesSearch(order, 'lavazza')).toBe(false);

  // A drink carries no text at all, so any real query excludes it.
  expect(matchesSearch(drink, 'edition')).toBe(false);

  // A drink that DOES carry matching text: without the delta guard this would match, so this
  // assertion is what actually exercises the guard. The empty-text drink above returns false
  // either way — `'  '.includes('edition')` is false with or without the guard — so on its own
  // it passes for the wrong reason and deleting the guard leaves the suite green.
  const drinkWithText = {
    shop: 'Edition Roasters',
    brand: 'Starbucks',
    beanName: 'House Blend',
    delta: -1,
  };
  expect(matchesSearch(drinkWithText, 'edition')).toBe(false);
});

test('historyTotals sums cups, spend and order count over exactly the rows it is given', () => {
  const rows = [
    { delta: -1, price: 0 },
    { delta: -2, price: 0 },
    { delta: 10, price: 45000 },
    { delta: 5, price: 20000 },
  ];
  expect(historyTotals(rows)).toEqual({ cups: 3, spent: 65000, orders: 2 });
  expect(historyTotals([])).toEqual({ cups: 0, spent: 0, orders: 0 });
});

test('historyTotals over a filtered slice reports only that slice', () => {
  // This is the whole point of the fix: pass the visible rows, get the visible totals.
  const ordersOnly = [{ delta: 10, price: 45000 }];
  expect(historyTotals(ordersOnly)).toEqual({ cups: 0, spent: 45000, orders: 1 });
});
```

Then extend the existing import block from `./db` at the top of the file, keeping it alphabetical:

```ts
import {
  assertIntegerMinor,
  assertPositiveInt,
  buildDayEntries,
  consumptionPerDay,
  countConsumed,
  historyTotals,
  isMovement,
  latestBlend,
  matchesFilter,
  matchesSearch,
  stockLevel,
  totalSpent,
  updateOrder,
} from './db';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- coffee.test.ts`
Expected: FAIL — `buildDayEntries`, `matchesSearch`, and `historyTotals` are not exported from `./db` (a TypeScript/import error, not an assertion failure).

- [ ] **Step 3: Implement the three reducers**

In `src/features/coffee/db.ts`, insert directly after the `matchesFilter` function and before the `// ── Writes ──` banner comment:

```ts
// One rendered line in the History log. A day's drinks collapse into a SINGLE entry: 597 of the 606
// movements on a real device are drinks, every one of them identical apart from a timestamp, and
// rendering them one-per-row made the log 53 screens tall and its longest run 11 byte-identical
// lines. The collapsed entry keeps its own movements so a specific cup can still be edited or
// deleted once the row is expanded. Orders never collapse — each one is distinct and informative.
export type DayEntry =
  | { kind: 'drinks'; cups: number; from: number; to: number; movements: Movement[] }
  | { kind: 'order'; movement: Movement };

// Collapse ONE day's movements (newest-first, as listMovements returns them) into render entries.
// The drinks entry takes the position of the day's newest drink, so an order logged mid-day still
// reads in roughly the right place without splitting the day's drinking into two piles.
export function buildDayEntries(rows: Movement[]): DayEntry[] {
  const drinks = rows.filter((m) => m.delta < 0);
  const entries: DayEntry[] = [];
  let placed = false;
  for (const m of rows) {
    if (m.delta >= 0) {
      entries.push({ kind: 'order', movement: m });
      continue;
    }
    if (placed) continue;
    placed = true;
    let cups = 0;
    for (const d of drinks) cups += -d.delta;
    // Newest-first, so the LAST drink is the earliest one of the day. The `?? m.at` fallbacks can
    // never fire — we are inside the branch that proves `drinks` is non-empty — but they keep this
    // free of the banned `!` assertion.
    entries.push({
      kind: 'drinks',
      cups,
      from: drinks[drinks.length - 1]?.at ?? m.at,
      to: drinks[0]?.at ?? m.at,
      movements: drinks,
    });
  }
  return entries;
}

// Free-text search over an order's shop / brand / bean. A drink carries no text whatsoever, so a
// non-empty query excludes every drink rather than matching them all — searching is how you find
// the one order you are looking for, and 597 drinks in the results would defeat that. An EMPTY
// query is not a search: everything passes.
export function matchesSearch(
  row: Pick<Movement, 'shop' | 'brand' | 'beanName' | 'delta'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if (row.delta < 0) return false;
  return `${row.shop} ${row.brand} ${row.beanName}`.toLowerCase().includes(q);
}

// Totals over exactly the rows handed in. Callers pass the VISIBLE rows, so the figures track the
// active filter and search instead of silently staying all-time — a "Capsules 597" tile above a
// list containing zero drinks reads as a control that did nothing.
export function historyTotals(rows: Pick<Movement, 'delta' | 'price'>[]): {
  cups: number;
  spent: number;
  orders: number;
} {
  let cups = 0;
  let spent = 0;
  let orders = 0;
  for (const m of rows) {
    if (m.delta < 0) cups += -m.delta;
    if (m.delta > 0) {
      spent += m.price;
      orders += 1;
    }
  }
  return { cups, spent, orders };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- coffee.test.ts`
Expected: PASS — all tests green, including the five new cases.

- [ ] **Step 5: Verify the gates pass**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all four pass. If `format:check` fails, run `npm run format` and re-check.

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/db.ts src/features/coffee/coffee.test.ts
git commit -m "feat(history): add day-collapse, search and scoped-totals reducers" -m "On a real device the log holds 606 movements, 597 of them drinks that are identical apart from a timestamp. Rendering one row each made History 53 screens tall with a longest run of 11 identical lines - the exact 'undifferentiated rows' failure PRODUCT.md names as this app's closest anti-reference." -m "buildDayEntries collapses a day's drinks into one entry while keeping the underlying movements for editing; matchesSearch gives orders a retrieval path; historyTotals takes the rows it is given so the tiles can follow the filter instead of staying all-time." -m "Pure and node-safe, so Vitest covers them without OPFS." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: MovementRow — 44×44 targets, no constant delta, announced confirm

**Files:**

- Modify: `src/features/coffee/components/MovementRow.tsx`

**Interfaces:**

- Consumes: `Movement` from `../db` (already imported); `ClockIcon`, `TrashIcon` from `./icons` (already imported).
- Produces: `MovementRow`'s props are **unchanged**. Task 3 renders it exactly as it does today.

- [ ] **Step 1: Widen both icon buttons to a true 44×44**

`globals.css` sets `min-height: 44px` on every `button`, but `size-9` also sets `width: 2.25rem` and nothing constrains width — measured live in the browser, every one of these buttons is **36×44px**, not 44×44. Two of them sit side by side and one is an unrecoverable delete.

In `src/features/coffee/components/MovementRow.tsx`, change the clock button's className from:

```tsx
className =
  'grid size-9 place-items-center rounded-[var(--radius-sm)] text-[var(--color-faint)] transition-colors hover:text-[var(--color-text)]';
```

to:

```tsx
className =
  'grid size-11 place-items-center rounded-[var(--radius-sm)] text-[var(--color-faint)] transition-colors hover:text-[var(--color-text)]';
```

and the trash button's className from:

```tsx
className =
  'grid size-9 place-items-center rounded-[var(--radius-sm)] text-[var(--color-faint)] transition-colors hover:text-[var(--color-danger)]';
```

to:

```tsx
className =
  'grid size-11 place-items-center rounded-[var(--radius-sm)] text-[var(--color-faint)] transition-colors hover:text-[var(--color-danger)]';
```

Leave both `<ClockIcon className="size-[18px]" />` and `<TrashIcon className="size-[18px]" />` alone — the glyph stays 18px inside a 44px target.

- [ ] **Step 2: Stop printing the constant `-1` on drink rows**

Every drink is `-1`, forever, in the row's strongest right-edge position — it repeats what "Drank a coffee" already says while squeezing order subtitles into truncation ("Starbucks · House Bl…"). Orders keep their `+N`, which is real information.

Replace this entire block:

```tsx
<div className="flex flex-col items-end leading-tight">
  <span
    className={`tnum font-semibold ${isOrder ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
  >
    {isOrder ? `+${number.format(movement.delta)}` : number.format(movement.delta)}
  </span>
  {isOrder && movement.price > 0 ? (
    <span className="tnum text-xs text-[var(--color-muted)]">{formatSatang(movement.price)}</span>
  ) : null}
</div>
```

with:

```tsx
{
  /* Orders only. A drink's delta is always exactly -1, so printing it says nothing the label
     doesn't already say — and the fixed-width column it needed was truncating order subtitles. */
}
{
  isOrder ? (
    <div className="flex flex-col items-end leading-tight">
      <span className="tnum font-semibold text-[var(--color-accent)]">
        +{number.format(movement.delta)}
      </span>
      {movement.price > 0 ? (
        <span className="tnum text-xs text-[var(--color-muted)]">
          {formatSatang(movement.price)}
        </span>
      ) : null}
    </div>
  ) : null;
}
```

- [ ] **Step 3: Announce the confirm swap to screen readers**

Tapping the trash icon replaces the icon pair with Cancel/Delete in place. Sighted users see it; a screen-reader user gets nothing (WCAG 4.1.3 Status Messages).

**The live region must live OUTSIDE the `confirming` ternary.** Putting `aria-live` on the confirm `<div>` itself does not work: that div and its content mount in one atomic DOM insertion, and assistive technology announces _changes to content inside an already-present live region_ — a region that appears fully populated is not announced at all. Same failure class as `el.innerHTML = '<div aria-live>…'`.

Wrap the whole `actionable` branch in a fragment, with a permanently-mounted sr-only region ahead of the swap whose **text** is what toggles:

```tsx
{
  actionable ? (
    <>
      {/* Lives OUTSIDE the ternary on purpose: a live region inserted already-populated is
              never announced. It must be in the DOM from first render, with only its text
              changing. */}
      <span className="sr-only" aria-live="polite">
        {confirming ? 'Delete confirmation required.' : ''}
      </span>
      {confirming ? (
        <div className="flex items-center gap-1.5">
          {/* …existing Cancel / Delete buttons, unchanged… */}
        </div>
      ) : (
        <div className="flex items-center">
          {/* …existing clock / trash icon buttons, unchanged… */}
        </div>
      )}
    </>
  ) : null;
}
```

`aria-live` must end up appearing exactly once in the file, on that span — never on a `div`.

- [ ] **Step 4: Verify the gates pass**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all four pass. If `format:check` fails, run `npm run format` and re-check.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/components/MovementRow.tsx
git commit -m "fix(history): give the row actions real 44px targets and drop the constant delta" -m "size-9 set width:2.25rem; the global min-height:44px rescued only the height, so both icon buttons measured 36x44 in the browser - two adjacent undersized targets, one of them an unrecoverable delete. PRODUCT.md claims 44px is enforced globally; it was not, for width." -m "A drink's delta is always -1, so the column repeated what the label said while squeezing order subtitles into truncation. Orders keep their +N." -m "The confirm swap now announces itself: replacing the icons in place was silent to a screen reader." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: HistoryView — collapsed days, search, progressive log, scoped totals

**Files:**

- Modify: `src/features/coffee/components/icons.tsx` (append at the end)
- Modify: `src/features/coffee/components/HistoryView.tsx` (substantial rewrite)

**Interfaces:**

- Consumes: `buildDayEntries`, `matchesSearch`, `historyTotals`, `type DayEntry` (Task 1); `MovementRow` with its existing props (Task 2); `groupByDay`, `formatDayLabel`, `formatTime` from `../datetime`; `formatSatang` from `../money`; `ready` from `UseCoffee`.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Add the two icons**

Append to the end of `src/features/coffee/components/icons.tsx`:

```tsx
// Disclosure caret for the collapsed drinks row. The row rotates it 180° when expanded.
export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}
```

- [ ] **Step 2: Replace the imports and the component body up to the early return**

In `src/features/coffee/components/HistoryView.tsx`, replace the whole import block and the top of the component — everything from line 1 down to and including the `movements.length === 0` early return — with:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildDayEntries,
  historyTotals,
  matchesFilter,
  matchesSearch,
  type DayEntry,
  type HistoryFilter,
  type Movement,
} from '../db';
import type { UseCoffee } from '../use-coffee';
import { formatDayLabel, formatTime, groupByDay } from '../datetime';
import { formatSatang } from '../money';
import { AddOrderSheet } from './AddOrderSheet';
import { EditTimeDialog } from './EditTimeDialog';
import { ChevronDownIcon, SearchIcon } from './icons';
import { MovementRow } from './MovementRow';

const number = new Intl.NumberFormat('en-US');
const average = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

// How many day groups render at once, and how many more each "Show older" tap adds. The log is
// unbounded — a real device already holds 606 movements across 127 days, which mounted 9,044 DOM
// nodes and made the page 53 screens tall with every control stranded at the top.
const DAYS_PER_PAGE = 30;

// History: totals for what you are looking at, then the log grouped by day, with a day's drinks
// collapsed into one expandable row.
export function HistoryView({ coffee }: { coffee: UseCoffee }) {
  const { ready, movements, removeMovement, editMovementTime, editOrder } = coffee;
  const [editing, setEditing] = useState<Movement | null>(null);
  const [editingOrder, setEditingOrder] = useState<Movement | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [query, setQuery] = useState('');
  const [daysShown, setDaysShown] = useState(DAYS_PER_PAGE);

  const visible = useMemo(
    () => movements.filter((m) => matchesFilter(m, filter) && matchesSearch(m, query)),
    [movements, filter, query],
  );
  const groups = useMemo(() => groupByDay(visible), [visible]);
  const totals = useMemo(() => historyTotals(visible), [visible]);

  // Narrowing the log resets the window. Without this, switching from a filter you had paged deep
  // into leaves you 90 days down a list that is now 3 days long.
  useEffect(() => {
    setDaysShown(DAYS_PER_PAGE);
  }, [filter, query]);

  // A drink has exactly one editable field, so it routes to the time dialog. An order opens the
  // full sheet; its time stays with the clock icon, same as a drink's.
  function openEditor(m: Movement) {
    if (m.delta > 0) setEditingOrder(m);
    else setEditing(m);
  }

  // Gated on `ready`, matching HomeView. Before OPFS answers, `movements` is [] — rendering the
  // "nothing logged yet" copy then tells a user with 606 rows that their history is empty.
  if (!ready) return null;

  if (movements.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
        Nothing logged yet. Drink a coffee or add an order to start your history.
      </div>
    );
  }

  const shown = groups.slice(0, daysShown);
  const hiddenDays = groups.length - shown.length;
```

- [ ] **Step 3: Replace the JSX with the filter-aware totals, search field, and paged log**

Still in `HistoryView.tsx`, replace the entire `return ( … );` block — from `<section className="flex flex-col gap-6">` through its closing `</section>` — with:

```tsx
  return (
    <section className="flex flex-col gap-5">
      {/* The view's own heading. Without it the day labels below are the top-level headings, so
          jumping by heading announces "Today, Yesterday, Sunday Jul 19" with no page identity. */}
      <h2 className="sr-only">History</h2>

      {/* Totals for exactly what is on screen. Each filter gets the three figures that answer ITS
          question — a "Capsules" tile above an orders-only list was a control that did nothing. */}
      <div className="grid grid-cols-3 gap-3">
        {filter === 'orders' ? (
          <>
            <Stat label="Orders" value={number.format(totals.orders)} />
            <Stat label="Spent" value={formatSatang(totals.spent)} />
            <Stat
              label="Per order"
              value={totals.orders === 0 ? '—' : formatSatang(Math.round(totals.spent / totals.orders))}
            />
          </>
        ) : filter === 'drinks' ? (
          <>
            <Stat label="Capsules" value={number.format(totals.cups)} />
            <Stat label="Days" value={number.format(groups.length)} />
            <Stat
              label="Per day"
              value={groups.length === 0 ? '—' : average.format(totals.cups / groups.length)}
            />
          </>
        ) : (
          <>
            <Stat label="Capsules" value={number.format(totals.cups)} />
            <Stat label="Spent" value={formatSatang(totals.spent)} />
            <Stat label="Orders" value={number.format(totals.orders)} />
          </>
        )}
      </div>

      {/* Search. Orders carry text (shop, brand, bean); drinks carry none, so a non-empty query
          excludes them — see matchesSearch. type="search" gives Android a clear button for free. */}
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3">
        <SearchIcon className="size-[18px] shrink-0 text-[var(--color-faint)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search orders by shop, brand or bean"
          placeholder="Search orders"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[var(--color-faint)]"
        />
      </div>

      {/* Type filter. */}
      <div
        role="group"
        aria-label="Filter history"
        className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-1"
      >
        <FilterTab label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterTab label="Drinks" active={filter === 'drinks'} onClick={() => setFilter('drinks')} />
        <FilterTab label="Orders" active={filter === 'orders'} onClick={() => setFilter('orders')} />
      </div>

      {/* An empty result here means the FILTER or the SEARCH matched nothing — the "nothing logged
          yet" early return above already covers a genuinely empty app. role="status" so narrowing
          to nothing is announced rather than silently emptying the list. */}
      {visible.length === 0 ? (
        <p
          role="status"
          className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center text-sm text-[var(--color-muted)]"
        >
          {query.trim() !== ''
            ? `No orders match “${query.trim()}”.`
            : filter === 'drinks'
              ? 'No drinks logged yet.'
              : 'No orders logged yet.'}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-5">
            {shown.map((group) => (
              <div key={group.key}>
                <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                  {formatDayLabel(group.at)}
                </h3>
                <ul className="flex flex-col gap-2">
                  {buildDayEntries(group.rows).map((entry) => (
                    <EntryRow
                      key={entry.kind === 'order' ? entry.movement.id : `drinks-${group.key}`}
                      entry={entry}
                      onEdit={openEditor}
                      onEditTime={setEditing}
                      onDelete={removeMovement}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {hiddenDays > 0 ? (
            <button
              type="button"
              onClick={() => setDaysShown((d) => d + DAYS_PER_PAGE)}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 text-sm font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              Show older ({number.format(hiddenDays)} more {hiddenDays === 1 ? 'day' : 'days'})
            </button>
          ) : null}
        </>
      )}

      <EditTimeDialog
        movement={editing}
        onClose={() => setEditing(null)}
        onSave={editMovementTime}
      />

      <AddOrderSheet
        open={editingOrder !== null}
        movement={editingOrder}
        onClose={() => setEditingOrder(null)}
        onSubmit={async (shop, brand, beanName, quantity, price) => {
          if (editingOrder)
            await editOrder(editingOrder.id, shop, brand, beanName, quantity, price);
        }}
      />
    </section>
  );
}
```

- [ ] **Step 4: Add the `EntryRow` and `DrinkDayRow` components**

Still in `HistoryView.tsx`, insert these two components directly above the existing `Stat` function at the bottom of the file:

```tsx
// One entry: an order renders as the normal log row; a day's drinks render as one collapsed row.
function EntryRow({
  entry,
  onEdit,
  onEditTime,
  onDelete,
}: {
  entry: DayEntry;
  onEdit: (movement: Movement) => void;
  onEditTime: (movement: Movement) => void;
  onDelete: (id: string) => void;
}) {
  if (entry.kind === 'order') {
    return (
      <MovementRow
        movement={entry.movement}
        onEdit={onEdit}
        onEditTime={onEditTime}
        onDelete={onDelete}
      />
    );
  }
  return <DrinkDayRow entry={entry} onEdit={onEdit} onEditTime={onEditTime} onDelete={onDelete} />;
}

// A day's drinking as one line: "6 capsules · 07:12 – 21:08". Tapping it reveals the individual
// cups, which keep the full edit/delete affordances — collapsing is a display decision, not a loss
// of control. Collapsed by default because the summary answers the question the log is usually
// opened with, and 11 identical rows never did.
function DrinkDayRow({
  entry,
  onEdit,
  onEditTime,
  onDelete,
}: {
  entry: { kind: 'drinks'; cups: number; from: number; to: number; movements: Movement[] };
  onEdit: (movement: Movement) => void;
  onEditTime: (movement: Movement) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // A single cup has no range to state, and the time is already the only thing the row would show.
  const range =
    entry.movements.length === 1
      ? formatTime(entry.to)
      : `${formatTime(entry.from)} – ${formatTime(entry.to)}`;

  return (
    <li className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="tnum font-semibold">
          {number.format(entry.cups)} {entry.cups === 1 ? 'capsule' : 'capsules'}
        </span>
        <time className="tnum flex-1 truncate text-sm text-[var(--color-muted)]">{range}</time>
        <ChevronDownIcon
          className={`size-[18px] shrink-0 text-[var(--color-faint)] transition-transform duration-[var(--dur-fast)] ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <ul className="flex flex-col gap-2 px-2 pb-2">
          {entry.movements.map((m) => (
            <MovementRow
              key={m.id}
              movement={m}
              onEdit={onEdit}
              onEditTime={onEditTime}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 5: Verify the gates pass**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: all five pass. If `format:check` fails, run `npm run format` and re-check.

Note: the nested `<ul>` inside the `<li>` is valid HTML (a `<ul>` is flow content and `<li>` accepts flow content), and `MovementRow` renders an `<li>`, so every list item still has a list parent.

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/components/HistoryView.tsx src/features/coffee/components/icons.tsx
git commit -m "feat(history): collapse a day's drinks, add search, page the log" -m "History rendered all 606 movements at once: 9,044 DOM nodes, 127 day headers, 48,453px of scroll with every control stranded at the top. A day's drinks now collapse into one expandable row, and the log renders 30 days at a time behind a 'Show older' button." -m "The totals follow the filter and the search instead of staying all-time, so the Orders tab no longer shows a capsules figure above a list with no drinks. Search covers shop/brand/bean, which is the only way to reach 9 orders buried in 597 drinks." -m "Also: gated on ready like every sibling view (the empty-state copy was showing during OPFS load), added the view heading the day labels were standing in for, and gave the empty result a role=status." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Component tests for the rebuilt view

**Files:**

- Create: `src/features/coffee/history-view.test.tsx`

**Interfaces:**

- Consumes: `HistoryView` (Task 3); `coffeeWith` from `test/coffee-fixture`; `Movement` from `./db`; `startOfDaysAgo` from `./datetime`.
- Produces: nothing consumed by a later task.

The repo already covers `HomeView` and `DashboardView` at the component level through the shared `coffeeWith` stub. Task 3's rewrite carries real behavior — collapse, expansion, paging, filter-dependent tiles — and none of it is reachable from `coffee.test.ts`, which only sees the pure reducers.

**Every assertion below must be load-bearing.** Before committing, verify each test fails when the behavior it names is broken (delete the collapse, force `daysShown` to `Infinity`, drop the `ready` guard); a test that stays green through its own mutation is not coverage.

- [ ] **Step 1: Write the failing tests**

Create `src/features/coffee/history-view.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import type { Movement } from './db';
import { HistoryView } from './components/HistoryView';
import { startOfDaysAgo } from './datetime';
import { coffeeWith } from '../../../test/coffee-fixture';

// History's job after the redesign is to stop rendering 597 identical drink rows. These tests pin
// the collapse, the things that must survive it (per-cup edit and delete), and the figures the
// tiles volunteer for each filter.

function drink(daysAgo: number, hour: number, id = `d${daysAgo}-${hour}`): Movement {
  return {
    id,
    shop: '',
    brand: '',
    beanName: '',
    delta: -1,
    price: 0,
    at: startOfDaysAgo(daysAgo) + hour * 3_600_000,
  };
}

function order(daysAgo: number, shop: string, price: number, id = `o${daysAgo}-${shop}`): Movement {
  return {
    id,
    shop,
    brand: 'Starbucks',
    beanName: 'House Blend',
    delta: 10,
    price,
    at: startOfDaysAgo(daysAgo) + 8 * 3_600_000,
  };
}

// Newest-first, exactly as listMovements returns them.
function newestFirst(rows: Movement[]): Movement[] {
  return [...rows].sort((a, b) => b.at - a.at);
}

test('a day of drinks collapses into one row instead of one row per cup', () => {
  const movements = newestFirst([drink(1, 7), drink(1, 12), drink(1, 21)]);
  render(<HistoryView coffee={coffeeWith({ movements })} />);

  // The whole point: three cups, one row.
  expect(screen.getByText('3 capsules')).toBeInTheDocument();
  expect(screen.queryAllByText('Drank a coffee').length).toBe(0);
  expect(screen.getByText('07:00 – 21:00')).toBeInTheDocument();
});

test('expanding a collapsed day reveals each cup with its own delete control', async () => {
  const user = userEvent.setup();
  const movements = newestFirst([drink(1, 7), drink(1, 12)]);
  render(<HistoryView coffee={coffeeWith({ movements })} />);

  const summary = screen.getByRole('button', { expanded: false });
  await user.click(summary);

  // Collapsing is a display decision — no control may be lost by it.
  expect(screen.getAllByText('Drank a coffee').length).toBe(2);
  expect(screen.getAllByRole('button', { name: 'Delete entry' }).length).toBe(2);
  expect(screen.getByRole('button', { expanded: true })).toBe(summary);
});

test('a single cup states its time rather than an empty range', () => {
  render(<HistoryView coffee={coffeeWith({ movements: [drink(1, 9)] })} />);

  expect(screen.getByText('1 capsule')).toBeInTheDocument();
  expect(screen.getByText('09:00')).toBeInTheDocument();
  expect(screen.queryByText(/–/)).not.toBeInTheDocument();
});

test('the tiles follow the filter instead of staying all-time', async () => {
  const user = userEvent.setup();
  const movements = newestFirst([drink(1, 9), drink(1, 10), order(2, 'Shopee', 45000)]);
  render(<HistoryView coffee={coffeeWith({ movements })} />);

  // All: capsules, spend and order count together.
  expect(
    within(screen.getByText('Capsules').closest('div') ?? document.body).getByText('2'),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Orders' }));

  // Orders: a capsules tile above an orders-only list was the defect. It must be gone.
  expect(screen.queryByText('Capsules')).not.toBeInTheDocument();
  expect(screen.getByText('Per order')).toBeInTheDocument();
});

test('search finds an order by shop and drops every drink', async () => {
  const user = userEvent.setup();
  const movements = newestFirst([drink(1, 9), order(2, 'Edition Roasters', 201500)]);
  render(<HistoryView coffee={coffeeWith({ movements })} />);

  await user.type(screen.getByRole('searchbox'), 'edition');

  expect(screen.getByText('Edition Roasters')).toBeInTheDocument();
  // A drink carries no text, so a real query must exclude it rather than match everything.
  expect(screen.queryByText(/capsule/)).not.toBeInTheDocument();

  // And because a query excludes every drink, the tiles must switch to the orders set — leaving
  // the All-tab triplet up would print "Capsules 0" above an orders-only list, which is the
  // tile-that-answers-nothing problem this redesign exists to remove.
  expect(screen.getByText('Per order')).toBeInTheDocument();
  expect(screen.queryByText('Capsules')).not.toBeInTheDocument();
});

test('the drinks tab says search does not apply to it, rather than "no orders match"', async () => {
  const user = userEvent.setup();
  render(<HistoryView coffee={coffeeWith({ movements: [drink(1, 9)] })} />);

  await user.click(screen.getByRole('button', { name: 'Drinks' }));
  await user.type(screen.getByRole('searchbox'), 'edition');

  expect(screen.getByRole('status')).toHaveTextContent('Search only matches orders');
});

test('search with no match says so rather than emptying the list silently', async () => {
  const user = userEvent.setup();
  render(<HistoryView coffee={coffeeWith({ movements: [order(2, 'Shopee', 45000)] })} />);

  await user.type(screen.getByRole('searchbox'), 'lavazza');

  expect(screen.getByRole('status')).toHaveTextContent('No orders match');
});

test('the log pages rather than mounting every day at once', async () => {
  const user = userEvent.setup();
  // 40 days, one cup each — past the 30-day window.
  const movements = newestFirst(Array.from({ length: 40 }, (_, i) => drink(i + 1, 9, `d${i}`)));
  render(<HistoryView coffee={coffeeWith({ movements })} />);

  expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(30);
  const older = screen.getByRole('button', { name: /Show older/ });
  expect(older).toHaveTextContent('10 more days');

  await user.click(older);

  expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(40);
  expect(screen.queryByRole('button', { name: /Show older/ })).not.toBeInTheDocument();
});

test('renders nothing until the database has answered', () => {
  // movements is [] both while OPFS is loading and when the app is genuinely empty. Before this
  // guard, a user with 606 rows saw "Nothing logged yet" on every cold open of the tab.
  const { container } = render(
    <HistoryView coffee={coffeeWith({ ready: false, movements: [] })} />,
  );
  expect(container).toBeEmptyDOMElement();

  render(<HistoryView coffee={coffeeWith({ ready: true, movements: [] })} />);
  expect(screen.getByText(/Nothing logged yet/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail against a broken behavior**

Run: `npm test -- history-view.test.tsx`
Expected: PASS if Task 3 is correct. Then prove each test is load-bearing by mutating the source and confirming the _matching_ test goes red. Do all four, reverting after each:

| Mutation in `HistoryView.tsx`                                                               | Test that must fail                                       |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Change `if (!ready) return null;` to `if (false) return null;`                              | `renders nothing until the database has answered`         |
| Change `groups.slice(0, daysShown)` to `groups`                                             | `the log pages rather than mounting every day at once`    |
| In `EntryRow`, always return `<MovementRow …>` for the drinks branch's `entry.movements[0]` | `a day of drinks collapses into one row…`                 |
| Change `historyTotals(visible)` to `historyTotals(movements)`                               | `the tiles follow the filter instead of staying all-time` |

If a mutation leaves every test green, the test for that row is decorative — fix the test before continuing.

- [ ] **Step 3: Confirm the tree is clean after mutation testing**

Run: `git status --short`
Expected: only the new untracked test file. If `HistoryView.tsx` still shows as modified, a mutation was not reverted — revert it with `git checkout -- src/features/coffee/components/HistoryView.tsx` and re-run the suite.

- [ ] **Step 4: Verify the gates pass**

Run each gate separately and check its **exit code**, not its printed summary:

```bash
npm run typecheck >/dev/null 2>&1; echo "typecheck=$?"
npm run lint >/dev/null 2>&1; echo "lint=$?"
npm run format:check >/dev/null 2>&1; echo "format=$?"
npm test >/dev/null 2>&1; echo "test=$?"
```

Expected: `0` for all four. If `format` is non-zero, run `npm run format` and re-check.

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/history-view.test.tsx
git commit -m "test(history): cover the collapse, paging and filter-aware tiles" -m "coffee.test.ts only sees the pure reducers, so none of the rewrite's real behaviour - collapsing a day's drinks, expanding back to per-cup controls, paging past 30 days, tiles that track the filter - had any cover at the component level, where HomeView and DashboardView both do." -m "Each assertion was verified load-bearing by mutation: dropping the ready guard, the slice, the collapse and the scoped totals each turns exactly its own test red." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verify in the running app

**Files:** none modified — this is the acceptance gate.

**Interfaces:** none.

- [ ] **Step 1: Start the app**

Run: `npm run dev`
Expected: `Ready in …`. Open the printed URL and go to the History tab.

If the port is already taken, the existing server is fine — do not start a second one.

- [ ] **Step 2: Check the collapse and the page size**

Paste into the browser devtools console while the History tab is open:

```js
({
  rows: document.querySelectorAll('main li').length,
  dayHeaders: document.querySelectorAll('main h3').length,
  screens: +(document.documentElement.scrollHeight / window.innerHeight).toFixed(1),
  nodes: document.querySelectorAll('*').length,
});
```

Expected: `dayHeaders` ≤ 30, `screens` under ~8, and `nodes` well under 2,000. Before this change the same snippet returned 606 rows / 127 headers / 53 screens / 9,044 nodes.

- [ ] **Step 3: Check the touch targets**

Paste into the same console:

```js
[
  ...document.querySelectorAll(
    'main button[aria-label="Delete entry"], main button[aria-label="Edit time"]',
  ),
]
  .slice(0, 4)
  .map((b) => {
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
```

Expected: every entry `{ w: 44, h: 44 }`. Before this change they measured `{ w: 36, h: 44 }`. If the list is empty, expand a drinks row first.

- [ ] **Step 4: Walk the behavior**

Check each of:

- A day with several cups shows **one** row reading e.g. `6 capsules · 07:12 – 21:08`, not six rows.
- Tapping that row expands it into the individual cups; each still has a working clock and trash icon, and the trash still asks Cancel/Delete.
- Tapping the chevron row again collapses it.
- A day with exactly one cup reads `1 capsule` with a single time, not a range.
- Order rows are unchanged: shop, brand · bean, `+120`, `฿2,015.00`, and tapping the text opens the prefilled "Edit order" sheet.
- Drink rows no longer print `-1`.
- Typing `edition` in the search box narrows the log to Edition Roasters orders and drops every drink. Clearing it restores the full log.
- Searching for something with no match shows `No orders match “…”.`
- Switching to **Orders** changes the tiles to Orders / Spent / Per order, and the figures match the visible list. Switching to **Drinks** shows Capsules / Days / Per day.
- After paging down with "Show older", switching filter or typing in the search resets the log to the top 30 days.
- "Show older" disappears once every day is shown.

- [ ] **Step 5: Confirm the full gate one more time**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: all five pass.

---

## Done criteria

- A day's drinks render as one expandable row; the individual cups remain editable and deletable inside it.
- The log renders at most 30 day groups at a time, with a "Show older" control that disappears when exhausted.
- Search narrows the log by shop / brand / bean, and excludes drinks while a query is active.
- The three stat tiles reflect the active filter and search, not all-time.
- Both row icon buttons measure 44×44px in the browser.
- Drink rows no longer print the constant `-1`.
- `HistoryView` renders nothing until `ready`, matching `HomeView`.
- The view has its own heading; day labels are `<h3>`; the empty result carries `role="status"`; the delete confirm announces itself.
- `HistoryView` has component-level cover, and every assertion was proven load-bearing by mutation.
- All five gates verified green **by exit code** (`cmd >/dev/null 2>&1; echo $?` → `0`), never by reading a printed summary — a compressed "✓ 0 problems" hid a real oxlint failure for eight tasks on the previous branch.
- Five commits on `feat/history-redesign` — one per task; Task 0 only creates the branch and Task 5 adds none.
