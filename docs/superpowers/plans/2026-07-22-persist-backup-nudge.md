# Persist Storage + Backup-Age Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the silent-data-loss hole by requesting persistent OPFS storage and quietly nudging when the manual backup is stale.

**Architecture:** One pure decision function (`backupStatus`) in `backup.ts`, four thin storage-boundary helpers in `db.ts` (persistence request/query + last-backup timestamp read/write), the overdue flag surfaced from `useCoffee` so both `SettingsView` and `BottomNav` read one source, and two UI touches (a factual nudge + storage line in Settings, an accent dot on the "More" nav entry). No schema change, no Home changes.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5.9, Vitest + @testing-library/react (jsdom), SQLocal+OPFS via Drizzle, localStorage for device-local flags.

## Global Constraints

- **TypeScript house bans:** no `any`, no `as` casts (`as const` / `satisfies` are fine), no `!` non-null, no `// @ts-*`. `type` over `interface`. Prefer `for..of`.
- **`backup.ts` stays pure and node-safe** — no DOM, no DB, no async — so its round-trip stays unit-testable. `backupStatus` takes primitives only.
- **`db.ts` owns every localStorage key.** New key: `coffee-last-backup-at`. Existing pattern to mirror: `SEED_FLAG = 'coffee-seeded'`.
- **Number/day formatting via `Intl`** — reuse the `number` (`Intl.NumberFormat('en-US')`) formatter already declared in `SettingsView`. No manual string maths.
- **Voice is calm and factual, never nags.** Nudge uses `--color-muted`, not `--color-danger`.
- **Status is never colour-alone** (WCAG 2.2 AA): the "More" dot is paired with an accessible-name change; the nudge changes wording.
- **`OVERDUE_DAYS = 14`** (approved).
- **`navigator.share()` timing is untouched** — `SettingsView` still serializes on render and awaits nothing before `saveFile`; `noteBackup()` is called only _after_ `saveFile` resolves.
- **Quality gates (all must pass):** `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`.

---

### Task 1: Pure `backupStatus` decision function

**Files:**

- Modify: `src/features/coffee/backup.ts` (append after `parseBackup`)
- Test: `src/features/coffee/backup.test.ts` (new)

**Interfaces:**

- Produces:
  - `export const OVERDUE_DAYS = 14`
  - `export type BackupStatus = { overdue: boolean; daysSince: number | null }`
  - `export function backupStatus(lastBackupAt: number | null, now: number, movementCount: number): BackupStatus`

- [ ] **Step 1: Write the failing tests**

Create `src/features/coffee/backup.test.ts`:

```ts
import { expect, test } from 'vitest';
import { OVERDUE_DAYS, backupStatus } from './backup';

const MS_PER_DAY = 86_400_000;
const NOW = 1_700_000_000_000;

test('never backed up is overdue only when there is data to lose', () => {
  expect(backupStatus(null, NOW, 0)).toEqual({ overdue: false, daysSince: null });
  expect(backupStatus(null, NOW, 5)).toEqual({ overdue: true, daysSince: null });
});

test('a fresh backup is not overdue', () => {
  expect(backupStatus(NOW, NOW, 5)).toEqual({ overdue: false, daysSince: 0 });
});

test('overdue only strictly past OVERDUE_DAYS, not at the boundary', () => {
  const atBoundary = NOW - OVERDUE_DAYS * MS_PER_DAY;
  expect(backupStatus(atBoundary, NOW, 5)).toEqual({ overdue: false, daysSince: OVERDUE_DAYS });

  const pastBoundary = NOW - (OVERDUE_DAYS + 1) * MS_PER_DAY;
  expect(backupStatus(pastBoundary, NOW, 5)).toEqual({
    overdue: true,
    daysSince: OVERDUE_DAYS + 1,
  });
});

test('a backwards clock floors daysSince at zero and is not overdue', () => {
  expect(backupStatus(NOW + MS_PER_DAY, NOW, 5)).toEqual({ overdue: false, daysSince: 0 });
});

test('no data is never overdue even with an ancient backup', () => {
  const ancient = NOW - 365 * MS_PER_DAY;
  expect(backupStatus(ancient, NOW, 0)).toEqual({ overdue: false, daysSince: 365 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/coffee/backup.test.ts`
Expected: FAIL — `backupStatus`/`OVERDUE_DAYS` are not exported from `./backup`.

- [ ] **Step 3: Implement `backupStatus`**

Append to `src/features/coffee/backup.ts`:

```ts
// How stale a backup gets before the app quietly says so. Days, not entries: one timestamp to
// store, and the app already speaks in days (the runway). Retune here alone.
export const OVERDUE_DAYS = 14;

export type BackupStatus = {
  // True only when there is data to lose AND the last backup is missing or strictly older than
  // OVERDUE_DAYS. A fresh install (no movements) is never overdue — nothing to protect yet.
  overdue: boolean;
  // Whole local days since the last backup; null when never backed up. Floored at 0 so a backwards
  // clock never reads as a future backup.
  daysSince: number | null;
};

const MS_PER_DAY = 86_400_000;

// Pure: the stored timestamp (null when never backed up), the current time, and how many movements
// exist decide whether to nudge. No DOM, no DB — testable with literals.
export function backupStatus(
  lastBackupAt: number | null,
  now: number,
  movementCount: number,
): BackupStatus {
  if (lastBackupAt === null) {
    return { overdue: movementCount > 0, daysSince: null };
  }
  const daysSince = Math.max(0, Math.floor((now - lastBackupAt) / MS_PER_DAY));
  return { overdue: movementCount > 0 && daysSince > OVERDUE_DAYS, daysSince };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/coffee/backup.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/coffee/backup.ts src/features/coffee/backup.test.ts
git commit -m "feat(backup): pure backupStatus decision function" -m "Days-since-last-backup logic: overdue only when there is data to lose and the last backup is missing or strictly older than OVERDUE_DAYS (14). Floors a backwards clock at zero. Pure and literal-tested, matching the stats.ts reducer style."
```

---

### Task 2: Storage-persistence + last-backup timestamp helpers

**Files:**

- Modify: `src/features/coffee/db.ts` (append a new section after `seedIfEmpty`)

**Interfaces:**

- Produces (all in `db.ts`):
  - `export async function requestPersistence(): Promise<void>`
  - `export async function isStoragePersisted(): Promise<boolean>`
  - `export function readLastBackupAt(): number | null`
  - `export function writeLastBackupAt(now: number): void`

These are browser/localStorage glue with no meaningful unit target beyond their feature-detect guards; verification is the type/lint/build gates plus the consumers' tests in Tasks 4–5. No dedicated test file.

- [ ] **Step 1: Implement the helpers**

Append to `src/features/coffee/db.ts`:

```ts
// ── Device-local storage safety (OPFS eviction + backup freshness) ──────────────────────────────

// Ask the browser to keep OPFS from being evicted under storage pressure. On the installed Chrome
// PWA this is granted silently by engagement heuristics — no prompt. Idempotent and fire-and-forget:
// a denied request is a weaker guarantee, not an error, so failure is swallowed. Guarded because
// navigator.storage is absent on older/embedded webviews.
export async function requestPersistence(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch {
    // No persistence guarantee available — carry on unprotected.
  }
}

// Whether OPFS is currently in a non-evictable bucket, for the Settings transparency line. False
// when unsupported.
export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

const LAST_BACKUP_KEY = 'coffee-last-backup-at';

// Epoch-ms of the last successful export, or null when never backed up or the stored value is
// unusable. Mirrors the SEED_FLAG localStorage pattern above.
export function readLastBackupAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(LAST_BACKUP_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Record a successful export. Lives here because this module owns every localStorage key, though it
// is called from the export handler rather than the DB layer.
export function writeLastBackupAt(now: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_BACKUP_KEY, String(now));
}
```

- [ ] **Step 2: Verify types and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS (no errors). `navigator.storage?.persist` / `?.persisted` are the guarded feature-detects; no `any`/`as`/`!` used.

- [ ] **Step 3: Commit**

```bash
git add src/features/coffee/db.ts
git commit -m "feat(backup): storage-persistence and last-backup timestamp helpers" -m "requestPersistence()/isStoragePersisted() wrap navigator.storage behind feature-detect guards; readLastBackupAt()/writeLastBackupAt() own the new coffee-last-backup-at localStorage key, mirroring the seed-flag pattern."
```

---

### Task 3: Wire persistence + overdue flag into `useCoffee` (and the test fixture)

**Files:**

- Modify: `src/features/coffee/use-coffee.ts`
- Modify: `test/coffee-fixture.ts`

**Interfaces:**

- Consumes: `backupStatus`, `type BackupStatus` (Task 1); `requestPersistence`, `readLastBackupAt`, `writeLastBackupAt` (Task 2).
- Produces (added to the `useCoffee` return object, so `UseCoffee` gains):
  - `backup: BackupStatus`
  - `noteBackup: () => Promise<void>`

