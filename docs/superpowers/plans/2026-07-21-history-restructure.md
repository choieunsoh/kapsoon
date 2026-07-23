# History Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make History's first screenful the log itself — delete the stat tiles and the search field, pin the filter bar under the header, and let a surface fill mean "this is a record".

**Architecture:** Subtractive. Two of the seven tasks delete code; the rest are local edits to `HistoryView.tsx`, `MovementRow.tsx`, `Header.tsx` and `globals.css`. No new files, no new dependencies, no data-layer change. The design spec is `docs/superpowers/specs/2026-07-21-history-restructure-design.md`.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5.9 · Tailwind v4 · Vitest + @testing-library/react + jsdom · oxlint · oxfmt

## Global Constraints

- **TypeScript house bans:** no `any`, no `as` casts (`as const` is fine), no `!` non-null assertion, no `// @ts-*` comments. `type` over `interface`. Prefer `for..of`.
- **Indexed access is guarded by convention, not by the compiler.** `tsconfig.json` sets `strict: true` but NOT `noUncheckedIndexedAccess` — an earlier draft of this plan claimed otherwise and was wrong. The `any` and `!` bans are enforced by oxlint (`typescript/no-explicit-any`, `typescript/no-non-null-assertion`), both at `error`. The codebase still guards indexed access defensively (`drinks[0]?.at ?? m.at` in `db.ts`) because `!` is banned outright; follow that style.
- **Money is an integer minor unit** (satang). Never a float.
- **One typeface.** Figures use the `.tnum` class. Never introduce a monospace font.
- **Design tokens only.** Colors come from `var(--color-*)` in `src/app/globals.css @theme`. No literal hex in components.
- **Quality gates (all must pass before any commit is considered done):**
  `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
- **Run commands via Git Bash (POSIX syntax)**, not PowerShell.
- **The governing rule for every visual decision in this plan:** inside History, `bg-[var(--color-surface)]` means _this is a logged record_. Nothing else may carry it.

---

## File Structure

| File                                             | Responsibility    | Change                                                            |
| ------------------------------------------------ | ----------------- | ----------------------------------------------------------------- |
| `src/features/coffee/components/HistoryView.tsx` | the History tab   | heavy — deletions, sticky bar, radiogroup, loading + empty states |
| `src/features/coffee/components/MovementRow.tsx` | one log line      | contrast + spacing fixes                                          |
| `src/features/coffee/components/Header.tsx`      | sticky top bar    | declares its height via a token                                   |
| `src/features/coffee/components/Coffee.tsx`      | app shell         | passes `onAdd` to `HistoryView`                                   |
| `src/app/globals.css`                            | tokens            | adds `--header-h` and `--color-on-danger`                         |
| `src/features/coffee/db.ts`                      | data helpers      | deletes `matchesSearch` and `historyTotals`                       |
| `src/features/coffee/coffee.test.ts`             | helper unit tests | deletes the two orphaned blocks                                   |
| `src/features/coffee/history-view.test.tsx`      | view tests        | deletes tile/search tests, adds five                              |

---

### Task 1: Delete the stat tiles, the search field, and the helpers they orphan

This is a deletion, so the test cycle runs backwards: remove the tests that pin the deleted behaviour first, confirm the suite is green, then remove the code they covered and confirm it is still green.

`matchesSearch` and `historyTotals` each have exactly one caller — this view. Nothing else in `src/` references them.

**Files:**

- Modify: `src/features/coffee/history-view.test.tsx` (delete 4 tests)
- Modify: `src/features/coffee/coffee.test.ts` (delete 3 tests)
- Modify: `src/features/coffee/components/HistoryView.tsx`
- Modify: `src/features/coffee/db.ts:184-217`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `HistoryView` with no `query` state and no `Stat` component. `db.ts` no longer exports `matchesSearch` or `historyTotals`. Later tasks assume `emptyMessage` is a two-branch expression.

- [ ] **Step 1: Delete the four view tests that cover the tiles and the search**

In `src/features/coffee/history-view.test.tsx`, delete these four tests entirely (they span lines 75–146 in the current file):

- `'the tiles follow the filter instead of staying all-time'`
- `'search finds an order by shop and drops every drink'`
- `'the drinks tab says search does not apply to it, rather than "no orders match"'`
- `'search with no match says so rather than emptying the list silently'`

Then delete the now-unused imports on lines 1 and 7 — `within` from `@testing-library/react`, and `formatSatang`. Line 1 becomes:

```tsx
import { render, screen } from '@testing-library/react';
```

Update the file's header comment (lines 10–12) to drop the reference to tiles:

```tsx
// History's job after the redesign is to stop rendering 597 identical drink rows. These tests pin
// the collapse, the things that must survive it (per-cup edit and delete), and the paging window.
```

- [ ] **Step 2: Delete the three orphaned helper tests**

In `src/features/coffee/coffee.test.ts`, delete these tests:

- `'matchesSearch matches orders on shop/brand/bean and excludes drinks when querying'`
- `'historyTotals sums cups, spend and order count over exactly the rows it is given'`
- `'historyTotals over a filtered slice reports only that slice'`

Remove `historyTotals` and `matchesSearch` from the import block at the top of the file (lines 8 and 12), keeping `matchesFilter` and everything else.

- [ ] **Step 3: Run the suite to confirm it is green before touching source**

Run: `npm test`
Expected: PASS. The remaining tests do not exercise the deleted behaviour, so nothing should fail yet.

- [ ] **Step 4: Delete the tiles, the search, and the dead state from the view**

In `src/features/coffee/components/HistoryView.tsx`:

Replace the import block (lines 3–19) with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  buildDayEntries,
  matchesFilter,
  type DayEntry,
  type HistoryFilter,
  type Movement,
} from '../db';
import type { UseCoffee } from '../use-coffee';
import { formatDayLabel, formatTime, groupByDay } from '../datetime';
import { AddOrderSheet } from './AddOrderSheet';
import { EditTimeDialog } from './EditTimeDialog';
import { ChevronDownIcon } from './icons';
import { MovementRow } from './MovementRow';
```

