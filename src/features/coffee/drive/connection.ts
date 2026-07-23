'use client';

// PORTABLE — copy verbatim, then edit KEY. Per-device Drive connection state. localStorage (NOT the
// SQLite/OPFS log): it must not be serialized into the backup blob or clobbered on restore.
// needsReconnect is stored (not in-memory) so the sync hook that sets it and the status hook that
// reads it — separate instances — see the same flag.

export type DriveConnection = {
  connected: boolean;
  folderId: string | null;
  lastSyncedAt: number | null;
  needsReconnect: boolean;
};

const KEY = 'kapsoon-drive-connection';
const DEFAULT: DriveConnection = {
  connected: false,
  folderId: null,
  lastSyncedAt: null,
  needsReconnect: false,
};

function isConnection(v: unknown): v is DriveConnection {
  if (typeof v !== 'object' || v === null) return false;
  const connected = 'connected' in v ? v.connected : undefined;
  const folderId = 'folderId' in v ? v.folderId : undefined;
  const lastSyncedAt = 'lastSyncedAt' in v ? v.lastSyncedAt : undefined;
  const needsReconnect = 'needsReconnect' in v ? v.needsReconnect : undefined;
  return (
    typeof connected === 'boolean' &&
    (folderId === null || typeof folderId === 'string') &&
    (lastSyncedAt === null || typeof lastSyncedAt === 'number') &&
    typeof needsReconnect === 'boolean'
  );
}

export function readConnection(): DriveConnection {
  if (typeof window === 'undefined') return DEFAULT;
  const raw = localStorage.getItem(KEY);
  if (raw === null) return DEFAULT;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isConnection(parsed) ? parsed : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function writeConnection(c: DriveConnection): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(c));
}

export function clearConnection(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}