- [ ] **Step 1: Add imports**

In `src/features/coffee/use-coffee.ts`, add to the existing `./db` import list: `readLastBackupAt`, `requestPersistence`, `writeLastBackupAt`. Add a new import below it:

```ts
import { backupStatus, type BackupStatus } from './backup';
```

- [ ] **Step 2: Add the `backup` state**

After the `spentMonth` state line, add:

```ts
const [backup, setBackup] = useState<BackupStatus>({ overdue: false, daysSince: null });
```

- [ ] **Step 3: Recompute `backup` inside `refresh`**

At the end of the `refresh` callback body (after `setSpentMonth(...)`), add:

```ts
setBackup(backupStatus(readLastBackupAt(), Date.now(), rows.length));
```

- [ ] **Step 4: Request persistence on mount**

In the mount effect, as the first line inside the async IIFE (before `await seedIfEmpty()`), add:

```ts
// Fire-and-forget: make OPFS non-evictable, don't block the first load on it.
void requestPersistence();
```

- [ ] **Step 5: Add the `noteBackup` callback**

After the `restore` callback (before the `return`), add:

```ts
// Called by Settings after a successful export: stamp the time, then refresh so the overdue flag
// and daysSince re-derive from the new timestamp (overdue → false, daysSince → 0).
const noteBackup = useCallback(async () => {
  writeLastBackupAt(Date.now());
  await refresh();
}, [refresh]);
```

- [ ] **Step 6: Expose the new fields**

In the returned object, add `backup,` and `noteBackup,` (alongside `restore,`).

- [ ] **Step 7: Update the test fixture to satisfy the widened type**

In `test/coffee-fixture.ts`, add an import and two default fields so the stub still `satisfies UseCoffee`:

```ts
import { vi } from 'vitest';
import type { UseCoffee } from '@features/coffee/use-coffee';

export function coffeeWith(overrides: Partial<UseCoffee>): UseCoffee {
  return {
    ready: true,
    movements: [],
    stock: 0,
    blend: null,
    consumedToday: 0,
    consumedWeek: 0,
    consumedMonth: 0,
    spentMonth: 0,
    backup: { overdue: false, daysSince: null },
    drink: vi.fn(async () => {}),
    addOrder: vi.fn(async () => {}),
    removeMovement: vi.fn(async () => {}),
    editMovementTime: vi.fn(async () => {}),
    editOrder: vi.fn(async () => {}),
    restore: vi.fn(async () => 0),
    noteBackup: vi.fn(async () => {}),
    ...overrides,
  } satisfies UseCoffee;
}
```

- [ ] **Step 8: Verify types, lint, and the full suite pass**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: PASS — the widened `UseCoffee` is satisfied by the fixture, and every existing view test still compiles and passes.

- [ ] **Step 9: Commit**

```bash
git add src/features/coffee/use-coffee.ts test/coffee-fixture.ts
git commit -m "feat(backup): surface overdue flag and request persistence from useCoffee" -m "requestPersistence() fires once on mount; refresh() recomputes a BackupStatus from the stored timestamp; noteBackup() stamps a successful export and refreshes so the flag resets. Test fixture gains backup/noteBackup defaults to satisfy the widened type."
```

---

### Task 4: Settings nudge line, storage line, and stamp-on-export

**Files:**

- Modify: `src/features/coffee/components/SettingsView.tsx`
- Test: `src/features/coffee/settings-view.test.tsx` (new)

**Interfaces:**

- Consumes: `coffee.backup` (`BackupStatus`), `coffee.noteBackup` (Task 3); `isStoragePersisted` (Task 2); `coffeeWith` fixture (Task 3).

- [ ] **Step 1: Write the failing test**

Create `src/features/coffee/settings-view.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SettingsView } from './components/SettingsView';
import { coffeeWith } from '../../../test/coffee-fixture';

// The nudge is the whole point of the feature: it must appear, with the right wording, exactly when
// a backup is overdue — and stay silent otherwise. Colour is not asserted (it carries no info the
// wording doesn't); the wording is.

test('an overdue backup shows how long it has been', async () => {
  render(<SettingsView coffee={coffeeWith({ backup: { overdue: true, daysSince: 20 } })} />);
  expect(await screen.findByText(/Last backed up 20 days ago/)).toBeInTheDocument();
});

test('never having backed up says so', async () => {
  render(<SettingsView coffee={coffeeWith({ backup: { overdue: true, daysSince: null } })} />);
  expect(await screen.findByText(/haven’t backed up yet/)).toBeInTheDocument();
});

test('a current backup shows no nudge', () => {
  render(<SettingsView coffee={coffeeWith({ backup: { overdue: false, daysSince: 3 } })} />);
  expect(screen.queryByText(/backed up/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/coffee/settings-view.test.tsx`
