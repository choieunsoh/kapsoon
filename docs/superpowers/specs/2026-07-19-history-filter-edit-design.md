# History filter + order editing — design

Date: 2026-07-19

## Goal

Make the history log answer a narrower question and let a mis-logged order be corrected in place.
Today History renders every movement with no way to narrow it, and the only correction available is
the timestamp — a fat-fingered price or quantity can only be fixed by deleting the row and retyping
it.

## Scope

**In:** a 3-way type filter on History, click-a-row-to-edit (orders → the order sheet, drinks → the
time dialog), one new DB write, one hook callback, two unit tests.

**Out:** text search, date-range filters, bulk actions, edit history / undo, a negative-stock guard,
schema changes, filter persistence across tab switches.

**Already done, not rebuilt:** delete confirmation. `MovementRow.tsx` already flips the row into an
inline Cancel/Delete state when the trash icon is tapped. This design does not touch it.

## Architecture

### 1. Type filter

`HistoryView` gains `useState<HistoryFilter>('all')` where
`HistoryFilter = 'all' | 'drinks' | 'orders'`. A segmented control sits above the log; the movement
array is narrowed by a `useMemo` before `groupByDay` runs.

No SQL and no hook change. `useCoffee` already holds every movement in memory as a read-cache over
SQLite, so filtering is a pure array operation — the same reason `DashboardView` needed no data-layer
work.

The predicate lives in `db.ts` beside the existing pure reducers (`stockLevel`, `countConsumed`,
`totalSpent`), which is where this codebase already puts row-shaped logic that must be testable
without spinning up a worker or OPFS.

The three stat tiles stay **all-time and unfiltered**. They are labeled as totals; recomputing them
per filter would render "Spent ฿0" whenever the user toggles to Drinks, which reads as a bug rather
than a filter.

Filter state is component-local and resets when the tab unmounts. Persisting it would mean a user
returns to History later, sees a partial log, and has no memory of why.

### 2. Click to edit

Clicking a row's text region opens an editor chosen by row type:

| Row type            | Opens                                              |
| ------------------- | -------------------------------------------------- |
| Order (`delta > 0`) | `AddOrderSheet`, prefilled, in edit mode           |
| Drink (`delta < 0`) | `EditTimeDialog` — a drink has one edit-able field |

The clock icon keeps owning the timestamp for **both** row types. A time field is deliberately **not**
added to the order sheet: it would duplicate `EditTimeDialog` and give two controls for one value.

`AddOrderSheet` is reused rather than cloned. It already renders exactly the five fields an order edit
needs, and a second ~180-line sheet would drift from the first. It takes a new optional
`movement?: Movement | null` prop; when set, the sheet prefills its state from that movement, titles
itself "Edit order", and labels the submit button "Save".

### 3. Markup and accessibility

The row's text region becomes a `<button>` that is a **sibling** of the clock/trash buttons, not a
wrapper around them. Making the whole `<li>` clickable would nest interactive controls inside a
button — invalid HTML, and a screen reader would announce one confused control instead of three.

The new behavior is gated behind an optional `onEdit` prop, so the read-only rows on Home keep
rendering as plain, non-interactive list items.

### 4. Stock after an edit

Editing an order's quantity retroactively changes the stock balance. This is correct and needs no
recalculation code: stock is a running sum of every movement's delta, so correcting a typo'd `50` to
`5` re-derives the balance for free — the same property that lets `deleteMovement` be a single
`DELETE`.

An edit can therefore push stock negative if the capsules have since been drunk. **No guard.** This
is a single-user app, and a transiently negative number immediately after a correction reads as the
correction it is. A guard would block the exact operation the feature exists to enable.

## Files

| File                                               | Change                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `src/features/coffee/db.ts`                        | add `HistoryFilter` type, `matchesFilter` predicate, `updateOrder` |
| `src/features/coffee/use-coffee.ts`                | add `editOrder` callback                                           |
| `src/features/coffee/components/HistoryView.tsx`   | filter state + segmented control; route row clicks to an editor    |
| `src/features/coffee/components/MovementRow.tsx`   | optional `onEdit` prop; text region becomes a button               |
| `src/features/coffee/components/AddOrderSheet.tsx` | optional `movement` prop → prefill, retitle, relabel               |
| `src/features/coffee/coffee.test.ts`               | tests for `matchesFilter` and `updateOrder` guards                 |

## Data flow

```
HistoryView                     use-coffee              db.ts
  filter state ──┐
                 └─ useMemo ── matchesFilter(row, filter)   (pure, no I/O)
  row click ─── editing state ─── AddOrderSheet
                                      └─ onSubmit ── editOrder ── updateOrder ── UPDATE
                                                          └─ refresh() ── listMovements
```

`editOrder` follows the existing write-then-refresh shape of `addOrder` / `removeMovement`: mutate
SQLite, then re-read into the in-memory cache so every derived value recomputes at once.

## Error handling

`updateOrder` validates at the write boundary with the guards already in `db.ts` —
`assertPositiveInt(quantity)` and `assertIntegerMinor(price)` — so an invalid quantity or a
floating-point price throws before touching SQLite, exactly as `addOrder` does.

`AddOrderSheet` already validates its inputs before calling `onSubmit` and renders a message on a
thrown save. Edit mode inherits both paths unchanged.

Editing a row that was deleted in another tab is a no-op: the `UPDATE ... WHERE id = ?` matches
nothing and the subsequent refresh drops the row from the list.

## Testing

Two unit tests in the existing `coffee.test.ts`, which already runs these pure functions in jsdom
without a worker:

1. `matchesFilter` — a drink row, an order row, and each of the three filter values.
2. `updateOrder`'s guards — a fractional and a zero quantity both throw.

The rest of the change is wiring and markup, covered by `typecheck` + `lint` + `build`.

## Quality gates

`npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
