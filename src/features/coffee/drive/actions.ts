'use client';

// APP GLUE — generic push/connect/restore against BackupAdapter, so it has ZERO app-specific imports.
// Every write path ends by updating connection state THEN bumpConnection() so use-drive-status
// re-renders; onSynced() is where the app stamps its local "last backup".

import { getBackupAdapter } from './backup-adapter';
import { consumeAuthRedirect, requestToken, revokeAccess } from './token';
import {
  findOrCreateFolder,
  isOwnedFolder,
  uploadBackup,
  listBackups,
  downloadFile,
  deleteFile,
} from './drive-api';
import { readConnection, writeConnection, clearConnection } from './connection';
import { bumpConnection } from './connection-bump';
import { prunable, DRIVE_FOLDER_NAME, KEEP_BACKUPS, type DriveFile } from './sync-decision';

// YYYY-MM-DD in the user's local zone (plain-zero, no string math). Names sort lexicographically =
// chronologically, which prunable relies on.
function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

// The stored folderId, but only while it is still a live folder the user owns; otherwise re-resolve
// through the owner-bound lookup. Costs one GET per sync.
async function resolveFolder(token: string, stored: string | null): Promise<string> {
  if (stored !== null && (await isOwnedFolder(token, stored))) return stored;
  return findOrCreateFolder(token, DRIVE_FOLDER_NAME);
}

// Upload the current store with an already-obtained token, prune old backups, stamp lastSyncedAt, and
// notify the app via onSynced.
async function pushWith(token: string): Promise<void> {
  const adapter = getBackupAdapter();
  const conn = readConnection();
  const folderId = await resolveFolder(token, conn.folderId);
  const text = await adapter.serialize();
  await uploadBackup(token, folderId, `backup-${todayIso()}.txt`, text);
  const files = await listBackups(token, folderId);
  for (const id of prunable(files, KEEP_BACKUPS)) await deleteFile(token, id);
  const now = Date.now();
  writeConnection({ connected: true, folderId, lastSyncedAt: now, needsReconnect: false });
  bumpConnection();
  adapter.onSynced?.(now);
}

export async function connectDrive(): Promise<void> {
  const token = await requestToken({ interactive: true, resume: 'connect' });
  if (await getBackupAdapter().hasData()) {
    await pushWith(token);
  } else {
    const folderId = await findOrCreateFolder(token, DRIVE_FOLDER_NAME);
    const conn = readConnection();
    writeConnection({ ...conn, connected: true, folderId, needsReconnect: false });
    bumpConnection();
  }
}

export async function disconnectDrive(): Promise<void> {
  await revokeAccess(); // revoke the Google grant (best-effort) AND drop the cached token
  clearConnection();
  bumpConnection();
}

// Returns true when a backup was actually uploaded, false when it no-op'd because the store is empty
// (nothing to lose). The manual "Back up now" tap uses this to avoid claiming success on nothing; the
// auto-sync path ignores it. A token failure still throws (and flags needsReconnect).
export async function backupNow(opts: { interactive: boolean }): Promise<boolean> {
  if (!(await getBackupAdapter().hasData())) return false; // nothing to lose
  let token: string;
  try {
    token = await requestToken({ interactive: opts.interactive, resume: 'backup' });
  } catch (err) {
    const conn = readConnection();
    writeConnection({ ...conn, needsReconnect: true });
    bumpConnection();
    throw err;
  }
  await pushWith(token);
  return true;
}

// User-tapped, so it may redirect for a fresh token; after the round trip the user taps Restore again.
export async function listDriveBackups(): Promise<DriveFile[]> {
  const token = await requestToken({ interactive: true });
  const conn = readConnection();
  const folderId = await resolveFolder(token, conn.folderId);
  if (folderId !== conn.folderId) writeConnection({ ...conn, folderId });
  return listBackups(token, folderId);
}

// Finish whatever sent the user to Google. Returns false on a normal load (nothing was pending) so the
// caller can fall through to its usual work. A failed round trip on a live connection pauses auto-backup.
export async function resumeAfterRedirect(): Promise<boolean> {
  const r = consumeAuthRedirect();
  if (r === null) return false;
  if ('error' in r) {
    const conn = readConnection();
    if (conn.connected) {
      writeConnection({ ...conn, needsReconnect: true });
      bumpConnection();
    }
    return true;
  }
  if (r.resume === 'connect') await connectDrive();
  else if (r.resume === 'backup') await backupNow({ interactive: false });
  return true;
}

export async function restoreFromDrive(fileId: string): Promise<string | void> {
  const token = await requestToken({ interactive: false });
  const text = await downloadFile(token, fileId);
  return getBackupAdapter().restore(text); // throws if it isn't one of our backups
}
