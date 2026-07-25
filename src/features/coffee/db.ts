import { desc, eq, sql } from 'drizzle-orm';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { SQLocalDrizzle } from 'sqlocal/drizzle';
import { movements as movementsTable } from './core/schema';
import { assertIntegerMinor, assertPositiveInt, isMovement, type Movement } from './core/movement';

// SQLite-in-the-browser (SQLocal → @sqlite.org/sqlite-wasm + OPFS) queried through Drizzle. The DB
// runs in a Web Worker and touches OPFS, so it CANNOT be constructed during SSR/prerender —
// construction is lazy (first client call).
//
// This module owns PERSISTENCE and browser platform APIs only. The domain — the Movement type, its
// guards, and every pure reducer over rows — lives in ./core and is imported from there, so a
// non-browser client can reuse the logic without dragging SQLocal in behind it.

type CoffeeDb = SqliteRemoteDatabase<Record<string, never>>;

// Lazy singleton: the worker + OPFS handle are created on first use (client-side only). The migration
// (create + idempotent alters) is folded into the same promise so every query awaits a ready schema.
let dbPromise: Promise<CoffeeDb> | undefined;

function getDb(): Promise<CoffeeDb> {
  if (dbPromise === undefined) {
    dbPromise = (async () => {
      const { driver, batchDriver } = new SQLocalDrizzle('database.sqlite3');
      const db = drizzle(driver, batchDriver);
      // Fresh DBs get the full shape here…
      await db.run(
        sql`CREATE TABLE IF NOT EXISTS movements (id text PRIMARY KEY, shop text NOT NULL, brand text NOT NULL DEFAULT '', bean_name text NOT NULL DEFAULT '', delta integer NOT NULL, price integer NOT NULL DEFAULT 0, at integer NOT NULL)`,
      );
      // …existing v1 DBs (id, name, delta, at) are upgraded in place below.
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

// Bring a v1 DB up to the current columns. Each step throws if already applied (e.g. on a fresh DB
// created above) — that's expected and swallowed, so the whole thing is idempotent.
async function migrate(db: CoffeeDb): Promise<void> {
  const steps = [
    sql`ALTER TABLE movements RENAME COLUMN name TO shop`,
    sql`ALTER TABLE movements ADD COLUMN brand text NOT NULL DEFAULT ''`,
    sql`ALTER TABLE movements ADD COLUMN bean_name text NOT NULL DEFAULT ''`,
    sql`ALTER TABLE movements ADD COLUMN price integer NOT NULL DEFAULT 0`,
  ];
  for (const step of steps) {
    try {
      await db.run(step);
    } catch {
      // Already applied on this DB — safe to skip.
    }
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────

// Record an order that fills stock: +quantity cups of brand/bean from a shop for `price` satang.
export async function addOrder(
  shop: string,
  brand: string,
  beanName: string,
  quantity: number,
  price: number,
): Promise<string> {
  assertPositiveInt(quantity);
  assertIntegerMinor(price);
  const id = crypto.randomUUID();
  const db = await getDb();
  await db
    .insert(movementsTable)
    .values({ id, shop, brand, beanName, delta: quantity, price, at: Date.now() });
  return id;
}

// The one-click "Drink": consume exactly one cup.
export async function consumeOne(): Promise<string> {
  const id = crypto.randomUUID();
  const db = await getDb();
  await db
    .insert(movementsTable)
    .values({ id, shop: '', brand: '', beanName: '', delta: -1, price: 0, at: Date.now() });
  return id;
}

// Remove a movement (undo a mis-tapped drink or a wrong order). Stock is a running sum, so deleting
// the row is all it takes — the balance re-derives itself.
export async function deleteMovement(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(movementsTable).where(eq(movementsTable.id, id));
}

// Correct a movement's timestamp (e.g. a cup you forgot to log at the time).
export async function updateMovementTime(id: string, at: number): Promise<void> {
  if (!Number.isFinite(at)) return;
  const db = await getDb();
  await db.update(movementsTable).set({ at }).where(eq(movementsTable.id, id));
}

// Correct a mis-logged order in place. Editing `delta` retroactively fixes stock for free — the
// balance is a running sum, so there is nothing else to recompute. This can push stock negative if
// the capsules were already drunk; for a single-user log that reads as the correction it is.
export async function updateOrder(
  id: string,
  shop: string,
  brand: string,
  beanName: string,
  quantity: number,
  price: number,
): Promise<void> {
  assertPositiveInt(quantity);
  assertIntegerMinor(price);
  const db = await getDb();
  await db
    .update(movementsTable)
    .set({ shop, brand, beanName, delta: quantity, price })
    .where(eq(movementsTable.id, id));
}

// Newest first — drives the activity list and every pure reducer in ./core.
export async function listMovements(): Promise<Movement[]> {
  const db = await getDb();
  return db.select().from(movementsTable).orderBy(desc(movementsTable.at)).all();
}

// Bulk insert movements; duplicate ids are ignored so a re-run is idempotent.
export async function importMovements(rows: Movement[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = await getDb();
  await db.insert(movementsTable).values(rows).onConflictDoNothing();
  return rows.length;
}

const SEED_URL = '/coffee-seed.json';
const SEED_FLAG = 'coffee-seeded';

// One-time migration of the legacy coffee-tracker export. On a browser whose DB has never been
// seeded, load the bundled snapshot into an empty DB — this is how the data reaches each real
// browser / deployment (OPFS is per-origin, per-browser). Runs at most once per browser (a
// localStorage flag), so intentionally clearing your data later never re-imports it.
export async function seedIfEmpty(): Promise<boolean> {
  if (typeof window === 'undefined' || localStorage.getItem(SEED_FLAG) === '1') return false;
  const existing = await listMovements();
  if (existing.length > 0) {
    localStorage.setItem(SEED_FLAG, '1');
    return false;
  }
  try {
    const res = await fetch(SEED_URL);
    if (!res.ok) return false;
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return false;
    await importMovements(data.filter(isMovement));
    localStorage.setItem(SEED_FLAG, '1');
    return true;
  } catch {
    return false;
  }
}

// ── Device-local storage safety (OPFS eviction + backup freshness) ──────────────────────────────

// Ask the browser to keep OPFS from being evicted under storage pressure. On the installed Chrome
// PWA this is granted silently by engagement heuristics — no prompt. Idempotent and fire-and-forget:
// a denied request is a weaker guarantee, not an error, so failure is swallowed. Guarded because
// navigator.storage is absent on older/embedded webviews.
export async function requestPersistence(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch {
    // No persistence guarantee available — carry on unprotected.
  }
}

// Whether OPFS is currently in a non-evictable bucket, for the Settings transparency line. False
// when unsupported.
export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

// Paint the current capsule count on the installed PWA's home-screen icon (Web Badging API). This
// is the only thing that reaches the user while the app is closed, which is the whole point of the
// runway — so a healthy stash shows a number and an empty one clears the badge rather than showing
// 0. Guarded + fire-and-forget like requestPersistence: the API is absent on desktop/older webviews
// and setAppBadge can reject, and a missing badge is a weaker guarantee, not an error. The badge is
// only ever as fresh as the last log, because nothing runs while the app is closed — correct, since
// stock only changes when you log a cup or an order, both of which route through refresh().
export async function setStockBadge(count: number): Promise<void> {
  if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return;
  try {
    if (count > 0) {
      await navigator.setAppBadge(count);
    } else {
      await navigator.clearAppBadge();
    }
  } catch {
    // No badge available (unsupported, or the tab isn't an installed PWA) — carry on.
  }
}

const LAST_BACKUP_KEY = 'coffee-last-backup-at';

// Epoch-ms of the last successful export, or null when never backed up or the stored value is
// unusable. Mirrors the SEED_FLAG localStorage pattern above.
export function readLastBackupAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(LAST_BACKUP_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Record a successful export. Lives here because this module owns every localStorage key, though it
// is called from the export handler rather than the DB layer.
export function writeLastBackupAt(now: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_BACKUP_KEY, String(now));
}
