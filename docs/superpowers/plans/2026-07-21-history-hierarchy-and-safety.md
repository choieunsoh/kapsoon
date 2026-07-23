# History Hierarchy & Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the History tab's P0 delete hazard and its WCAG 2.2 focus failure, then give the page a visual rank by making a filled rectangle mean exactly one thing app-wide — "this is an order".

**Architecture:** Six independent tasks, each shippable alone. Tasks 1, 4 and part of 3 land in `MovementRow.tsx`, which is shared by Home and History — those are root-cause fixes at the single call site both views route through, not per-view patches. Task 2 is one CSS declaration. Tasks 5–6 are copy, semantics, and a scroll landmark in History only.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5.9 · Tailwind v4 (`@theme` tokens in `globals.css`) · Vitest + Testing Library · oxlint · oxfmt.

## Global Constraints

- **TypeScript house bans:** no `any`, no `as` casts (`as const` is fine), no `!` non-null assertion, no `// @ts-*` comments. `type` over `interface`. Prefer `for..of`.
- **Money is an integer minor unit** (satang). Never a float. Not touched by this plan.
- **Dates and numbers go through `Intl`** — never string slicing, `.split('T')[0]`, or manual zero-padding. Local timezone for anything user-facing.
- **One typeface.** Figures use `.tnum`. Never introduce a monospace font.
- **Colours come from `--color-*` tokens** in `src/app/globals.css @theme`. Do not add new hex values in components.
- **Quality gates, all must pass before each commit:** `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
- **Commit format:** `type(scope): description` with a body explaining WHY. Single scope word. Run `git commit` with repeated `-m` flags — never `-F` and never a heredoc.
- **Branch first.** Do not implement on `main`.
- **Accessibility target: WCAG 2.2 AA.** Body text ≥4.5:1, large/UI ≥3:1, touch targets ≥44px, status never encoded in colour alone.

---

## Task 0: Branch

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b history-hierarchy-and-safety
git status
```

Expected: `On branch history-hierarchy-and-safety`, working tree clean.

---

## Task 1: The delete confirmation must not put "Delete" under the finger that opened it

**Why:** `MovementRow.tsx` right-aligns both the trigger pair and the confirm pair in the same flex row. Trigger: `gap-1` with two `size-11` buttons — **Trash occupies the rightmost 44px**. Confirm: `gap-1.5` with Cancel then Delete — **Delete is the rightmost element**. So the destructive affirmative lands on the exact pixels the trigger just vacated. On a product whose own comment (`HomeView.tsx:298-301`) calls a careless one-handed double-tap "the app's most likely error", and where delete has no undo, that is a 300ms delay rather than a confirm step. Separately, `confirming` is cleared by nothing except an explicit Cancel — not blur, not a filter change — so a row armed and scrolled past stays armed.

**Known limitation to accept, not solve:** with Cancel moved to the right, `Delete` (~62px wide, starting ~66px from the right edge) partially overlaps where the benign **clock** button sat (48–92px from the right edge). Perfect non-overlap is impossible inside a 92px cluster without a larger layout change. This is the correct trade: the hazard is the _repeated tap on the same spot_ after tapping trash, and that spot now holds Cancel. Tapping clock is a different intent with no rapid-repeat pattern. Do not attempt to also dodge the clock — it costs a layout rewrite for a weaker hazard.

**Files:**

- Modify: `src/features/coffee/components/MovementRow.tsx:89-105`
- Create: `src/features/coffee/movement-row.test.tsx`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `movement-row.test.tsx` with a local `orderRow()` / `drinkRow()` `Movement` factory that Tasks 3 and 4 extend. Exact signatures:
  - `function drinkRow(overrides?: Partial<Movement>): Movement`
  - `function orderRow(overrides?: Partial<Movement>): Movement`

- [ ] **Step 1: Write the failing test**

Create `src/features/coffee/movement-row.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { Movement } from './db';
import { MovementRow } from './components/MovementRow';

// MovementRow is shared by Home's "Today" list and History's log, so every behaviour pinned here
// is pinned for both views at once.

function drinkRow(overrides: Partial<Movement> = {}): Movement {
  return {
    id: 'm1',
    shop: '',
    brand: '',
    beanName: '',
    delta: -1,
    price: 0,
    at: Date.UTC(2026, 6, 21, 9, 0),
    ...overrides,
  };
}

function orderRow(overrides: Partial<Movement> = {}): Movement {
  return drinkRow({
    id: 'o1',
    shop: 'Shopee',
    brand: 'Lavazza',
    beanName: 'Qualita Rossa',
    delta: 50,
    price: 62_000,
    ...overrides,
  });
}

test('the confirmation puts the benign action where the trash icon was', async () => {
  const user = userEvent.setup();
  render(
    <ul>
      <MovementRow movement={drinkRow()} onDelete={vi.fn()} onEditTime={vi.fn()} />
    </ul>,
  );

  await user.click(screen.getByRole('button', { name: 'Delete entry' }));

  // jsdom has no layout, so DOM order is the machine-checkable proxy for screen position: both
  // clusters are right-aligned in the same flex row, so the LAST child is the rightmost element.
  // Trash is last in the trigger cluster; Cancel must be last in the confirm cluster, or the
  // destructive affirmative sits on the pixels the trigger just vacated and a repeated tap deletes.
  const confirm = screen.getByRole('button', { name: 'Cancel' }).parentElement;
  expect(confirm).not.toBeNull();
  const buttons = within(confirm ?? document.body).getAllByRole('button');
  expect(buttons.map((b) => b.textContent)).toEqual(['Delete', 'Cancel']);
});

test('an armed row disarms when focus leaves it', async () => {
  const user = userEvent.setup();
  render(
    <>
      <ul>
        <MovementRow movement={drinkRow()} onDelete={vi.fn()} onEditTime={vi.fn()} />
      </ul>
      <button type="button">elsewhere</button>
    </>,
  );

  await user.click(screen.getByRole('button', { name: 'Delete entry' }));
  expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'elsewhere' }));

  // Left armed, a row scrolled past keeps a destructive control where a benign one is expected.
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete entry' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/coffee/movement-row.test.tsx`