Expected: FAIL — no nudge text is rendered yet.

- [ ] **Step 3: Add imports and the storage-persisted effect**

In `SettingsView.tsx`, change the React import to include `useEffect`:

```ts
import { useEffect, useRef, useState } from 'react';
```

Add `isStoragePersisted` to the `../db` import (create the import if none exists yet):

```ts
import { isStoragePersisted } from '../db';
```

Destructure the new coffee fields — change the destructure line to:

```ts
const { movements, restore, backup, noteBackup } = coffee;
```

Add persisted state next to the other `useState` calls:

```ts
const [persisted, setPersisted] = useState<boolean | null>(null);
```

Add the query effect after the existing `file` const:

```ts
useEffect(() => {
  let active = true;
  void isStoragePersisted().then((p) => {
    if (active) setPersisted(p);
  });
  return () => {
    active = false;
  };
}, []);
```

- [ ] **Step 4: Stamp the export on success**

In `exportBackup`, insert the stamp between the successful `saveFile` await and the status line:

```ts
    try {
      await saveFile(file.name, file.type, file.text);
      await noteBackup();
      setStatus({ tone: 'ok', text: `Exported ${number.format(movements.length)} entries.` });
    } catch {
```

- [ ] **Step 5: Render the storage line and the nudge**

Directly after the description `<p>` (the one ending "nothing you have logged is ever lost."), add the storage transparency line:

```tsx
{
  persisted !== null ? (
    <p className="mt-2 text-xs text-[var(--color-faint)]">
      {persisted
        ? 'Storage: protected — your log won’t be cleared to free space.'
        : 'Storage: not protected — export regularly to be safe.'}
    </p>
  ) : null;
}
```

Then, immediately before the `<div className="mt-4 flex flex-col gap-2">` buttons block, add the nudge (muted, factual — never an alarm):

```tsx
{
  backup.overdue ? (
    <p className="mt-3 text-sm text-[var(--color-muted)]">
      {backup.daysSince === null
        ? 'You haven’t backed up yet.'
        : `Last backed up ${number.format(backup.daysSince)} ${
            backup.daysSince === 1 ? 'day' : 'days'
          } ago.`}
    </p>
  ) : null;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/features/coffee/settings-view.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/features/coffee/components/SettingsView.tsx src/features/coffee/settings-view.test.tsx
git commit -m "feat(backup): Settings backup-age nudge and storage-status line" -m "A muted, factual nudge appears above Export when the backup is overdue (or never taken); a transparency line reports whether OPFS is persisted. Export now stamps the last-backup time via noteBackup() after a successful save."
```

---

### Task 5: "More" nav dot + Coffee wiring

**Files:**

- Modify: `src/features/coffee/components/BottomNav.tsx`
- Modify: `src/features/coffee/components/Coffee.tsx`
- Test: `src/features/coffee/bottom-nav.test.tsx` (new)

**Interfaces:**

- Consumes: `coffee.backup.overdue` (Task 3).
- Produces: `BottomNav` gains a required `moreAlert: boolean` prop; the "More" `TabButton` gains an optional `alert?: boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/features/coffee/bottom-nav.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { BottomNav } from './components/BottomNav';

// The dot is colour, so it can't be the only signal (WCAG 2.2 AA). What actually gets asserted is
// the accessible-name change it travels with: "More" becomes "More — backup overdue".
const noop = () => {};

test('an overdue backup relabels the More control', () => {
  render(
    <BottomNav tab="home" onTab={noop} onAdd={noop} onMore={noop} moreOpen={false} moreAlert />,
  );
  expect(screen.getByRole('button', { name: 'More — backup overdue' })).toBeInTheDocument();
});

test('a current backup leaves More unadorned', () => {
  render(
    <BottomNav
      tab="home"
      onTab={noop}
      onAdd={noop}
      onMore={noop}
      moreOpen={false}
      moreAlert={false}
    />,
  );
  expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'More — backup overdue' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/coffee/bottom-nav.test.tsx`
