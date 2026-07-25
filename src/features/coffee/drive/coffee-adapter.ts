'use client';

// THE ONE APP-SPECIFIC FILE. Implements BackupAdapter against the coffee log and registers it on
// import (side effect). Everything else in ./drive reads it through getBackupAdapter().
//
// Restore MERGES (importMovements → onConflictDoNothing), matching the file-restore in SettingsView:
// restoring onto a live phone can never delete cups logged since the backup. So there's no destructive
// "replace everything" — DriveBackup skips the confirm the template used.

import { listMovements, importMovements, writeLastBackupAt } from '../db';
import { serializeBackup, parseBackup } from '../core/backup';
import { setBackupAdapter, type BackupAdapter } from './backup-adapter';

const entries = new Intl.NumberFormat('en-US');

export const coffeeBackupAdapter: BackupAdapter = {
  async hasData() {
    return (await listMovements()).length > 0;
  },

  async serialize() {
    const rows = await listMovements();
    return serializeBackup(rows, Date.now()).text;
  },

  async restore(text) {
    const rows = parseBackup(text);
    if (rows === null) throw new Error('Not a Kapsoon backup');
    const before = (await listMovements()).length;
    await importMovements(rows);
    const added = (await listMovements()).length - before;
    return added === 0
      ? 'Already up to date — nothing new in that backup.'
      : `Restored ${entries.format(added)} new ${added === 1 ? 'entry' : 'entries'}.`;
  },

  // A Drive push counts as a backup for the overdue nudge. The coffee hook re-derives the flag on its
  // next refresh/mount — no cross-feature refetch wiring needed.
  onSynced(at) {
    writeLastBackupAt(at);
  },
};

setBackupAdapter(coffeeBackupAdapter);