Expected: FAIL. First test fails with `expected [ 'Cancel', 'Delete' ] to deeply equal [ 'Delete', 'Cancel' ]`. Second test fails because the Delete button is still present after clicking elsewhere.

- [ ] **Step 3: Swap the confirm pair and add focus-out disarm**

In `src/features/coffee/components/MovementRow.tsx`, replace lines 89-105 (the `confirming ? (...)` branch) with:

```tsx
          {confirming ? (
            // Delete FIRST, Cancel last. Both clusters are right-aligned in the same flex row, so
            // the last child is the rightmost element — and the trigger's last child is the trash
            // icon. Ordering Cancel last means the second tap of a careless one-handed double-tap
            // lands on the benign action instead of destroying the row. `onBlur` disarms when focus
            // leaves the pair, so a row armed and scrolled past cannot keep a destructive control
            // sitting where a benign one is expected.
            <div
              className="flex items-center gap-1.5"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setConfirming(false);
              }}
            >
              <button
                type="button"
                onClick={() => onDelete?.(movement.id)}
                className="rounded-[var(--radius-sm)] bg-[var(--color-danger)] px-2.5 text-sm font-medium text-[var(--color-on-danger)]"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-[var(--radius-sm)] px-2 text-sm text-[var(--color-muted)]"
              >
                Cancel
              </button>
            </div>
          ) : (
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/coffee/movement-row.test.tsx`

Expected: PASS, 2 passed.

- [ ] **Step 5: Run the full gates**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

Expected: exit code 0. (Check the **exit code**, not printed text — a lint run has previously printed "✓ 0 problems" while exiting 1.)

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/components/MovementRow.tsx src/features/coffee/movement-row.test.tsx
git commit -m "fix(history): stop the delete confirmation landing under the finger that opened it" -m "Both control clusters are right-aligned in the same flex row, so Delete occupied the exact pixels the trash icon had just vacated. Delete has no undo, and HomeView already documents a careless one-handed double-tap as the app's most likely error, so the confirm step was functionally a 300ms delay." -m "Cancel is now the rightmost element, and onBlur disarms the pair so a row armed and scrolled past cannot keep a destructive control where a benign one is expected."
```

---

## Task 2: Keyboard focus must not land under the sticky bars (WCAG 2.2 SC 2.4.11)

**Why:** History's filter bar is `sticky` with an opaque `--color-bg` and `z-10` (`HistoryView.tsx:146`); the Header sits above it at a higher z-index. `scroll-padding`, `scroll-margin`, and `scroll-mt` appear **zero times** anywhere in `src/` — verified. So tabbing down through up to 30 day-groups scrolls each newly-focused element to the viewport edge, directly beneath the opaque sticky stack, with the `:focus-visible` outline (`globals.css:86-89`) painted underneath it. WCAG 2.2 added SC 2.4.11 _Focus Not Obscured (Minimum)_ at level AA and `PRODUCT.md` commits to WCAG 2.2 AA, so this is a conformance failure, not a judgement call.

**Arithmetic for the value:** Header is `var(--header-h)` = 3.5rem = 56px plus a 1px `border-b` that sits outside it. The filter bar is `py-2` (16px) around buttons with the global 44px `min-height`, plus its own 1px `border-b` = 61px. Total sticky stack below the safe area = 56 + 1 + 61 = **118px**. `var(--header-h) + 4rem` = 56 + 64 = 120px, giving 2px of slack. Bottom uses `6rem`, the same constant `Coffee.tsx:30` already uses to clear the fixed nav.

**Files:**

- Modify: `src/app/globals.css:46-59` (the `:root` block)

**Interfaces:**

- Consumes: `--header-h`, already declared at `globals.css:52`.
- Produces: nothing later tasks depend on.

**No unit test.** jsdom implements no layout and no scrolling, so `scroll-padding` is unobservable in Vitest; a test asserting the declaration string exists would test the implementation, not the behaviour. Verification is the browser check in Step 2 plus the gates. Do not fabricate a test for this task.

- [ ] **Step 1: Add the scroll padding**

In `src/app/globals.css`, inside the existing `:root` block, immediately after the `--header-h` declaration and its comment (currently line 52), add:

```css
/* WCAG 2.2 SC 2.4.11 (Focus Not Obscured). History's filter bar pins beneath the sticky Header,
     both opaque, so without this the browser scrolls each newly-focused element flush to the
     viewport edge — underneath both bars, with the :focus-visible ring painted below them. Tabbing
     through 30 day-groups put every stop out of sight. 4rem covers the filter bar (16px padding +
     44px minimum target + 1px border = 61px) plus the header's own 1px border, with 2px of slack.
     The bottom value matches the 6rem <main> already uses to clear the fixed nav. */
