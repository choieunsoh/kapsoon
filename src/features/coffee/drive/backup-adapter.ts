'use client';

// THE SEAM — implemented once in coffee-adapter.ts, wired into actions.ts via getBackupAdapter().
// The whole Drive layer only ever moves a `string`: it uploads whatever `serialize()` returns and
// hands whatever it downloads back to `restore()`. It knows nothing about the DB, schema, or format.
//
// This is why the feature ports: swap the adapter, the OAuth + REST machinery is unchanged.

export type BackupAdapter = {
  // Is there anything worth backing up right now? Guards against uploading an empty store and against
  // the manual "Back up now" claiming success on nothing. Return false when the store is empty.
  hasData(): Promise<boolean>;

  // Produce the exact text to upload. Reuses the existing serialize path so a Drive backup and a
  // manual file export are byte-identical.
  serialize(): Promise<string>;

  // Load a downloaded backup. THROW if `text` isn't one of the app's backups (the UI catches it and
  // shows an error). Return a short human summary for the success message, or void.
  restore(text: string): Promise<string | void>;

  // Optional. Called after every successful push with the sync timestamp. Used to stamp the local
  // "last backed up" marker so the overdue nudge counts a Drive backup too.
  onSynced?(at: number): void;
};

let adapter: BackupAdapter | null = null;

export function setBackupAdapter(a: BackupAdapter): void {
  adapter = a;
}

export function getBackupAdapter(): BackupAdapter {
  if (adapter === null)
    throw new Error('Backup adapter not set — call setBackupAdapter() at startup');
  return adapter;
}
