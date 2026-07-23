'use client';

// APP GLUE — mount ONCE near the app root (Coffee.tsx). "Opening the app is the schedule": a
// fire-and-forget effect that pushes when connected + stale enough. Any failure (auth/network) is
// swallowed — backupNow already recorded needsReconnect where relevant.

import { useEffect } from 'react';
import { getBackupAdapter } from './backup-adapter';
import { readConnection } from './connection';
import { shouldAutoSync, STALE_HOURS } from './sync-decision';
import { backupNow } from './actions';

export function useDriveSync(): void {
  useEffect(() => {
    let alive = true;
    void (async () => {
      const conn = readConnection();
      if (!conn.connected) return;
      const hasData = await getBackupAdapter().hasData();
      if (!alive) return;
      if (
        !shouldAutoSync({
          connected: conn.connected,
          hasData,
          lastSyncedAt: conn.lastSyncedAt,
          now: Date.now(),
          staleHours: STALE_HOURS,
        })
      ) {
        return;
      }
      try {
        await backupNow({ interactive: false });
      } catch {
        // quiet degrade — the connection was flagged needsReconnect where relevant
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
}