This drops `SearchIcon`, `formatSatang`, `historyTotals`, and `matchesSearch`.

Delete the `average` formatter (line 22), keeping `number`.

Delete the `query` state (line 36). Replace the `visible` memo and the reset effect so neither mentions `query`:

```tsx
const visible = useMemo(
  () => movements.filter((m) => matchesFilter(m, filter)),
  [movements, filter],
);
const groups = useMemo(() => groupByDay(visible), [visible]);

// Narrowing the log resets the window. Without this, switching from a filter you had paged deep
// into leaves you 90 days down a list that is now 3 days long.
useEffect(() => {
  setDaysShown(DAYS_PER_PAGE);
}, [filter]);
```

Delete the `totals` memo (line 44).

Replace `emptyMessage` (lines 74–82) with the two-branch form:

```tsx
// Computed once so the visible copy and the persistent status region cannot drift apart.
const emptyMessage = filter === 'drinks' ? 'No drinks logged yet.' : 'No orders logged yet.';
```

Delete the entire stat block — the `<div className="grid grid-cols-3 gap-3">` element and everything inside it (lines 97–129 including its comment), and delete the entire search block (lines 131–143 including its comment).

Delete the `Stat` component definition (lines 306–313).

- [ ] **Step 5: Delete the two orphaned helpers**

In `src/features/coffee/db.ts`, delete `matchesSearch` (lines 184–196, including its comment block) and `historyTotals` (lines 198–217, including its comment block).

Leave the `HistoryFilter` type and `matchesFilter` untouched — the log still filters by type, and their comment (lines 135–136) makes no reference to searching.

- [ ] **Step 6: Run the gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. `typecheck` is the real check here — it proves no other module imported the deleted helpers.

- [ ] **Step 7: Commit**

```bash
git add src/features/coffee/components/HistoryView.tsx src/features/coffee/db.ts src/features/coffee/coffee.test.ts src/features/coffee/history-view.test.tsx
git commit -m "refactor(history): delete the stat tiles and the search field" -m "The triplet was a KPI row PRODUCT.md bans, and every question it asked is answered one tab away. matchesSearch excluded every drink by construction, so the field existed to find one of nine orders that the Orders filter already isolates." -m "Both helpers had exactly one caller each, so this removes them and their unit tests outright rather than relocating them."
```

---

### Task 2: Pin the filter bar under the header and un-card the page

The filter bar must stick directly beneath a header whose height is currently emergent (`py-3` plus content, never declared). This task makes that height an explicit token both sides read, so the anchor cannot drift.

`3.5rem` is exactly today's rendered height: `py-3` (12px + 12px) plus the `size-8` mark (32px) = 56px.