scroll-padding-top: calc(env(safe-area-inset-top) + var(--header-h) + 4rem);
scroll-padding-bottom: calc(env(safe-area-inset-bottom) + 6rem);
```

- [ ] **Step 2: Verify in a real browser (this is the test)**

```bash
npm run dev
```

Open the app, go to the History tab, click the "All" filter, then press `Tab` repeatedly about fifteen times.

Expected: every focused element comes to rest **below** the filter bar with its full accent focus ring visible. Before the change, focused elements land behind the bar. Stop the dev server when done.

- [ ] **Step 3: Run the full gates**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "fix(theme): keep focused elements out from under the sticky bars" -m "History's filter bar pins beneath the sticky Header and both are opaque, so tabbing through the log scrolled every focus stop flush to the viewport edge and underneath them — the focus ring painted below both bars. WCAG 2.2 SC 2.4.11 is an AA criterion and PRODUCT.md targets 2.2 AA, so this was a conformance failure rather than a preference." -m "scroll-padding-top covers header + filter bar (56 + 1 + 61px) with slack; scroll-padding-bottom reuses the 6rem <main> already spends clearing the fixed nav."
```

---

## Task 3: A filled rectangle means "this is an order" — everywhere

**Why:** At real scale History renders ~30 identical `bg-[var(--color-surface)] rounded-[var(--radius-md)]` rectangles per page, at one width, in two type ranks. `PRODUCT.md` names this by name in its anti-references: _"Undifferentiated card grids. Equal-weight rounded rectangles stacked down the page are the failure mode this app is already closest to; every block must earn its visual weight."_ Worse, the fill doing all the "this is a record" work measures **1.06:1** against the page background (`#16181d` on `#101114`) — a 6% luminance step. The comment at `HistoryView.tsx:283-286` argues the fill must sit on each row so every cup reads as its own record; the reasoning is sound but the fill is not perceptible enough to make it true, so the page pays a card grid's visual cost without collecting the legibility benefit.

Both sibling views already un-carded and carry comments explaining it (`HomeView.tsx:263-270`, `DashboardView.tsx:30-34`) — but they reached _different_ answers while citing the same line. This task writes the rule down and applies it once, at the shared component: **the fill marks an order.** 9 of 606 movements are orders, they are the reason to open History at all, and they currently look exactly like the 118 routine drink-days around them. That solves the rank problem and the order-visibility problem with one change.

**Consequence to accept deliberately:** `MovementRow` is also used by Home's "Today" list (`HomeView.tsx:302`), where every row is a drink. Those rows lose their individual fills. To keep Home coherent, its `<ul>` becomes one surface block split by hairlines — which is exactly the pattern `HomeView.tsx:271` already uses for the figures block directly above it. History's list gets hairlines on the page background instead, because wrapping it in a fill would recreate the blob this task exists to remove. Same row component, two containers, each expressing its own grouping.

**Files:**

- Modify: `src/features/coffee/components/MovementRow.tsx:44`
- Modify: `src/features/coffee/components/HistoryView.tsx:170` (heading rank), `:173` (list container), `:286-303` (drink-day summary), `:308` (revealed cup list)
- Modify: `src/features/coffee/components/HomeView.tsx:296` (Today list container)
- Modify: `src/features/coffee/movement-row.test.tsx` (add one test)

**Interfaces:**

- Consumes: `drinkRow()` / `orderRow()` from Task 1's test file.
- Produces: no new exports. The rule "`bg-[var(--color-surface)]` on a log row means the movement is an order" is what later readers rely on.

- [ ] **Step 1: Write the failing test**

Append to `src/features/coffee/movement-row.test.tsx`:

```tsx
test('the surface fill marks an order, and a drink carries none', () => {
  // The one visual rule this app now states once and applies everywhere: a filled rounded rectangle
  // in a log means "this is an order". 9 of 606 movements are orders and they are the reason to
  // open History, so the fill is the rank signal. Asserted on the class because a fill has no
  // behavioural surface — this is the contract, not an implementation detail.
  const { rerender } = render(
    <ul>
      <MovementRow movement={orderRow()} />
    </ul>,
  );
  expect(screen.getByRole('listitem').className).toContain('bg-[var(--color-surface)]');

  rerender(
    <ul>
      <MovementRow movement={drinkRow()} />
    </ul>,
  );
  expect(screen.getByRole('listitem').className).not.toContain('bg-[var(--color-surface)]');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/coffee/movement-row.test.tsx`

Expected: FAIL on the second assertion — the drink row currently carries the fill unconditionally.

- [ ] **Step 3: Make the fill conditional in MovementRow**

In `src/features/coffee/components/MovementRow.tsx`, replace line 44:

```tsx
    <li className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2.5">
```

with:

```tsx
    // The fill marks an ORDER and nothing else. 9 of 606 movements are orders, and they are the
    // reason to open History at all — a filled block among hairline-separated drink rows is the
    // rank signal PRODUCT.md's anti-reference asks for ("every block must earn its visual weight").
    // Against --color-bg the fill measures only 1.06:1, so it was never a legible record boundary
    // when every row carried it; as a 1-in-13 promotion it reads. Drink rows are separated by the
    // container's hairlines instead.
    <li
      className={`flex items-center gap-3 px-3 py-2.5 ${
        isOrder ? 'rounded-[var(--radius-md)] bg-[var(--color-surface)]' : ''
      }`}
    >
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/coffee/movement-row.test.tsx`

Expected: PASS, 3 passed.

- [ ] **Step 5: Give History's lists hairlines and rank the day heading up**

In `src/features/coffee/components/HistoryView.tsx`:

Replace lines 170-172 (the day heading) with:

```tsx
{
  /* The organising key must outrank what it organises. At text-sm this heading
                        was quieter than the 16px semibold row beneath it, so 127 day-groups had no
                        visible skeleton — the only landmark on a 15-screen scroll ranked below the
                        content. */
}
<h3 className="mb-2 px-1 text-base font-semibold text-[var(--color-text)]">
  {formatDayLabel(group.at)}
</h3>;
```

