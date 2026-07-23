import { describe, expect, it } from 'vitest';
import { shouldAutoSync, prunable, type DriveFile } from './sync-decision';

const HOUR = 3_600_000;
const base = { connected: true, hasData: true, now: 1_000 * HOUR, staleHours: 20 };

describe('shouldAutoSync', () => {
  it('never syncs when disconnected or empty', () => {
    expect(shouldAutoSync({ ...base, connected: false, lastSyncedAt: null })).toBe(false);
    expect(shouldAutoSync({ ...base, hasData: false, lastSyncedAt: null })).toBe(false);
  });

  it('syncs when never synced before', () => {
    expect(shouldAutoSync({ ...base, lastSyncedAt: null })).toBe(true);
  });

  it('syncs only once the last sync is at least staleHours old', () => {
    expect(shouldAutoSync({ ...base, lastSyncedAt: base.now - 19 * HOUR })).toBe(false);
    expect(shouldAutoSync({ ...base, lastSyncedAt: base.now - 20 * HOUR })).toBe(true);
  });

  it('treats a future lastSyncedAt (backwards clock) as fresh, not stale', () => {
    expect(shouldAutoSync({ ...base, lastSyncedAt: base.now + 5 * HOUR })).toBe(false);
  });
});

describe('prunable', () => {
  const files: DriveFile[] = [
    { id: 'a', name: 'backup-2026-07-20.txt' },
    { id: 'b', name: 'backup-2026-07-23.txt' },
    { id: 'c', name: 'backup-2026-07-21.txt' },
  ];

  it('keeps the newest N by name, returns the rest to delete', () => {
    expect(prunable(files, 2)).toEqual(['a']); // oldest date dropped
    expect(prunable(files, 5)).toEqual([]); // fewer than keep → nothing pruned
  });

  it('does not mutate the input array', () => {
    const snapshot = files.map((f) => f.id);
    prunable(files, 1);
    expect(files.map((f) => f.id)).toEqual(snapshot);
  });
});