There is no automated test for stickiness — jsdom does not lay out or scroll, so `position: sticky` has no observable behaviour there. Asserting on class strings would test the implementation rather than the behaviour. Verification for this task is `npm run build` plus a visual check.

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/features/coffee/components/Header.tsx:12-13`
- Modify: `src/features/coffee/components/HistoryView.tsx`

**Interfaces:**

- Consumes: `HistoryView` from Task 1 (no search block above the filter).
- Produces: the CSS variable `--header-h`, readable anywhere. The filter wrapper is a `div` that Task 4 converts to a radiogroup.

- [ ] **Step 1: Add the header-height token**

In `src/app/globals.css`, inside the existing `:root` block (after `--dur-fast: 150ms;`), add:

```css
/* The sticky Header's height, declared rather than emergent. History's filter bar pins directly
     beneath it and needs the exact number; a hard-coded 56px would silently detach the moment
     anyone changed the header's padding, and no test would catch it. */
--header-h: 3.5rem;
```

- [ ] **Step 2: Make the Header declare that height**

In `src/features/coffee/components/Header.tsx`, replace line 13:

```tsx
      <div className="flex h-[var(--header-h)] items-center justify-between px-4">
```

(This replaces `py-3` with an explicit height — the rendered result is identical at 56px.)

- [ ] **Step 3: Pin and un-card the filter bar**

In `src/features/coffee/components/HistoryView.tsx`, replace the filter block (the `<div role="group" …>` and its comment) with:

```tsx
{
  /* The only control left on the page, so it pins under the Header rather than scrolling away
          — PRODUCT.md: "Reading material can live up top; tappable things cannot." The negative
          margin lets its hairline span the full width inside <main>'s px-4 gutter. No fill: inside
          History a surface fill means "this is a record". */
}
<div
  role="group"
  aria-label="Filter history"
  className="sticky top-[calc(env(safe-area-inset-top)+var(--header-h))] z-10 -mx-4 flex gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2"
>
  <FilterTab label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
  <FilterTab label="Drinks" active={filter === 'drinks'} onClick={() => setFilter('drinks')} />
  <FilterTab label="Orders" active={filter === 'orders'} onClick={() => setFilter('orders')} />
</div>;
```

- [ ] **Step 4: Drop the fill from the filter tabs and promote the day label**

Replace the `FilterTab` component's `className` expression so the selected tab is marked by weight as well as colour, with no fill:

```tsx
      className={`flex-1 rounded-[var(--radius-sm)] py-1.5 text-sm transition-colors ${
        // Weight carries the selection alongside the accent. PRODUCT.md: "Status is never encoded
        // in color alone." The old --color-surface-2 riser measured 1.10:1 and said nothing.
        active
          ? 'font-semibold text-[var(--color-accent)]'
          : 'font-normal text-[var(--color-muted)]'
      }`}
```

Promote the day heading — it is now the page's only organizing element. Replace the `<h3>` (line 176):

```tsx
<h3 className="mb-2 px-1 text-sm font-semibold text-[var(--color-text)]">
  {formatDayLabel(group.at)}
</h3>
```

Widen the gap between day groups so the rhythm distinguishes groups from rows. Replace the day-group container:

```tsx
          <div className="flex flex-col gap-6">
```

Tighten the section's own gap, since the sticky bar now carries its own separation via the hairline. Replace the root `<section>` opening tag:

```tsx
    <section className="flex flex-col gap-4">
```

- [ ] **Step 5: Run the gates**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: PASS. Existing tests are unaffected — no roles or accessible names changed in this task.

- [ ] **Step 6: Visual check**

Run: `npm run dev`, open the History tab in a mobile viewport (412×915 emulates the S24 Ultra), scroll past several day groups.
Expected: the filter row stays pinned immediately below the header with no gap and no overlap; day labels read as headings above their rows; only the log rows carry a filled background.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/features/coffee/components/Header.tsx src/features/coffee/components/HistoryView.tsx
git commit -m "feat(history): pin the filter bar and un-card the page" -m "Both controls sat atop a list built to be 30 screens tall, against PRODUCT.md's thumb-first principle. The filter now sticks under the header via a declared --header-h token instead of a hard-coded offset that would drift the moment the header's padding changed." -m "The fill comes off the filter group so that inside History a surface fill means 'this is a record', and the day label — now the only organizing element — stops being the quietest text on the page."
```

---

### Task 3: Return the view to the top when the filter changes

The reset of `daysShown` already exists and is correct. What it never did was move the viewport, so switching filters while scrolled deep leaves the user at the bottom of a suddenly-shorter list, nowhere near the control they just pressed.

**Files:**

- Modify: `src/features/coffee/components/HistoryView.tsx`
- Test: `src/features/coffee/history-view.test.tsx`

**Interfaces:**

- Consumes: the `useEffect` on `[filter]` from Task 1.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

