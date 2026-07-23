'use client';

import { useEffect, useRef, useState } from 'react';
import type { UseCoffee } from '../use-coffee';
import { parseBackup, serializeBackup } from '../backup';
import { isStoragePersisted } from '../db';
import { DriveBackup } from '../drive/DriveBackup';
import { saveFile } from '@shared/save-file';
import { ImportIcon, ShareIcon } from './icons';

const number = new Intl.NumberFormat('en-US');

type Status = { tone: 'ok' | 'error'; text: string } | null;

// Settings: back up the log to a file and restore one. There is no server and no account — the
// backup file IS the sync mechanism, and the OS share sheet is what carries it to Drive.
export function SettingsView({ coffee }: { coffee: UseCoffee }) {
  const { movements, restore, backup, noteBackup } = coffee;
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  // Serialized on render, not in the tap handler. navigator.share() must be reached while the tap's
  // transient user activation is still live, and Android Chrome rejects it if anything is awaited
  // first — moniflow lost the share sheet to exactly that. Every movement is already in memory here
  // (useCoffee holds the full list), so this is a cheap sync JSON.stringify and the handler below
  // reaches saveFile with nothing awaited in front of it.
  const file = serializeBackup(movements, Date.now());

  useEffect(() => {
    let active = true;
    void isStoragePersisted().then((p) => {
      if (active) setPersisted(p);
    });
    return () => {
      active = false;
    };
  }, []);

  async function exportBackup() {
    try {
      await saveFile(file.name, file.type, file.text);
      await noteBackup();
      // A silent success is indistinguishable from a swallowed failure, and the count is what tells
      // you the file is the whole log rather than an empty header.
      setStatus({ tone: 'ok', text: `Exported ${number.format(movements.length)} entries.` });
    } catch {
      setStatus({ tone: 'error', text: 'Could not export — try again.' });
    }
  }

  async function importBackup(input: HTMLInputElement) {
    const picked = input.files?.[0];
    input.value = ''; // let the same file be picked twice in a row
    if (!picked) return;

    setBusy(true);
    try {
      const rows = parseBackup(await picked.text());
      if (rows === null) {
        setStatus({ tone: 'error', text: "That file isn't a coffee backup." });
        return;
      }
      const added = await restore(rows);
      setStatus({
        tone: 'ok',
        text:
          added === 0
            ? 'Already up to date — nothing new in that file.'
            : `Restored ${number.format(added)} new ${added === 1 ? 'entry' : 'entries'}.`,
      });
    } catch {
      setStatus({ tone: 'error', text: 'Could not read that file.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold">Backup</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-faint)]">
          Your coffee log lives only on this device. Export it to a file to keep it safe or move it
          to another phone — on a phone this opens the share sheet, so a backup can go straight to
          Google Drive; on a desktop it downloads. Restoring <strong>merges</strong>: entries
          already here are kept, so nothing you have logged is ever lost.
        </p>

        {persisted !== null ? (
          <p className="mt-2 text-xs text-[var(--color-faint)]">
            {persisted
              ? 'Storage: protected — your log won’t be cleared to free space.'
              : 'Storage: not protected — export regularly to be safe.'}
          </p>
        ) : null}

        {backup.overdue ? (
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            {backup.daysSince === null
              ? 'You haven’t backed up yet.'
              : `Last backed up ${number.format(backup.daysSince)} ${
                  backup.daysSince === 1 ? 'day' : 'days'
                } ago.`}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={exportBackup}
            disabled={movements.length === 0}
            className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-3 font-semibold text-[var(--color-on-accent)] transition-colors enabled:hover:bg-[var(--color-accent-hover)] disabled:opacity-45"
          >
            <ShareIcon className="size-[18px]" />
            Export {number.format(movements.length)} entries
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-4 py-3 font-medium text-[var(--color-text)] transition-colors enabled:hover:bg-[var(--color-border)] disabled:opacity-45"
          >
            <ImportIcon className="size-[18px]" />
            {busy ? 'Restoring…' : 'Restore from a file'}
          </button>

          <input
            ref={fileRef}
            type="file"
            // Backups are .txt (see BACKUP_MIME); .json covers the legacy seed export.
            accept=".txt,.json,text/plain,application/json"
            onChange={(e) => void importBackup(e.currentTarget)}
            className="hidden"
          />
        </div>

        {status ? (
          <p
            role="status"
            className={`mt-3 text-sm ${
              status.tone === 'ok' ? 'text-[var(--color-accent)]' : 'text-[var(--color-danger)]'
            }`}
          >
            {status.text}
          </p>
        ) : null}
      </div>

      <DriveBackup />

      <p className="px-1 text-xs leading-relaxed text-[var(--color-faint)]">
        Kapsoon · every capsule accounted for. Your data stays on your device.
      </p>
    </section>
  );
}