Replace line 173 (the day's list container):

```tsx
                    <ul className="flex flex-col gap-2">
```

with:

```tsx
                    {/* Hairlines, not gaps between filled pills. The fill now belongs to orders
                        alone (see MovementRow), so drink rows are separated by the container the
                        way HomeView's figures block is — one thought, split, rather than a stack of
                        equal rectangles. An order row keeps its fill and reads as a promoted block
                        inside the divided stack. */}
                    <ul className="divide-y divide-[var(--color-border)]">
```

Replace lines 286-294 (the `DrinkDayRow` disclosure button's opening tag and className) — the button currently reads:

```tsx
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="flex w-full items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2.5 text-left"
      >
```

Replace only its `className` with:

```tsx
className = 'flex w-full items-center gap-3 px-3 py-2.5 text-left';
```

and update the comment block immediately above the `<li>` at lines 281-284 to:

```tsx
// No fill at either level: a filled rectangle in this app now means "this is an order", and a
// day's drinking is neither an order nor a single record. The day heading above and the
// container's hairlines carry the grouping; the chevron carries the affordance.
```

Replace line 308 (the revealed cup list):

```tsx
        <ul id={listId} className="mt-2 flex flex-col gap-2">
```

with:

```tsx
        <ul
          id={listId}
          className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]"
        >
```

- [ ] **Step 6: Keep Home coherent — one surface block split by hairlines**

In `src/features/coffee/components/HomeView.tsx`, replace line 296:

```tsx
          <ul className="flex flex-col gap-2">
```

with:

```tsx
          {/* One surface block split by hairlines, matching the figures block above. MovementRow's
              fill now marks an order and today's rows are all drinks, so the grouping moved to the
              container — which is the treatment this view already chose for its other stack. */}
          <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface)]">
```

- [ ] **Step 7: Run the whole suite**

Run: `npm test`

Expected: PASS. `home-view.test.tsx`, `history-view.test.tsx` and `dashboard-view.test.tsx` query by role and text, not by class, so none should break. If any test fails on a class or structure assertion, fix the **test** only if it was asserting the old fill; otherwise the implementation is wrong.

- [ ] **Step 8: Look at all three views in a browser — this composition cannot be checked in jsdom**

```bash
npm run dev
```

Check, at a 430px-wide viewport:

1. **History** — day headings clearly outrank rows; drink days separated by hairlines with no filled pills; an order row reads as a filled block standing out from the drinks around it.
2. **History, day expanded** — revealed cups are hairline-separated under the summary, and the group still reads as one day.
3. **Home** — "Today" is one rounded surface block split by hairlines, visually a sibling of the figures block above it.

If an order row's fill fights the divider drawn above it, add `border-t-0` to the order's `<li>` classes and re-check. Stop the dev server when done.

- [ ] **Step 9: Run the full gates**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

Expected: exit code 0.

- [ ] **Step 10: Commit**

```bash
git add src/features/coffee/components/MovementRow.tsx src/features/coffee/components/HistoryView.tsx src/features/coffee/components/HomeView.tsx src/features/coffee/movement-row.test.tsx
git commit -m "refactor(history): make a filled rectangle mean one thing — an order" -m "History rendered ~30 identical filled rounded rectangles per page, which is the exact anti-reference PRODUCT.md names. The fill carrying that weight measures 1.06:1 on the page background, so it was never a legible record boundary anyway — the page paid a card grid's cost without collecting the benefit." -m "The fill now marks an order (9 of 606 movements, and the reason to open History at all); drink rows are separated by container hairlines. Home's Today list becomes one surface block split by hairlines, matching the figures block above it. The day heading moves to text-base so the organising key outranks what it organises."
```

---

## Task 4: A failed delete must not look like a successful one

**Why:** `MovementRow.tsx:100` calls `onDelete?.(movement.id)` and discards the returned promise. `use-coffee.ts:80-86` shows `removeMovement` is `async` with no internal `catch`, writing to OPFS — a write that can genuinely fail if cross-origin isolation is lost. Today the row stays, the confirm stays armed, and nothing is shown or announced. `HomeView.tsx:49` and `:176` already establish the rule in this codebase's own words: _"A rejected write must not look like a successful one… `void` here made that indistinguishable from success."_ `MovementRow` is shared, so this single fix covers History **and** Home's Today list.

**Files:**

- Modify: `src/features/coffee/components/MovementRow.tsx:15` (the `onDelete` type), `:25` (state), `:86-88` (live region), `:98-104` (the Delete handler)
- Modify: `src/features/coffee/movement-row.test.tsx` (add one test)

**Interfaces:**

- Consumes: `drinkRow()` from Task 1; the confirm-pair markup from Task 1.
- Produces: `onDelete` widens to `(id: string) => void | Promise<void>`. Existing callers pass `removeMovement: (id: string) => Promise<void>` (`use-coffee.ts:80`) and `vi.fn(async () => {})` (`test/coffee-fixture.ts:20`); both remain assignable, so no call site changes.

- [ ] **Step 1: Write the failing test**

Append to `src/features/coffee/movement-row.test.tsx`:

```tsx
test('a delete that fails says so instead of looking like it worked', async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn(() => Promise.reject(new Error('OPFS unavailable')));
  render(
    <ul>
      <MovementRow movement={drinkRow()} onDelete={onDelete} onEditTime={vi.fn()} />
    </ul>,
  );

  await user.click(screen.getByRole('button', { name: 'Delete entry' }));
  await user.click(screen.getByRole('button', { name: 'Delete' }));

  // The row is still on screen because the write failed. Without this, that is indistinguishable
  // from a successful delete of a row the list happened to re-render — the failure is silent.
  expect(await screen.findByText("That entry didn't delete.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/coffee/movement-row.test.tsx`

Expected: FAIL — `Unable to find an element with the text: That entry didn't delete.` (Vitest may additionally report an unhandled rejection; that is the bug.)

- [ ] **Step 3: Widen the type, catch the rejection, announce it**

In `src/features/coffee/components/MovementRow.tsx`:

Replace line 15:

```tsx
  onDelete?: (id: string) => void;
```

with:

```tsx
  // Returns a promise when the caller writes to OPFS (both real callers do). Typed as
  // `void | Promise<void>` so the row can await the outcome without forcing a read-only caller to
  // be async.
  onDelete?: (id: string) => void | Promise<void>;
```

Replace line 25:

```tsx
const [confirming, setConfirming] = useState(false);
```

with:

```tsx
const [confirming, setConfirming] = useState(false);
const [failed, setFailed] = useState(false);
```

Replace lines 86-88 (the live region):

```tsx
<span className="sr-only" aria-live="polite">
  {confirming ? 'Delete confirmation required.' : ''}
</span>
```

with:

```tsx
<span className="sr-only" aria-live="polite">
  {failed ? "That entry didn't delete." : confirming ? 'Delete confirmation required.' : ''}
</span>
```

Replace the Delete button written in Task 1 with:

```tsx
<button
  type="button"
  onClick={() => {
    // HomeView.tsx:49 states the rule this follows: a rejected write must not look
    // like a successful one. The OPFS write can fail if cross-origin isolation is
    // lost, and dropping the promise left the row on screen with nothing said —
    // identical to a successful delete followed by a re-render.
    setFailed(false);
    const result = onDelete?.(movement.id);
    if (result instanceof Promise) result.catch(() => setFailed(true));
  }}
  className="rounded-[var(--radius-sm)] bg-[var(--color-danger)] px-2.5 text-sm font-medium text-[var(--color-on-danger)]"
>
  Delete
</button>
```

Then add the visible counterpart. Immediately **after** the closing `</>` of the `actionable ? (...)` block's fragment contents — that is, as the last child inside the fragment, after the `confirming ? ... : ...` ternary and before `</>` — insert:

```tsx
{
  /* Visible counterpart to the live region above: a screen-reader user is told, and a
              sighted user must be too. Sits at the end of the row so it doesn't reflow the controls. */
}
{
  failed ? <span className="text-xs text-[var(--color-danger)]">Didn&apos;t delete</span> : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/coffee/movement-row.test.tsx`

Expected: PASS, 4 passed.

- [ ] **Step 5: Run the full gates**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/coffee/components/MovementRow.tsx src/features/coffee/movement-row.test.tsx
git commit -m "fix(history): stop a failed delete looking like a successful one" -m "The delete handler dropped the promise from removeMovement, which writes to OPFS and can reject if cross-origin isolation is lost. The row stayed on screen with nothing said — indistinguishable from a successful delete followed by a re-render. HomeView already states this rule for the drink path." -m "MovementRow is shared, so this covers History's log and Home's Today list from one place."
```

---

## Task 5: Copy and semantics — one word for the unit, day groups a screen reader can navigate, no dead-end

**Why:** Three small defects with the same root — the page was solved as a data problem and never read back as prose.

1. `HistoryView.tsx:29` labels the filter **"Drinks"**. That is the app's only use of the noun; everywhere else counts _capsules_. `HomeView.tsx:273-275` already documents the rule it breaks: _"a second word for the same unit is the kind of inconsistency that makes a reader stop and check whether it means something different."_
2. Day groups are bare `<div>`s (`:169`). TalkBack's controls list on this page yields ~30 buttons named _"3 capsules 07:00 – 21:00"_ with **no date** — the `<h3>` supplies it in reading order only, and nothing binds the two outside linear traversal.
3. The filter-empty state (`:161-164`) is an inert `<p>`, while the same situation on Home is a button that offers the fix — and `onAdd` is already sitting in props at `:34`. Only the **Orders** case gets a button: logging a capsule is Home's primary action, not something History should offer.

**Files:**

- Modify: `src/features/coffee/components/HistoryView.tsx:27-31`, `:161-164`, `:169`, `:183`
- Modify: `src/features/coffee/history-view.test.tsx:88`, `:130`, `:183`, `:189` (the renamed filter), plus one new test

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: the filter option `{ value: 'drinks', label: 'Capsules' }` — the `value` stays `'drinks'` because it is the `HistoryFilter` type's member in `db.ts`; only the visible label changes. Do not rename the type member.

- [ ] **Step 1: Write the failing test**

In `src/features/coffee/history-view.test.tsx`, append:

```tsx
test('the log names its unit the way the rest of the app does, and binds each day to its date', async () => {
  const user = userEvent.setup();
  render(
    <HistoryView
      coffee={coffeeWith({ movements: newestFirst([drink(1, 7), drink(1, 12)]) })}
      onAdd={vi.fn()}
    />,
  );

  // "Drinks" was the app's only use of that noun; everything else counts capsules.
  expect(screen.getByRole('radio', { name: 'Capsules' })).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: 'Drinks' })).not.toBeInTheDocument();

  // Without the binding, TalkBack's controls list is ~30 buttons reading "2 capsules 07:00 – 12:00"
  // with no date anywhere — the <h3> supplies it in reading order only.
  const day = screen.getByRole('region', { name: 'Yesterday' });
  expect(within(day).getByRole('button', { expanded: false })).toBeInTheDocument();
  await user.click(within(day).getByRole('button', { expanded: false }));
  expect(within(day).getAllByText('Drank a coffee').length).toBe(2);
});

