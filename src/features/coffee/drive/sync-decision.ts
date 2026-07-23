// PORTABLE — copy verbatim, then edit APP_FOLDER_NAME. Pure decision core for Drive auto-backup —
// no DOM, no network, testable with literals.

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_FOLDER_NAME = 'Kapsoon Backups'; // the folder shown in the user's Drive
export const KEEP_BACKUPS = 14; // dated files retained; older ones pruned
export const STALE_HOURS = 20; // min hours since last sync before an app-open auto-push fires

export type DriveFile = { id: string; name: string };

const MS_PER_HOUR = 3_600_000;

// Push only when connected, there's data to lose, and either never synced or the last sync is at least
// staleHours old. A backwards clock (lastSyncedAt in the future) yields a negative age < staleHours → false.
export function shouldAutoSync(p: {
  connected: boolean;
  hasData: boolean;
  lastSyncedAt: number | null;
  now: number;
  staleHours: number;
}): boolean {
  if (!p.connected || !p.hasData) return false;
  if (p.lastSyncedAt === null) return true;
  return (p.now - p.lastSyncedAt) / MS_PER_HOUR >= p.staleHours;
}

// Dated filenames sort lexicographically = chronologically. Keep the newest `keep`, return the ids of
// the rest to delete. Copies before sorting so the caller's array is untouched.
export function prunable(files: DriveFile[], keep: number): string[] {
  const newestFirst = [...files].sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  return newestFirst.slice(keep).map((f) => f.id);
}
