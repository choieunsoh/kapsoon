'use client';

// APP GLUE — the Google Drive card in Settings. Renders nothing until Drive is configured (empty
// client id → the whole feature is invisible). Styled with kapsoon tokens; status is the same inline
// role="status" line SettingsView uses (no window.alert). Restore merges, so there's no destructive
// confirm.

import { useState } from 'react';
import { useDriveStatus } from './use-drive-status';
import {
  connectDrive,
  disconnectDrive,
  backupNow,
  listDriveBackups,
  restoreFromDrive,
} from './actions';
import type { DriveFile } from './sync-decision';

const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function agoLabel(at: number): string {
  const mins = Math.round((at - Date.now()) / 60_000);
  if (Math.abs(mins) < 60) return rel.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rel.format(hours, 'hour');
  return rel.format(Math.round(hours / 24), 'day');
}

type Status = { tone: 'ok' | 'error'; text: string } | null;

const accentBtn =
  'flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-3 font-semibold text-[var(--color-on-accent)] transition-colors enabled:hover:bg-[var(--color-accent-hover)] disabled:opacity-45';
const subtleBtn =
  'flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-4 py-3 font-medium text-[var(--color-text)] transition-colors enabled:hover:bg-[var(--color-border)] disabled:opacity-45';

export function DriveBackup() {
  const status = useDriveStatus();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<DriveFile[] | null>(null);
  const [msg, setMsg] = useState<Status>(null);

  if (!status.configured) return null; // feature hidden without a client id

  async function guard(fn: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await fn();
    } catch {
      setMsg({ tone: 'error', text: 'Drive request failed — reconnect and try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function backup(): Promise<void> {
    await guard(async () => {
      const uploaded = await backupNow({ interactive: true });
      setMsg({
        tone: 'ok',
        text: uploaded ? 'Backed up to Google Drive.' : 'Nothing to back up yet.',
      });
    });
  }

  async function doRestore(file: DriveFile): Promise<void> {
    setPicking(null);
    await guard(async () => {
      const summary = await restoreFromDrive(file.id);
      setMsg({ tone: 'ok', text: typeof summary === 'string' ? summary : 'Restored from Drive.' });
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold">Google Drive</h2>

      {!status.connected ? (
        <>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-faint)]">
            Connect Google Drive to back up your coffee log to your own Drive — automatically when
            you open the app, and any time with a tap. Nothing leaves your device except the backup
            file.
          </p>
          <div className="mt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void guard(connectDrive)}
              className={accentBtn}
            >
              {busy ? 'Connecting…' : 'Connect Google Drive'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-faint)]">
            {status.needsReconnect
              ? 'Reconnect Drive — the connection lapsed and auto-backup is paused.'
              : status.lastSyncedAt === null
                ? 'Connected. No backup in Drive yet — tap “Back up now”.'
                : `Backed up to Drive ${agoLabel(status.lastSyncedAt)}.`}
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void backup()}
              className={accentBtn}
            >
              {busy ? 'Working…' : 'Back up now'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void guard(async () => setPicking(await listDriveBackups()))}
              className={subtleBtn}
            >
              Restore from Drive
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void guard(async () => {
                  await disconnectDrive(); // async: revokes the Google grant before clearing
                  setPicking(null);
                  setMsg({ tone: 'ok', text: 'Disconnected from Drive.' });
                })
              }
              className="px-4 py-2 text-xs text-[var(--color-faint)] transition-colors enabled:hover:text-[var(--color-muted)]"
            >
              Disconnect
            </button>
          </div>

          {picking !== null ? (
            <ul className="mt-3 flex flex-col gap-1">
              {picking.length === 0 ? (
                <li className="text-xs text-[var(--color-faint)]">No backups in Drive yet.</li>
              ) : (
                picking.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => void doRestore(f)}
                      className="w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-left text-sm tabular-nums transition-colors hover:bg-[var(--color-border)]"
                    >
                      {f.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </>
      )}

      {msg ? (
        <p
          role="status"
          className={`mt-3 text-sm ${
            msg.tone === 'ok' ? 'text-[var(--color-accent)]' : 'text-[var(--color-danger)]'
          }`}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