test('an empty Orders filter offers the action that would fill it', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  render(<HistoryView coffee={coffeeWith({ movements: [drink(1, 9)] })} onAdd={onAdd} />);

  await user.click(screen.getByRole('radio', { name: 'Orders' }));
  await user.click(screen.getByRole('button', { name: /No orders logged yet/i }));

  expect(onAdd).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/coffee/history-view.test.tsx`

Expected: FAIL — no radio named "Capsules", no region named "Yesterday", and the orders-empty state is a `<p>` not a button.

- [ ] **Step 3: Rename the filter label**

In `src/features/coffee/components/HistoryView.tsx`, replace lines 27-31:

```tsx
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'orders', label: 'Orders' },
] as const satisfies readonly { value: HistoryFilter; label: string }[];
```

with:

```tsx
// "Capsules", not "Drinks": the rest of the app counts capsules ("162 capsules left", "Capsules this
// week", "6 capsules"), and a second word for the same unit makes a reader stop to check whether it
// means something different. The `value` stays `drinks` — that is the HistoryFilter member in db.ts,
// and renaming a type member to fix a label would be a migration for no gain.
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'drinks', label: 'Capsules' },
  { value: 'orders', label: 'Orders' },
] as const satisfies readonly { value: HistoryFilter; label: string }[];
```

- [ ] **Step 4: Bind each day group to its heading**

In `src/features/coffee/components/HistoryView.tsx`, the day-group map currently opens at line 169 with `<div key={group.key}>`. Replace that opening tag with a labelled region, and give the heading an id. The block becomes:

```tsx
                {shown.map((group) => (
                  // A <section> with aria-labelledby, not a bare <div>: without it, TalkBack's
                  // controls list is ~30 buttons reading "3 capsules 07:00 – 21:00" with no date
                  // anywhere, because the <h3> supplies it in reading order only and nothing binds
                  // the two outside linear traversal.
                  <section key={group.key} aria-labelledby={`day-${group.key}`}>
                    <h3
                      id={`day-${group.key}`}
                      className="mb-2 px-1 text-base font-semibold text-[var(--color-text)]"
                    >
                      {formatDayLabel(group.at)}
                    </h3>
```

and change its closing tag (currently `</div>` at line 184) to:

```tsx
                  </section>
```

- [ ] **Step 5: Give the empty Orders filter a way out**

In `src/features/coffee/components/HistoryView.tsx`, replace lines 158-164 (the `visible.length === 0` branch and its comment) with:

```tsx
          {/* An empty result here means the FILTER matched nothing — the movements.length === 0
              branch above already covers a genuinely empty app. Purely visual: the sr-only status
              region above carries the announcement so this text can safely mount with the list.
              Orders offers the action that would fill it, the way HomeView does; Capsules does not,
              because logging a capsule is Home's primary control and History should not grow a
              second one. */}
          {visible.length === 0 ? (
            filter === 'orders' ? (
              <button
                type="button"
                onClick={onAdd}
                className="w-full rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center text-sm text-[var(--color-muted)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                {emptyMessage} Add one.
              </button>
            ) : (
              <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center text-sm text-[var(--color-muted)]">
                {emptyMessage}
              </p>
            )
          ) : (
```

- [ ] **Step 6: Update the existing tests that name the old label**

In `src/features/coffee/history-view.test.tsx`, change every `{ name: 'Drinks' }` to `{ name: 'Capsules' }`. There are four occurrences: lines 88, 130, 183, and 189 (`expect(screen.getByRole('radio', { name: 'Drinks' })).not.toBeChecked()` and its partner in the arrow-key test).

Verify none remain:

```bash
grep -n "'Drinks'" src/features/coffee/history-view.test.tsx
```

Expected: no output.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 8: Run the full gates**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

Expected: exit code 0.

- [ ] **Step 9: Commit**

```bash
git add src/features/coffee/components/HistoryView.tsx src/features/coffee/history-view.test.tsx
git commit -m "fix(history): one word for the unit, a date on every day group, no dead end" -m "The filter said \"Drinks\" — the app's only use of that noun against \"capsules\" everywhere else, which HomeView already documents as the kind of inconsistency that makes a reader stop. Day groups were bare divs, so a screen reader's controls list read ~30 buttons named \"3 capsules 07:12 – 21:08\" with no date anywhere. The empty Orders filter was inert text where Home offers the action, with onAdd already in props." -m "The HistoryFilter value stays 'drinks'; only the visible label changed."
```

---

## Task 6: Give a 15-screen scroll its only landmark

**Why:** 127 day-groups render up to 30 `h3`s per page with nothing above them but a single `sr-only h2`. There is no month divider, no week break, no change in rhythm — every ~96px looks like the previous ~96px, and a user looking for a day they know exists has no way to navigate to it except paging linearly. A month band costs one comparison per group and gives both sighted and screen-reader users the skeleton the page currently lacks.

**Design decision:** the band renders only when a group's month **differs from the previous shown group's**, so it never appears above the first group. That avoids "July 2026" sitting redundantly above "Today", and puts landmarks exactly where the scroll needs them.

**Files:**

- Modify: `src/features/coffee/datetime.ts` (add two exports)
- Create: nothing
- Modify: `src/features/coffee/components/HistoryView.tsx` (render the band)
- Modify: `src/features/coffee/datetime.test.ts` if it exists, else add the test to `src/features/coffee/history-view.test.tsx`

**Interfaces:**

- Consumes: `shown` (the sliced group array) in `HistoryView`.
- Produces:
  - `export function isSameMonth(a: number, b: number): boolean`
  - `export function formatMonthLabel(at: number): string` — returns e.g. `"June 2026"`

- [ ] **Step 1: Check where datetime tests live**

```bash
ls src/features/coffee/*.test.ts
```

If `datetime.test.ts` exists, put Step 2's test there. If not, put it in `src/features/coffee/history-view.test.tsx` and import the helpers there.

- [ ] **Step 2: Write the failing test**

```tsx
import { formatMonthLabel, isSameMonth } from './datetime';

test('month comparison is calendar-based, not a 30-day window', () => {
  // Date arithmetic, not string slicing — matching how every other boundary in this file works, and
  // so a device timezone change can't shift which month a timestamp belongs to.
  expect(isSameMonth(Date.UTC(2026, 5, 1, 12), Date.UTC(2026, 5, 30, 12))).toBe(true);
  expect(isSameMonth(Date.UTC(2026, 5, 30, 12), Date.UTC(2026, 6, 1, 12))).toBe(false);
  // Same month number, different year.
  expect(isSameMonth(Date.UTC(2025, 6, 15, 12), Date.UTC(2026, 6, 15, 12))).toBe(false);
});

test('a month label names the month and the year', () => {
  expect(formatMonthLabel(Date.UTC(2026, 5, 15, 12))).toBe('June 2026');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/features/coffee/datetime.test.ts` (or the history test file if that's where you put it)

Expected: FAIL — `isSameMonth is not a function`.

- [ ] **Step 4: Add the helpers**

In `src/features/coffee/datetime.ts`, add to the formatter block near the top (after `dayFull`, currently line 13):

```ts
const monthFull = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
```

and add to the Display section, after `formatDayLabel` (currently ends line 88):

```ts
// Whether two timestamps fall in the same local calendar month. Date arithmetic rather than slicing
// a formatted string, matching every period boundary above — and it must compare the year too, or
// last July and this July collapse into one month on a ledger that spans a year.
export function isSameMonth(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth();
}

// "June 2026" — the only landmark on a log that runs to 127 day-groups.
export function formatMonthLabel(at: number): string {
  return monthFull.format(at);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/features/coffee/datetime.test.ts` (or the history test file)

Expected: PASS.

- [ ] **Step 6: Render the band in History**

In `src/features/coffee/components/HistoryView.tsx`, add to the import from `../datetime` (currently line 12) so it reads:

```tsx
import { formatDayLabel, formatMonthLabel, formatTime, groupByDay, isSameMonth } from '../datetime';
```

Then change the day-group map so it receives the index, and render the band. The `shown.map((group) => (` opening from Task 5 becomes:

```tsx
                {shown.map((group, index) => {
                  // Only when the month CHANGES from the previous shown group — never above the
                  // first, where "July 2026" over "Today" is noise. 127 day-groups otherwise scroll
                  // for ~15 screens with no landmark at all, so a user looking for a day they know
                  // exists can only page linearly toward it.
                  const previous = shown[index - 1];
                  const startsMonth = previous !== undefined && !isSameMonth(previous.at, group.at);
                  return (
                    <section key={group.key} aria-labelledby={`day-${group.key}`}>
                      {startsMonth ? (
                        <p className="mb-3 border-t border-[var(--color-border)] pt-4 text-xs font-semibold tracking-wide text-[var(--color-muted)]">
                          {formatMonthLabel(group.at)}
                        </p>
                      ) : null}
                      <h3
                        id={`day-${group.key}`}
                        className="mb-2 px-1 text-base font-semibold text-[var(--color-text)]"
                      >
                        {formatDayLabel(group.at)}
                      </h3>
```

and close the map with `);` and `})}` instead of `))}` — the closing of the block becomes:

```tsx
                    </section>
                  );
                })}
```

- [ ] **Step 7: Write the integration test for the band**

Append to `src/features/coffee/history-view.test.tsx`:

```tsx
test('a month change is the only landmark on a log this long, so it is marked', () => {
  // Two days either side of a month boundary. startOfDaysAgo walks calendar dates, so 45 days back
  // is reliably in a different month than yesterday regardless of when this test runs.
  const movements = newestFirst([drink(1, 9, 'recent'), drink(45, 9, 'older')]);
  render(<HistoryView coffee={coffeeWith({ movements })} onAdd={vi.fn()} />);

  const headings = screen.getAllByRole('heading', { level: 3 });
  expect(headings.length).toBe(2);

  // Exactly one band: above the older group, never above the first.
  const label = formatMonthLabel(startOfDaysAgo(45));
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.queryByText(formatMonthLabel(startOfDaysAgo(1)))).not.toBeInTheDocument();
});
```

Add `formatMonthLabel` to the existing `./datetime` import at the top of the file (currently `import { startOfDaysAgo } from './datetime';`):

```tsx
import { formatMonthLabel, startOfDaysAgo } from './datetime';
```

**Note:** if the test runs in a month where 45 days back happens to land such that `formatMonthLabel(startOfDaysAgo(1))` equals `formatMonthLabel(startOfDaysAgo(45))`, the final assertion is vacuous — it cannot happen, since 45 days always crosses at least one month boundary, but if the suite ever fails here, widen to 70 days rather than weakening the assertion.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 9: Check it in a browser**

```bash
npm run dev
```

On History, tap "Show older" until the log crosses a month boundary. Expected: a quiet "June 2026" band with a hairline above it, sitting above the first day of that month and nowhere else. Stop the dev server.

- [ ] **Step 10: Run the full gates**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

Expected: exit code 0.

- [ ] **Step 11: Commit**

```bash
git add src/features/coffee/datetime.ts src/features/coffee/components/HistoryView.tsx src/features/coffee/history-view.test.tsx
git commit -m "feat(history): mark month boundaries so the log has a landmark" -m "127 day-groups scroll for roughly 15 screens with nothing but day headings — no month divider, no change in rhythm — so a user looking for a day they know exists can only page linearly toward it." -m "The band renders only where the month changes from the previous shown group, so it never sits redundantly above Today. isSameMonth compares year and month via Date arithmetic rather than slicing a formatted string, matching every other boundary helper in datetime.ts."
```

---

## Task 7: Re-critique and finish

- [ ] **Step 1: Re-run the design critique against the changed tree**

```
/impeccable critique src/features/coffee/components/HistoryView.tsx
```

Expected: the P0 (delete geometry), both P1s (SC 2.4.11, the card grid), and both P2s (order rank, silent delete failure) are gone. The snapshot lands in `.impeccable/critique/` and the trend line shows the new score.

- [ ] **Step 2: Confirm the whole gate suite one final time**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

Expected: exit code 0. Verify by exit code, not by printed text.

- [ ] **Step 3: Review the full diff**

```bash
git diff main...HEAD --stat
```

Expected: changes in `MovementRow.tsx`, `HistoryView.tsx`, `HomeView.tsx`, `globals.css`, `datetime.ts`, plus `movement-row.test.tsx` (new) and `history-view.test.tsx`.

- [ ] **Step 4: Finish the branch**

Use `superpowers:finishing-a-development-branch` to choose between merge, PR, or cleanup.

---

## Out of scope — deliberately not in this plan

These came out of the critique and were **not** selected. Recorded so a later reader knows they were considered, not missed:

- **Undo for delete.** Soft-delete plus an undo affordance is the fuller safety net. Task 1 takes the geometry fix instead, which removes the failure mode without new state or a data-layer change.
- **Auto-disarm on scroll.** Task 1 disarms on focus-out only. Catching pure scrolling needs an IntersectionObserver per row — real cost, marginal gain over the geometry swap.
- **Whether History should exist in this shape at all.** The critique asked whether a 597-drink log is a log or a daily count, whether `WeekGrid`'s calendar is the better surface, whether "Orders" should be the default filter, and whether a 60-day horizon plus the backup file would serve better than unbounded paging. All four are design questions, not fixes — they need a brainstorm before a plan.
- **Consolidating the five duplicate `new Intl.NumberFormat('en-US')` module constants** into `src/shared/`. Noted in an earlier critique; unrelated to this branch's topic and belongs in its own commit.
