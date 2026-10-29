// The movement — the app's one domain object — and every pure operation over it.
//
// A movement is a signed `delta` of capsules at a point in time: negative for a cup drunk, positive
// for an order. Stock is never stored, only re-derived as the running sum, which is why editing or
// deleting a row fixes the balance for free.
//
// This module is deliberately storage-free: no DB, no DOM, no platform APIs. It used to live in
// `db.ts`, which meant the runway projection — the most valuable logic in the app — could not be
// read without importing SQLocal and, with it, a browser WASM database. Everything here runs
// unchanged under Node, jsdom, or a native runtime.

export type Movement = {
  id: string;
  shop: string;
  brand: string;
  beanName: string;
  delta: number;
  price: number; // order total in integer satang; 0 for a drink
  at: number;
};

// Guard untrusted rows at the trust boundary — the seed JSON and restored backups both arrive as
// parsed `unknown` from outside the app. Holds a restored row to the same invariants the UI write
// path enforces (assertPositiveInt / assertIntegerMinor): whole-capsule delta, non-negative integer
// satang, integer epoch ms, and text columns that are actually text (they're NOT NULL in SQLite, so a
// missing one would fail the whole import batch, not just the row).
export function isMovement(v: unknown): v is Movement {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    typeof v.id === 'string' &&
    'shop' in v &&
    typeof v.shop === 'string' &&
    'brand' in v &&
    typeof v.brand === 'string' &&
    'beanName' in v &&
    typeof v.beanName === 'string' &&
    'delta' in v &&
    Number.isInteger(v.delta) &&
    'price' in v &&
    Number.isInteger(v.price) &&
    typeof v.price === 'number' &&
    v.price >= 0 &&
    'at' in v &&
    Number.isInteger(v.at)
  );
}

// ── Write-boundary guards ───────────────────────────────────────────────────────────────────────

// A cup count is a whole positive number — guard order quantities at the write boundary. Pure, so
// the unit test can assert it without spinning up a worker/OPFS.
export function assertPositiveInt(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`quantity must be a positive integer (cups), got ${quantity}`);
  }
}

// Money is always an integer minor unit (satang) — never a float. A total of 0 is allowed (freebie).
export function assertIntegerMinor(satang: number): void {
  if (!Number.isInteger(satang) || satang < 0) {
    throw new Error(`price must be a non-negative integer (satang), got ${satang}`);
  }
}

// ── Pure reducers over plain rows — the real logic, testable without a DB. ──────────────────────

const MS_PER_DAY = 86_400_000;

// Current stock = running sum of every movement's delta.
export function stockLevel(rows: Pick<Movement, 'delta'>[]): number {
  let total = 0;
  for (const m of rows) total += m.delta;
  return total;
}

// Cups consumed at or after `since` (a ms timestamp). Consumes are negative deltas; return a
// positive count.
export function countConsumed(rows: Pick<Movement, 'delta' | 'at'>[], since: number): number {
  let consumed = 0;
  for (const m of rows) {
    if (m.delta < 0 && m.at >= since) consumed += -m.delta;
  }
  return consumed;
}

// Average cups per day across a trailing window — the basis for Home's "about N days left".
// The divisor is CLAMPED to how much history actually exists rather than to the window length: on a
// log that's two days old, dividing 4 cups by a 14-day window projects a runway about seven times
// too long, which defeats the one thing the projection is for. Returns null when nothing was
// consumed in the window — no projection beats an invented one.
export function consumptionPerDay(
  rows: Pick<Movement, 'delta' | 'at'>[],
  since: number,
  now: number,
): number | null {
  const consumed = countConsumed(rows, since);
  if (consumed === 0) return null;
  // Rows are newest-first, so the last one is the oldest thing on record.
  const oldest = rows[rows.length - 1]?.at ?? since;
  const days = Math.max(1, (now - Math.max(since, oldest)) / MS_PER_DAY);
  return consumed / days;
}

// Baht (in satang) spent on orders at or after `since`. Orders are positive deltas carrying a price.
export function totalSpent(
  rows: Pick<Movement, 'delta' | 'price' | 'at'>[],
  since: number,
): number {
  let spent = 0;
  for (const m of rows) {
    if (m.delta > 0 && m.at >= since) spent += m.price;
  }
  return spent;
}

// The brand/bean of the most recent order — drives the "currently drinking" label on the stock hero.
// `rows` are newest-first, so the first order wins. Null when nothing's been ordered yet.
export function latestBlend(rows: Movement[]): { brand: string; beanName: string } | null {
  for (const m of rows) {
    if (m.delta > 0 && m.brand !== '') return { brand: m.brand, beanName: m.beanName };
  }
  return null;
}

// Which movements the History log shows. Drinks are negative deltas, orders positive — the same
// sign convention every reducer above relies on.
export type HistoryFilter = 'all' | 'drinks' | 'orders';

export function matchesFilter(row: Pick<Movement, 'delta'>, filter: HistoryFilter): boolean {
  if (filter === 'drinks') return row.delta < 0;
  if (filter === 'orders') return row.delta > 0;
  return true;
}

// One rendered line in the History log. A day's drinks collapse into a SINGLE entry: 597 of the 606
// movements on a real device are drinks, every one of them identical apart from a timestamp, and
// rendering them one-per-row made the log 53 screens tall and its longest run 11 byte-identical
// lines. The collapsed entry keeps its own movements so a specific cup can still be edited or
// deleted once the row is expanded. Orders never collapse — each one is distinct and informative.
export type DayEntry =
  | { kind: 'drinks'; cups: number; from: number; to: number; movements: Movement[] }
  | { kind: 'order'; movement: Movement };

// Collapse ONE day's movements (newest-first, as listMovements returns them) into render entries.
// The drinks entry takes the position of the day's newest drink, so an order logged mid-day still
// reads in roughly the right place without splitting the day's drinking into two piles.
export function buildDayEntries(rows: Movement[]): DayEntry[] {
  const drinks = rows.filter((m) => m.delta < 0);
  const entries: DayEntry[] = [];
  let placed = false;
  for (const m of rows) {
    if (m.delta >= 0) {
      entries.push({ kind: 'order', movement: m });
      continue;
    }
    if (placed) continue;
    placed = true;
    let cups = 0;
    for (const d of drinks) cups += -d.delta;
    // Newest-first, so the LAST drink is the earliest one of the day. The `?? m.at` fallbacks can
    // never fire — we are inside the branch that proves `drinks` is non-empty — but they keep this
    // free of the banned `!` assertion.
    entries.push({
      kind: 'drinks',
      cups,
      from: drinks[drinks.length - 1]?.at ?? m.at,
      to: drinks[0]?.at ?? m.at,
      movements: drinks,
    });
  }
  return entries;
}