Add to `src/features/coffee/history-view.test.tsx`. Note `vi` must be added to the `vitest` import on line 3: `import { expect, test, vi } from 'vitest';`

```tsx
test('changing the filter returns the view to the top of the list', async () => {
  const user = userEvent.setup();
  // jsdom has no layout, so the scroll itself is unobservable — the call is the contract. Without
  // it, switching filters 25 screens down leaves you at the bottom of a now-shorter list with the
  // control you just pressed far off-screen.
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const movements = newestFirst(Array.from({ length: 40 }, (_, i) => drink(i + 1, 9, `d${i}`)));
  render(<HistoryView coffee={coffeeWith({ movements })} />);

  // The effect also runs on mount, which is harmless but would pollute the assertion.
  scrollTo.mockClear();

  await user.click(screen.getByRole('button', { name: 'Drinks' }));

  expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  scrollTo.mockRestore();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/coffee/history-view.test.tsx -t 'returns the view to the top'`
Expected: FAIL — `expected "scrollTo" to be called with arguments: [ { top: 0 } ]`, received 0 calls.

- [ ] **Step 3: Add the scroll to the existing effect**

In `src/features/coffee/components/HistoryView.tsx`, replace the reset effect:

```tsx
// Narrowing the log resets the window AND the scroll position. Without the reset, switching from
// a filter you had paged deep into leaves you 90 days down a list that is now 3 days long;
// without the scroll, the shorter list simply strands you at its bottom, far from the control you
// just pressed. Firing on mount is intentional — the view is already at the top, and a tab
// switch away and back should land there too.
useEffect(() => {
  setDaysShown(DAYS_PER_PAGE);
  window.scrollTo({ top: 0 });
}, [filter]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/coffee/history-view.test.tsx -t 'returns the view to the top'`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/components/HistoryView.tsx src/features/coffee/history-view.test.tsx
git commit -m "fix(history): scroll to the top when the filter changes" -m "Paging reset already existed; the viewport never moved with it, so switching filters while scrolled deep left the user at the bottom of a suddenly-shorter list with no visible confirmation of what they had selected."
```

---

### Task 4: Give the filter real radiogroup semantics

Today the three tabs are `aria-pressed` toggles inside a `role="group"`, so a screen reader announces three unrelated switches — no exclusivity, no "2 of 3", no arrow keys.

This task must be done completely or not at all: roles without the matching keyboard behaviour are worse than plain buttons, because assistive tech then announces a radio that does not behave like one.

Changing the role changes how tests find these controls — `getByRole('button', { name: 'Drinks' })` becomes `getByRole('radio', { name: 'Drinks' })`. Four existing tests query them that way and must be updated in the same commit.

**Files:**

- Modify: `src/features/coffee/components/HistoryView.tsx`
- Test: `src/features/coffee/history-view.test.tsx`

**Interfaces:**

- Consumes: the sticky filter wrapper from Task 2 and `FilterTab` from Task 2 Step 4.
- Produces: `FilterTab` gains an `onKeyDown`-free signature (keyboard handling lives on the wrapper). The filter controls expose `role="radio"` with `aria-checked`; every later test queries them as radios.

- [ ] **Step 1: Write the failing test**

```tsx
test('the filter announces as one exclusive choice, not three toggles', async () => {
  const user = userEvent.setup();
  render(<HistoryView coffee={coffeeWith({ movements: [drink(1, 9)] })} />);

  const group = screen.getByRole('radiogroup', { name: 'Filter history' });
  expect(within(group).getAllByRole('radio').length).toBe(3);
  expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Drinks' })).not.toBeChecked();

  // Arrow keys move the selection, which is the whole reason the radio role is correct here.
  screen.getByRole('radio', { name: 'All' }).focus();
  await user.keyboard('{ArrowRight}');

  expect(screen.getByRole('radio', { name: 'Drinks' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'All' })).not.toBeChecked();
});
```

`within` must be restored to the `@testing-library/react` import on line 1: `import { render, screen, within } from '@testing-library/react';`

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/coffee/history-view.test.tsx -t 'one exclusive choice'`
Expected: FAIL — `Unable to find an accessible element with the role "radiogroup"`.

- [ ] **Step 3: Add the filter table and the keyboard handler**

In `src/features/coffee/components/HistoryView.tsx`, add `useRef` to the React import:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
```

Add this module-level constant just below `DAYS_PER_PAGE`:

```tsx
// The filter's options in DOM order. Arrow-key navigation needs the order as data, not as three
// hand-written JSX elements.
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'orders', label: 'Orders' },
] as const satisfies readonly { value: HistoryFilter; label: string }[];
```

Inside the component, next to the other state, add the ref and the handler:

```tsx
const filterRef = useRef<HTMLDivElement>(null);