Expected: FAIL — `moreAlert` is not a prop and the relabel doesn't exist (TS error / assertion failure).

- [ ] **Step 3: Add `moreAlert` to `BottomNav` and pass it to the More tab**

In `BottomNav.tsx`, add `moreAlert` to the props type and destructure:

```ts
export function BottomNav({
  tab,
  onTab,
  onAdd,
  onMore,
  moreOpen,
  moreAlert,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  onAdd: () => void;
  onMore: () => void;
  moreOpen: boolean;
  moreAlert: boolean;
}) {
```

Change the "More" `TabButton` to pass `alert`:

```tsx
<TabButton
  label="More"
  active={tab === 'settings'}
  expanded={moreOpen}
  alert={moreAlert}
  onClick={onMore}
>
  <GridIcon className="size-6" />
</TabButton>
```

- [ ] **Step 4: Teach `TabButton` to render the dot and relabel**

Add `alert` to `TabButton`'s props and render the dot + accessible-name change. Replace the `TabButton` signature and body opening with:

```tsx
function TabButton({
  label,
  active,
  onClick,
  children,
  expanded,
  alert,
}: {
  label: string;
  active: boolean;
  onClick?: () => void;
  children: ReactNode;
  expanded?: boolean;
  // Only the "More" tab passes this. When set, an accent dot rides the icon and the accessible name
  // gains a reason — so the signal is never colour-alone (Accessibility). Accent is a budget spent
  // on real signals (Principle 4); an overdue backup is one.
  alert?: boolean;
}) {
  const popup = expanded !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={!popup && active ? 'page' : undefined}
      aria-haspopup={popup ? 'dialog' : undefined}
      aria-expanded={expanded}
      aria-label={alert ? `${label} — backup overdue` : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
        active ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'
      }`}
    >
      <span className="relative">
        {children}
        {alert ? (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-0.5 size-2 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-surface)]"
          />
        ) : null}
      </span>
      {label}
    </button>
  );
}
```

- [ ] **Step 5: Pass the flag from `Coffee`**

In `Coffee.tsx`, add `moreAlert` to the `<BottomNav ... />` element:

```tsx
<BottomNav
  tab={tab}
  onTab={setTab}
  onAdd={() => setAddOpen(true)}
  onMore={() => setMoreOpen(true)}
  moreOpen={moreOpen}
  moreAlert={coffee.backup.overdue}
/>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/features/coffee/bottom-nav.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Run the full quality gates**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`
Expected: PASS (all gates green).

- [ ] **Step 8: Commit**

```bash
git add src/features/coffee/components/BottomNav.tsx src/features/coffee/components/Coffee.tsx src/features/coffee/bottom-nav.test.tsx
git commit -m "feat(backup): accent dot on the More nav entry when a backup is overdue" -m "BottomNav takes moreAlert (coffee.backup.overdue); the More tab shows a small accent dot paired with a 'More — backup overdue' accessible name so the signal is never colour-alone. Coffee wires the flag through."
```

---

## Self-Review

**Spec coverage:**

- Part 1 persist call → Task 3 Step 4 (`requestPersistence` in `db.ts`, Task 2; called on mount, Task 3). ✓
- Part 1 Settings "Storage: protected/not protected" line → Task 4 Steps 3 & 5 (`isStoragePersisted` + render). ✓
- Part 2 `lastBackupAt` write on export → Task 2 (`writeLastBackupAt`) + Task 3 (`noteBackup`) + Task 4 Step 4 (called after `saveFile`). ✓
- Part 2 pure `backupStatus` helper → Task 1. ✓
- Part 2 nudge in Settings, muted/factual, never/overdue wording → Task 4 Step 5. ✓
- Part 2 dot on "More" + accessible-name change (colour-not-alone) → Task 5. ✓
- Home untouched → no task modifies `HomeView`/`Coffee`'s main view. ✓
- No schema change → no `schema.ts` edit; localStorage key only. ✓
- Edge cases (absent `navigator.storage`, corrupt timestamp, fresh install, backwards clock) → Task 1 tests + Task 2 guards. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/vague steps — every code step shows complete code. ✓

**Type consistency:** `BackupStatus = { overdue, daysSince }` defined in Task 1 and used verbatim in the fixture (Task 3), `SettingsView` (Task 4), and via `backup.overdue` (Task 5). `noteBackup: () => Promise<void>` consistent between Task 3 (produce) and Task 4 (consume). `moreAlert: boolean` consistent between Task 5 `BottomNav` and `Coffee`. ✓
