'use client';

import { useCallback, useEffect, useState } from 'react';
import { startOfMonth, startOfToday, startOfWeekSunday } from './core/datetime';
import {
  addOrder as dbAddOrder,
  consumeOne as dbConsumeOne,
  deleteMovement as dbDeleteMovement,
  updateMovementTime as dbUpdateMovementTime,
  updateOrder as dbUpdateOrder,
  importMovements,
  listMovements,
  readLastBackupAt,
  requestPersistence,
  seedIfEmpty,
  setStockBadge,
  writeLastBackupAt,
} from './db';
import { countConsumed, latestBlend, stockLevel, totalSpent, type Movement } from './core/movement';
import { backupStatus, type BackupStatus } from './core/backup';

export type UseCoffee = ReturnType<typeof useCoffee>;

export function useCoffee() {
  // SQLite/OPFS is the source of truth; this state is a read-cache refreshed after every write.
  // Load in a mount effect (not the useState initializer) so server HTML ([]) matches the client's
  // first render — OPFS is async and unavailable during SSR anyway.
  const [movements, setMovements] = useState<Movement[]>([]);
  // False until OPFS has answered once. Every figure below is 0/empty before that, which reads as
  // "you are out of coffee" — the exact state the product exists to prevent — so views must render
  // a placeholder rather than those zeros. Distinguishing "not loaded" from "genuinely zero" is
  // impossible from the figures alone; it needs its own flag.
  const [ready, setReady] = useState(false);
  const [stock, setStock] = useState(0);
  const [blend, setBlend] = useState<{ brand: string; beanName: string } | null>(null);
  const [consumedToday, setConsumedToday] = useState(0);
  const [consumedWeek, setConsumedWeek] = useState(0);
  const [consumedMonth, setConsumedMonth] = useState(0);
  const [spentMonth, setSpentMonth] = useState(0);
  const [backup, setBackup] = useState<BackupStatus>({ overdue: false, daysSince: null });

  const refresh = useCallback(async () => {
    const rows = await listMovements();
    setMovements(rows);
    const stock = stockLevel(rows);
    setStock(stock);
    setBlend(latestBlend(rows));
    setConsumedToday(countConsumed(rows, startOfToday()));
    setConsumedWeek(countConsumed(rows, startOfWeekSunday()));
    setConsumedMonth(countConsumed(rows, startOfMonth()));
    setSpentMonth(totalSpent(rows, startOfMonth()));
    setBackup(backupStatus(readLastBackupAt(), Date.now(), rows.length));
    // Fire-and-forget: keep the icon badge in sync with the stash on every write. Not awaited —
    // the UI must not wait on a home-screen paint, and setStockBadge swallows its own failures.
    void setStockBadge(stock);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      // Fire-and-forget: make OPFS non-evictable, don't block the first load on it.
      void requestPersistence();
      // First mount seeds the legacy snapshot into an empty DB (once per browser), then loads.
      await seedIfEmpty();
      if (active) await refresh();
      // After the first refresh, not before: `ready` promises the figures are real, and flipping it
      // early would just move the false-empty frame rather than remove it.
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  const drink = useCallback(async () => {
    await dbConsumeOne();
    await refresh();
  }, [refresh]);

  const addOrder = useCallback(
    async (shop: string, brand: string, beanName: string, quantity: number, price: number) => {
      if (shop.trim() === '' || !Number.isInteger(quantity) || quantity < 1) return;
      await dbAddOrder(shop.trim(), brand.trim(), beanName.trim(), quantity, price);
      await refresh();
    },
    [refresh],
  );

  const removeMovement = useCallback(
    async (id: string) => {
      await dbDeleteMovement(id);
      await refresh();
    },
    [refresh],
  );

  const editMovementTime = useCallback(
    async (id: string, at: number) => {
      await dbUpdateMovementTime(id, at);
      await refresh();
    },
    [refresh],
  );

  // Same validate-then-write-then-refresh shape as addOrder: bad input is dropped before it can
  // reach SQLite, and the refresh re-derives stock/blend/totals from the corrected row.
  const editOrder = useCallback(
    async (
      id: string,
      shop: string,
      brand: string,
      beanName: string,
      quantity: number,
      price: number,
    ) => {
      if (shop.trim() === '' || !Number.isInteger(quantity) || quantity < 1) return;
      await dbUpdateOrder(id, shop.trim(), brand.trim(), beanName.trim(), quantity, price);
      await refresh();
    },
    [refresh],
  );

  // Restore is a MERGE, not a replace: importMovements skips ids that already exist, so re-importing
  // the same backup is a no-op and restoring onto a live phone can't delete cups logged since.
  // Returns how many rows the file actually contributed, for the confirmation line.
  const restore = useCallback(
    async (rows: Movement[]) => {
      const before = await listMovements();
      await importMovements(rows);
      const after = await listMovements();
      await refresh();
      return after.length - before.length;
    },
    [refresh],
  );

  // Called by Settings after a successful export: stamp the time, then refresh so the overdue flag
  // and daysSince re-derive from the new timestamp (overdue → false, daysSince → 0).
  const noteBackup = useCallback(async () => {
    writeLastBackupAt(Date.now());
    await refresh();
  }, [refresh]);

  return {
    ready,
    movements,
    stock,
    blend,
    consumedToday,
    consumedWeek,
    consumedMonth,
    spentMonth,
    backup,
    drink,
    addOrder,
    removeMovement,
    editMovementTime,
    editOrder,
    restore,
    noteBackup,
  };
}
