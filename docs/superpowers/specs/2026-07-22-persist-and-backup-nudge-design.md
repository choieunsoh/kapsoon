# Persist storage + backup-age nudge — design

Date: 2026-07-22 · Feature B of the "overall app" roadmap · Register: product

## Problem

The coffee ledger lives only in OPFS on one device. Two ways it can be silently lost:

1. **Browser eviction.** OPFS is best-effort storage. Under storage pressure the browser may clear
   it. The app never requests persistent storage, so the ledger is treated as disposable cache.
2. **A forgotten manual backup.** The only copy off the device is a `.txt` the user exports by hand
   from Settings. Nothing tracks when that last happened or reminds the user, so the safety net is
   only as good as the user's memory — the exact failure mode (a mental note that fails once) the
   product exists to eliminate, applied to its own data.

True silent auto-backup to a user-visible folder is **not possible on the target device** (Samsung
S24 Ultra / Android Chrome): the File System Access API — the only web API that can autonomously
write to a real folder — is desktop-Chromium only. Android has OPFS but no picker/directory-handle
support, and programmatic downloads require a user gesture and dump into Downloads. This design
therefore does the honest maximum: make loss _unlikely_ (persist), and make the manual backup
_actually happen_ (nudge).

## Non-goals

- No auto-download, no scheduled file writes, no File System Access — impossible or clunky on Android.
- No change to the backup file format, MIME (`text/plain`), or the share/restore flow.
- No Home-screen intrusion. Home stays the logging surface (Design Principle 1).
- No new database table or schema change. Device-local flags use localStorage, matching the
  existing `coffee-seeded` pattern.

## Design

Two independent parts. Either can ship alone; neither depends on the other.

### Part 1 — Request persistent storage

A guarded, fire-and-forget call on client startup, added to `useCoffee`'s existing mount effect
alongside `seedIfEmpty()`:

```ts
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  await navigator.storage.persist(); // idempotent; result not surfaced from here
}
```

- **Behaviour:** on the installed Chrome PWA this is granted silently via engagement heuristics — no
  prompt. It flips OPFS from evictable cache into a bucket the browser will not clear under storage
  pressure.
- **Idempotent, every mount:** cheap, and self-heals if a previous attempt was denied and the
  heuristics now qualify. Failure is swallowed — a denied persist is a weaker guarantee, not an error.
- **No UI and no React state** for the core protection.

**Transparency line in Settings (included).** A small factual line in the existing Backup card
reporting `navigator.storage.persisted()`:

- `true` → "Storage: protected — your log won't be cleared to free space"
- `false` / unsupported → "Storage: not protected — export regularly to be safe"

Read once when the Settings view mounts. This directly answers the "is my data safe?" question and
costs a `useEffect` + one state value.

### Part 2 — Backup-age nudge

**Timestamp.** On a successful `exportBackup`, write `lastBackupAt` (epoch ms) to localStorage.
Two tiny device-local accessors mirror the `SEED_FLAG` pattern already in `db.ts`:

```ts
const LAST_BACKUP_KEY = 'coffee-last-backup-at';
function readLastBackupAt(): number | null; // null when never backed up or unparseable
function writeLastBackupAt(now: number): void;
```

**Pure status helper** (new, testable with literals — matches the `stats.ts` pure-reducer style):

```ts
const OVERDUE_DAYS = 14;

export type BackupStatus = { overdue: boolean; daysSince: number | null };

// daysSince is null when never backed up. overdue is true when there is data to lose AND either
// it has never been backed up or the last backup is older than OVERDUE_DAYS.
export function backupStatus(
  lastBackupAt: number | null,
  now: number,
  movementCount: number,
): BackupStatus;
```

- `movementCount === 0` → `overdue: false` (nothing to protect; no nudge on a fresh install).
- `lastBackupAt === null` with data → `overdue: true`, `daysSince: null`.
- Otherwise `overdue` iff whole days since last backup `> OVERDUE_DAYS`.

**Trigger:** days since last backup (not entries-since). Simpler — one timestamp, no extra stored
counter — and the app already speaks in days (runway). `OVERDUE_DAYS = 14` is a single named
constant, trivially retunable.

**Where it surfaces (Settings + a dot on "More"):**

- **In Settings**, above the existing Export button, a quiet factual line when `overdue`:
  - never backed up → "you haven't backed up yet"
  - overdue → "last backed up N days ago"
  - The existing Export button beneath it is the action; no separate CTA.
  - Uses `--color-muted` (not `--color-danger`) — this is a reminder, not an alarm. Voice stays
    calm and factual, never nags (Brand Personality).
- **A small dot on the "More" entry** in `BottomNav` (the nav route to Settings) whenever
  `backupStatus(...).overdue` is true, so the reminder is discoverable without opening Settings and
  silent when backups are current (Design Principle 3: speak only when there's something to say).
  The dot is accompanied by an accessible label change on the More control (e.g. "More — backup
  overdue"), so the signal is never colour-alone (Accessibility).

**Home is untouched.** No backup nudge on the hero. Home remains the logging surface.

## Component / data flow

```
useCoffee (mount effect)
  ├─ requestPersistence()            [Part 1: fire-and-forget]
  ├─ seedIfEmpty(); refresh()        [unchanged]
  └─ exposes: overdue backup flag derived from backupStatus(readLastBackupAt(), Date.now(), movements.length)

SettingsView
  ├─ reads navigator.storage.persisted() on mount → "Storage: protected/not protected" line
  ├─ shows nudge line when overdue
  └─ exportBackup() → writeLastBackupAt(Date.now()) on success  [added]

BottomNav
  └─ renders a dot + label change on the "More" control when the overdue flag is set
```

Where each new symbol lives:

- `requestPersistence()` and the two `lastBackupAt` accessors → `db.ts` (the device-local /
  storage-boundary module that already owns localStorage and OPFS init).
- `backupStatus()` + `BackupStatus` type → `backup.ts` (pure, node-safe, already unit-tested there).
- Overdue flag → surfaced from `useCoffee` so both `SettingsView` and `BottomNav` read one source.

## Error handling / edge cases

- `navigator.storage` absent → both `persist()` and `persisted()` are guarded; the Settings line
  falls to "not protected".
- localStorage unavailable/throwing (private mode edge) → accessors swallow and treat as
  "never backed up"; the nudge simply shows, which is the safe direction.
- Corrupt `lastBackupAt` value → `readLastBackupAt` returns null (treated as never backed up).
- Clock moved backwards (negative elapsed) → `daysSince` floored at 0; not overdue.
- Fresh install (no movements) → never overdue, no dot, no nudge.

## Testing

- **`backupStatus`** — pure unit tests with literals: never-backed-up-with-data (overdue, null days),
  never-backed-up-no-data (not overdue), fresh backup (not overdue), exactly `OVERDUE_DAYS`
  (boundary, not overdue), `OVERDUE_DAYS + 1` (overdue), clock-skew negative (floored, not overdue).
- **`readLastBackupAt`** — parses a stored value, returns null on missing/garbage. (Thin; include if
  it earns its keep, otherwise covered via `backupStatus` inputs.)
- `requestPersistence()` and the `persisted()` line are feature-detected, fire-and-forget browser
  glue — no meaningful unit target beyond the guard.

## Quality gates

`npm run typecheck && npm run lint && npm run format:check && npm test && npm run build` — all pass.
House TypeScript bans apply (no `any`, no `as`, no `!`, no `// @ts-*`).
