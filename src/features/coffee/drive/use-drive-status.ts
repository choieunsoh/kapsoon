'use client';

// APP GLUE — the read model for the Settings section. useSyncExternalStore over the localStorage
// connection so connect/disconnect/backup re-render consumers without setState-in-effect. subscribe is
// wired to connection-bump (actions.ts calls bumpConnection() after every connection write).

import { useSyncExternalStore } from 'react';
import { readConnection } from './connection';
import { isDriveConfigured } from './client-id';
import { subscribeConnection } from './connection-bump';

export type DriveStatus = {
  configured: boolean;
  connected: boolean;
  lastSyncedAt: number | null;
  needsReconnect: boolean;
};

const SERVER_SNAPSHOT: DriveStatus = {
  configured: false,
  connected: false,
  lastSyncedAt: null,
  needsReconnect: false,
};

// getSnapshot MUST return a stable reference until values change — a fresh object every call makes
// useSyncExternalStore loop forever. Cache keyed on the serialized value.
let cache: DriveStatus = SERVER_SNAPSHOT;
let cacheKey = '';

function getSnapshot(): DriveStatus {
  const c = readConnection();
  const configured = isDriveConfigured();
  const key = `${configured}|${c.connected}|${c.lastSyncedAt}|${c.needsReconnect}`;
  if (key !== cacheKey) {
    cacheKey = key;
    cache = {
      configured,
      connected: c.connected,
      lastSyncedAt: c.lastSyncedAt,
      needsReconnect: c.needsReconnect,
    };
  }
  return cache;
}

function getServerSnapshot(): DriveStatus {
  return SERVER_SNAPSHOT;
}

export function useDriveStatus(): DriveStatus {
  return useSyncExternalStore(subscribeConnection, getSnapshot, getServerSnapshot);
}
