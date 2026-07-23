// Backup serialization. Pure and node-safe — no DB, no DOM — so the round-trip is unit-testable.

import { isMovement, type Movement } from './db';
import { dayKey } from './datetime';

// JSON bytes, but shipped as .txt/text/plain — NOT .json — because Chromium's shared-file allowlist
// has no JSON entry (neither '.json' nor 'application/json'), so a .json share is refused outright
// (NotAllowedError) and only ever downloads. '.txt' + 'text/plain' are both permitted, and the bytes
// are identical JSON, so the extension is the only thing that changes. That's what keeps a phone
// export reaching the share sheet (→ Drive) instead of silently falling back to a download. The type
// must stay EXACTLY 'text/plain' with no charset parameter — Chromium string-compares it, and
// canShare() does NOT run that check (it answers true either way), so a charset creeping back in
// breaks sharing silently. Restore reads the content, not the name, so a .json file still imports.
export const BACKUP_MIME = 'text/plain';

export type BackupFile = { name: string; type: string; text: string };

// The whole log in one file. `at` is epoch ms (UTC-absolute), so a backup restored in another
// timezone keeps the same instants — only their local rendering shifts.
export function serializeBackup(movements: Movement[], now: number): BackupFile {
  return {
    name: `kapsoon-backup-${dayKey(now)}.txt`,
    type: BACKUP_MIME,
    text: JSON.stringify({ version: 1, movements }, null, 2),
  };
}

// Parse a backup back into rows. Accepts both the wrapped {version, movements} shape and a bare
// array — the seed file (public/coffee-seed.json) is a bare array, so this doubles as its importer.
// Returns null only when the text isn't usable at all; unknown/corrupt rows are dropped, not fatal,
// so one bad line can't cost you the other 589. Untrusted input — every row clears isMovement.
export function parseBackup(text: string): Movement[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  if (Array.isArray(data)) return data.filter(isMovement);
  if (typeof data === 'object' && data !== null && 'movements' in data) {
    const { movements } = data;
    if (Array.isArray(movements)) return movements.filter(isMovement);
  }
  return null;
}

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