// A radiogroup owes its user arrow-key navigation; the roles alone would announce a control that
// does not behave the way it says it does. Selection follows focus, which is the expected
// behaviour for a radiogroup whose options are cheap to apply.
function onFilterKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
  const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
  const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
  if (!forward && !back) return;
  event.preventDefault();

  const current = FILTERS.findIndex((f) => f.value === filter);
  const nextIndex = (current + (forward ? 1 : -1) + FILTERS.length) % FILTERS.length;
  const next = FILTERS[nextIndex];
  if (!next) return;

  setFilter(next.value);
  const radios = filterRef.current?.querySelectorAll('[role="radio"]');
  const target = radios?.[nextIndex];
  if (target instanceof HTMLElement) target.focus();
}
```

- [ ] **Step 4: Convert the wrapper and the tabs**

Replace the filter wrapper and its three children with:

```tsx
<div
  ref={filterRef}
  role="radiogroup"
  aria-label="Filter history"
  onKeyDown={onFilterKeyDown}
  className="sticky top-[calc(env(safe-area-inset-top)+var(--header-h))] z-10 -mx-4 flex gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2"
>
  {FILTERS.map((f) => (
    <FilterTab
      key={f.value}
      label={f.label}
      active={filter === f.value}
      onClick={() => setFilter(f.value)}
    />
  ))}
</div>
```

Replace the `FilterTab` component entirely:

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
      role="radio"
      aria-checked={active}
      // Roving tabindex: one tab stop for the whole group, then arrow keys within it. Three
      // separate tab stops would make the group cost three presses to skip.
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`flex-1 rounded-[var(--radius-sm)] py-1.5 text-sm transition-colors ${
        // Weight carries the selection alongside the accent. PRODUCT.md: "Status is never encoded
        // in color alone." The old --color-surface-2 riser measured 1.10:1 and said nothing.
        active
          ? 'font-semibold text-[var(--color-accent)]'
          : 'font-normal text-[var(--color-muted)]'
      }`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 5: Update the four tests that query these controls as buttons**

In `src/features/coffee/history-view.test.tsx`, change every `getByRole('button', { name: 'All' | 'Drinks' | 'Orders' })` to `getByRole('radio', …)`. The affected tests are:

- `'the log pages rather than mounting every day at once'` — no filter query, unaffected
- `'changing the filter resets how far the log was paged'` — two occurrences (`'Drinks'`, `'All'`)
- `'changing the filter returns the view to the top of the list'` — one occurrence (`'Drinks'`)

Leave `getByRole('button', { name: /Show older/ })` alone — that one is still a button.

Also update the assertion in `'expanding a collapsed day reveals each cup…'` if it uses a bare `getByRole('button', { expanded: false })`: it does, and the radios have no `expanded` state, so it remains unambiguous. No change needed.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, including the new radiogroup test.

- [ ] **Step 7: Run the gates and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: PASS

```bash
git add src/features/coffee/components/HistoryView.tsx src/features/coffee/history-view.test.tsx
git commit -m "fix(history): make the filter an exclusive choice, not three toggles" -m "role=group plus aria-pressed announced three unrelated switches: no exclusivity, no position, no arrow keys. A radiogroup with a roving tabindex says what the control actually is and costs one tab stop instead of three." -m "Selection now carries weight as well as the accent, so it is not encoded in colour alone."
```

---

### Task 5: Fix the two confirmed contrast failures and the adjacent destructive target

Three defects in `MovementRow`, all measured:

- order subtitle `--color-faint` on `--color-surface` = **4.36:1**, against AA's 4.5 for body text
- the Delete confirm's white on `--color-danger` = **3.33:1**
- the clock and trash buttons share a 0px boundary — two 44px targets, one destructive, in the thumb's arc

The delete fix changes the _ink_, not `--color-danger` itself: the token is also the trash icon's hover colour, where it sits on `--color-surface` at 5.29:1 and is already correct. Darkening the token would degrade a working state to fix an unrelated one.

These are token and spacing swaps with no behavioural surface, so they carry no new tests — the contrast ratios in the design spec are the check, and the existing `MovementRow` tests already pin the behaviour.

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/features/coffee/components/MovementRow.tsx:38,101,107`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: the token `--color-on-danger`.

- [ ] **Step 1: Add the on-danger token**

In `src/app/globals.css`, inside the `@theme` block, replace the `--color-danger` line and its comment with:

```css
/* Destructive actions (delete confirm) — a muted red that reads on the dark surface. */
--color-danger: #e5645d;
/* Ink for text sitting ON the danger fill. White measured 3.33:1 there, under AA for 14px body
     text; this is 5.85:1. Mirrors the --color-on-accent pattern rather than darkening --color-danger
     itself, which also serves as the trash icon's hover colour at a already-correct 5.29:1. */
--color-on-danger: #180806;
```

- [ ] **Step 2: Raise the order subtitle to a passing token**

In `src/features/coffee/components/MovementRow.tsx`, replace line 38:

```tsx
<span className="block truncate text-xs text-[var(--color-muted)]">{subtitle}</span>
```

(`--color-muted` on `--color-surface` is 6.92:1.)

- [ ] **Step 3: Recolour the Delete confirm**

Replace line 101's `className`:

```tsx
className =
  'rounded-[var(--radius-sm)] bg-[var(--color-danger)] px-2.5 text-sm font-medium text-[var(--color-on-danger)]';
```

- [ ] **Step 4: Separate the benign and destructive targets**

Replace line 107:

```tsx
            <div className="flex items-center gap-1">
```

- [ ] **Step 5: Run the gates**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/features/coffee/components/MovementRow.tsx
git commit -m "fix(history): close two AA contrast failures and a destructive mis-tap" -m "The order subtitle measured 4.36:1 and the Delete confirm 3.33:1, both under AA's 4.5 for body text. The delete fix changes the ink rather than --color-danger, which also serves as the trash hover colour at an already-correct 5.29:1." -m "The clock and trash buttons shared a 0px boundary — two 44px targets, one irreversible, sitting in the thumb's arc."
```

---

### Task 6: Announce the disclosure relationship and the paging

Two silent state changes: the collapsed-day button never says which list it controls, and "Show older" appends thirty day groups with no announcement — groups that then sit _before_ the button in DOM order, so shift-tab walks backwards into content nothing ever mentioned.

The view already has exactly one `role="status"` region. This task routes the paging message through that same region rather than adding a second one, so `getByRole('status')` stays unambiguous.

**Files:**

- Modify: `src/features/coffee/components/HistoryView.tsx`
- Test: `src/features/coffee/history-view.test.tsx`

**Interfaces:**

- Consumes: `emptyMessage` from Task 1; the `[filter]` effect from Task 3.
- Produces: state `pageMessage: string` and its setter, cleared whenever the filter changes.

- [ ] **Step 1: Write the failing test**

```tsx
test('paging the log announces how many more days appeared', async () => {
  const user = userEvent.setup();
  const movements = newestFirst(Array.from({ length: 40 }, (_, i) => drink(i + 1, 9, `d${i}`)));
  render(<HistoryView coffee={coffeeWith({ movements })} />);

  // Thirty groups appear before the button in DOM order; without an announcement a screen-reader
  // user has no cue that anything happened, and shift-tab walks into content never mentioned.
  expect(screen.getByRole('status')).toHaveTextContent('');

  await user.click(screen.getByRole('button', { name: /Show older/ }));

  expect(screen.getByRole('status')).toHaveTextContent('10 more days shown');
});

