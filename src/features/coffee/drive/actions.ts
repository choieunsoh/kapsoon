'use client';

// APP GLUE — generic push/connect/restore against BackupAdapter, so it has ZERO app-specific imports.
// Every write path ends by updating connection state THEN bumpConnection() so use-drive-status
// re-renders; onSynced() is where the app stamps its local "last backup".

import { getBackupAdapter } from './backup-adapter';
import { requestToken, revokeAccess } from './gis';
import {
  findOrCreateFolder,
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

// Upload the current store with an already-obtained token, prune old backups, stamp lastSyncedAt, and
// notify the app via onSynced.
async function pushWith(token: string): Promise<void> {
  const adapter = getBackupAdapter();
  const conn = readConnection();
  const folderId = conn.folderId ?? (await findOrCreateFolder(token, DRIVE_FOLDER_NAME));
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
  const token = await requestToken({ interactive: true });
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
    token = await requestToken({ interactive: opts.interactive });
  } catch (err) {
    const conn = readConnection();
    writeConnection({ ...conn, needsReconnect: true });
    bumpConnection();
    throw err;
  }
  await pushWith(token);
  return true;
}

export async function listDriveBackups(): Promise<DriveFile[]> {
  const token = await requestToken({ interactive: false });
  const conn = readConnection();
  const folderId = conn.folderId ?? (await findOrCreateFolder(token, DRIVE_FOLDER_NAME));
  return listBackups(token, folderId);
}

export async function restoreFromDrive(fileId: string): Promise<string | void> {
  const token = await requestToken({ interactive: false });
  const text = await downloadFile(token, fileId);
  return getBackupAdapter().restore(text); // throws if it isn't one of our backups
}