test('the collapsed day names the list it controls', async () => {
  const user = userEvent.setup();
  render(
    <HistoryView coffee={coffeeWith({ movements: newestFirst([drink(1, 7), drink(1, 12)]) })} />,
  );

  const summary = screen.getByRole('button', { expanded: false });
  const controlled = summary.getAttribute('aria-controls');
  expect(controlled).toBeTruthy();

  await user.click(summary);
  expect(document.getElementById(controlled ?? '')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/coffee/history-view.test.tsx -t 'announces how many more days'`
Expected: FAIL — status region is empty after the click.

Run: `npx vitest run src/features/coffee/history-view.test.tsx -t 'names the list it controls'`
Expected: FAIL — `expected null to be truthy`.

- [ ] **Step 3: Route the paging message through the existing status region**

In `src/features/coffee/components/HistoryView.tsx`, add the state beside the others:

```tsx
const [pageMessage, setPageMessage] = useState('');
```

Clear it in the filter effect, so a stale "30 more days shown" cannot survive into a different list:

```tsx
useEffect(() => {
  setDaysShown(DAYS_PER_PAGE);
  setPageMessage('');
  window.scrollTo({ top: 0 });
}, [filter]);
```

Replace the status region so it carries whichever message applies. One region, never two — a second `role="status"` would make `getByRole('status')` ambiguous and, more importantly, gives assistive tech two things to watch for one view:

```tsx
{
  /* Mounted from first render on purpose: a status region created together with its text is
          never announced — it has to already exist for assistive tech to be watching it. Mirrors
          the live region in MovementRow. Carries the empty-state copy when the list is empty and
          the paging announcement otherwise; the two can never apply at once. */
}
<span className="sr-only" role="status">
  {visible.length === 0 ? emptyMessage : pageMessage}
</span>;
```

Replace the "Show older" button so it announces what it did:

```tsx
<button
  type="button"
  onClick={() => {
    setDaysShown((d) => d + DAYS_PER_PAGE);
    const added = Math.min(hiddenDays, DAYS_PER_PAGE);
    setPageMessage(`${number.format(added)} more ${added === 1 ? 'day' : 'days'} shown`);
  }}
  className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 text-sm font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
>
  Show older ({number.format(hiddenDays)} more {hiddenDays === 1 ? 'day' : 'days'})
</button>
```

- [ ] **Step 4: Link the disclosure to the list it reveals**

Add `useId` to the React import:

```tsx
import { useEffect, useId, useMemo, useRef, useState } from 'react';
```

In `DrinkDayRow`, generate the id and wire both ends:

```tsx
const [open, setOpen] = useState(false);
const listId = useId();
```

On the button, add `aria-controls={listId}` beside `aria-expanded={open}`:

```tsx
        aria-expanded={open}
        aria-controls={listId}
```

On the revealed list, add the matching id:

```tsx
        <ul id={listId} className="flex flex-col gap-2 px-2 pb-2">
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/components/HistoryView.tsx src/features/coffee/history-view.test.tsx
git commit -m "fix(history): announce paging and name the list each day controls" -m "Show older appended 30 day groups silently, and they land before the button in DOM order — shift-tab walked backwards into content nothing had mentioned. The message reuses the view's single status region rather than adding a second one." -m "The collapsed-day button now points at the list it reveals via aria-controls."
```

---

### Task 7: Replace the blank loading frame and the inert empty state

Two states that currently say nothing useful:

- `if (!ready) return null` blanks the whole tab while `Header` simultaneously prints "0 capsules" with the low-stock dot. `HomeView.tsx:51-53` spends real effort on exactly this frame and explains why treating the pre-ready zero as truth "made the launch frame lie".
- The genuinely-empty state is inert text, where `HomeView.tsx:311` makes the equivalent a button that adds the first order. It also drops the `sr-only h2`, so heading navigation lands nowhere.

Making the empty state actionable requires an `onAdd` prop, matching how `HomeView` receives it. **Every `render(<HistoryView …>)` call site in the test file must gain `onAdd={vi.fn()}`** — there are nine.

**Files:**

- Modify: `src/features/coffee/components/HistoryView.tsx`
- Modify: `src/features/coffee/components/Coffee.tsx:34`
- Test: `src/features/coffee/history-view.test.tsx`

**Interfaces:**

- Consumes: everything from Tasks 1–6.
- Produces: `HistoryView` signature becomes `{ coffee: UseCoffee; onAdd: () => void }`.

- [ ] **Step 1: Write the failing tests**

Replace the existing `'renders nothing until the database has answered'` test with:

```tsx
test('says it is loading rather than claiming the history is empty', () => {
  // movements is [] both while OPFS is loading and when the app is genuinely empty. Rendering
  // nothing left the Header's "0 capsules" as the only thing on screen, which is a lie with 606
  // rows on disk.
  render(<HistoryView coffee={coffeeWith({ ready: false, movements: [] })} onAdd={vi.fn()} />);

  expect(screen.getByText(/Loading your history/)).toBeInTheDocument();
  expect(screen.queryByText(/Nothing logged yet/)).not.toBeInTheDocument();
});

test('the empty state offers the action that would fill it', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  render(<HistoryView coffee={coffeeWith({ ready: true, movements: [] })} onAdd={onAdd} />);

  // A dead end where HomeView offers a way out; and the sr-only heading must survive, or heading
  // navigation lands nowhere on this tab.
  expect(screen.getByRole('heading', { level: 2, name: 'History' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /add your first order/i }));

  expect(onAdd).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Add `onAdd` to the other seven render call sites**

Every remaining `render(<HistoryView coffee={…} />)` in the file becomes `render(<HistoryView coffee={…} onAdd={vi.fn()} />)`. The tests needing it:
`'a day of drinks collapses into one row instead of one row per cup'`,
`'expanding a collapsed day reveals each cup with its own delete control'`,
`'a single cup states its time rather than an empty range'`,
`'the log pages rather than mounting every day at once'`,
`'changing the filter resets how far the log was paged'`,
`'changing the filter returns the view to the top of the list'`,
`'paging the log announces how many more days appeared'`,
`'the collapsed day names the list it controls'`,
`'the filter announces as one exclusive choice, not three toggles'`.

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — TypeScript/runtime error on the unknown `onAdd` prop, and `Unable to find an element with the text: /Loading your history/`.

- [ ] **Step 4: Take the prop and rewrite both states**

In `src/features/coffee/components/HistoryView.tsx`, change the signature:

```tsx
export function HistoryView({ coffee, onAdd }: { coffee: UseCoffee; onAdd: () => void }) {
```

Replace the `if (!ready) return null;` line and the `movements.length === 0` early return with:

```tsx
// Gated on `ready` because before OPFS answers, `movements` is [] — indistinguishable from a
// genuinely empty app. The heading stays mounted through both states so heading navigation always
// has somewhere to land, and so the tab is never a blank rectangle under a header printing
// "0 capsules".
if (!ready) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="sr-only">History</h2>
      <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
        Loading your history…
      </p>
    </section>
  );
}

if (movements.length === 0) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="sr-only">History</h2>
      {/* A button, not a paragraph — the same offer HomeView makes when there is nothing to show.
            An empty log's only useful next step is putting something in it. */}
      <button
        type="button"
        onClick={onAdd}
        className="w-full rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-10 text-center text-sm text-[var(--color-muted)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        Nothing logged yet — add your first order.
      </button>
    </section>
  );
}
```

- [ ] **Step 5: Pass the prop from the shell**

In `src/features/coffee/components/Coffee.tsx`, replace line 34:

```tsx
<HistoryView coffee={coffee} onAdd={() => setAddOpen(true)} />
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/coffee/components/HistoryView.tsx src/features/coffee/components/Coffee.tsx src/features/coffee/history-view.test.tsx
git commit -m "fix(history): stop blanking the tab on load and dead-ending when empty" -m "Rendering null for the OPFS beat left the Header's '0 capsules' as the only thing on screen — the same lie HomeView already fixed for its own launch frame. Both states now keep the sr-only heading mounted so heading navigation has somewhere to land." -m "The empty state becomes a button that adds the first order, matching HomeView, which required threading onAdd from the shell."
```

---

### Task 8: Verify the whole change

- [ ] **Step 1: Run every gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: PASS on all five. Confirm by exit code — do not read a "0 problems" line as success on its own.

- [ ] **Step 2: Confirm the deleted helpers are truly gone**

Run: `git grep -n "matchesSearch\|historyTotals\|searchbox\|<Stat" -- src/ || echo "clean"`
Expected: `clean`

- [ ] **Step 3: Visual pass on a phone viewport**

Run `npm run dev`, open History at 412×915, and confirm:

- the filter bar pins under the header while the log scrolls beneath it
- the selected filter is bold _and_ accent-coloured
- only log rows carry a filled background — the filter bar and day labels do not
- switching filters jumps back to the top
- arrow keys move the selection when the filter has focus
- the delete confirm's label is legible on the red fill

- [ ] **Step 4: Re-run the critique to measure the change**

Run: `/impeccable critique src/features/coffee/components/HistoryView.tsx`
Expected: the trend line reads `21 → 26 → <new>`. The P0 (stranded controls) and all three P1s (the anti-reference composition, the money overflow, the contrast failures) should be resolved.

---

## Self-Review

**Spec coverage:** every section of the design spec maps to a task — deletions and the search removal to Task 1; the "a fill means record" rule, the header token, the sticky bar, the day label and the rhythm to Task 2; the scroll behaviour to Task 3; the radiogroup and weight-based selection to Task 4; the three `MovementRow` fixes to Task 5; `aria-controls` and the paging announcement to Task 6; the loading and empty states to Task 7. The spec's out-of-scope list (date jump, month anchors, undo, `Intl` consolidation) has deliberately no task.

**Placeholder scan:** no TBDs, no "add error handling", no "similar to Task N". Every code step shows the code.

**Type consistency:** `HistoryFilter` is used consistently in `FILTERS` (Task 4) and the `filter` state. `pageMessage` is named identically in Tasks 6's state, effect, and button. `onAdd: () => void` matches `HomeView`'s existing prop shape and the `Coffee.tsx` call site. `--header-h` and `--color-on-danger` are defined before first use (Tasks 2 and 5 respectively).

**Known ordering constraint:** Task 4 rewrites the filter wrapper that Task 2 creates, and Task 6 rewrites the "Show older" button and status region that Task 1 leaves in place. Execute in order.
