import { expect, test } from 'vitest';
import {
  assertIntegerMinor,
  assertPositiveInt,
  buildDayEntries,
  consumptionPerDay,
  countConsumed,
  isMovement,
  latestBlend,
  matchesFilter,
  stockLevel,
  totalSpent,
} from './movement';
import { groupByDay } from './datetime';
import { parseBackup, serializeBackup } from './backup';
import { parseBahtToSatang } from './money';

// OPFS + the SQLite worker are browser-only and don't run under jsdom, so the real DB round-trip is
// covered by the offline Playwright check. Here we assert the pure, node-safe logic: the guards and
// the reducers that drive every number on screen.

test('stock is the running sum of every delta', () => {
  expect(
    stockLevel([
      { delta: 10 }, // bought a 10-pack
      { delta: -1 }, // drank one
      { delta: -1 },
      { delta: 5 }, // bought 5 more
    ]),
  ).toBe(13);
});

test('countConsumed sums only drinks at/after `since`, as a positive count', () => {
  const rows = [
    { delta: 10, at: 100 }, // an order — ignored
    { delta: -1, at: 150 }, // before cutoff — ignored
    { delta: -1, at: 200 }, // counted
    { delta: -1, at: 300 }, // counted
  ];
  expect(countConsumed(rows, 200)).toBe(2);
});

// The bug this guards: Home projects "about N days left" from stock ÷ cups-per-day. Dividing by the
// full 14-day window on a log only two days old understates the pace ~7x and promises a runway that
// isn't there — the exact failure the projection exists to prevent.
test('consumptionPerDay divides by the history that exists, not the window length', () => {
  const day = 86_400_000;
  const now = 100 * day;
  const since = now - 14 * day;
  const drinks = (ats: number[]) => ats.map((at) => ({ delta: -1, at }));

  // Two days of history, 4 cups — 2/day, not 4/14.
  expect(
    consumptionPerDay(drinks([98.9 * day, 98.5 * day, 98.2 * day, 98 * day]), since, now),
  ).toBe(2);

  // History older than the window — the window bounds it, so all 14 cups spread over 14 days.
  const long = drinks(Array.from({ length: 14 }, (_, i) => now - i * day).concat([50 * day]));
  expect(consumptionPerDay(long, since, now)).toBe(1);

  // Nothing drunk in the window — no basis, so no projection.
  expect(consumptionPerDay(drinks([]), since, now)).toBeNull();
  expect(consumptionPerDay([{ delta: 10, at: now }], since, now)).toBeNull();
});

test('totalSpent sums only order prices at/after `since`', () => {
  const rows = [
    { delta: 10, price: 45000, at: 100 }, // before cutoff — ignored
    { delta: -1, price: 0, at: 250 }, // a drink — ignored
    { delta: 5, price: 20000, at: 300 }, // counted (satang)
    { delta: 8, price: 30000, at: 400 }, // counted
  ];
  expect(totalSpent(rows, 200)).toBe(50000);
});

test('latestBlend returns the newest order with a brand (rows are newest-first)', () => {
  const base = { id: 'x', shop: 's', beanName: 'b', price: 0, at: 0 };
  expect(
    latestBlend([
      { ...base, brand: '', delta: -1 }, // a drink — skipped
      { ...base, brand: 'Lavazza', delta: 5 }, // newest order — wins
      { ...base, brand: 'Illy', delta: 3 },
    ]),
  ).toEqual({ brand: 'Lavazza', beanName: 'b' });
  expect(latestBlend([{ ...base, brand: '', delta: -1 }])).toBeNull();
});

test('rejects non-positive / non-integer order quantities', () => {
  expect(() => assertPositiveInt(0)).toThrow();
  expect(() => assertPositiveInt(-3)).toThrow();
  expect(() => assertPositiveInt(2.5)).toThrow();
  expect(() => assertPositiveInt(10)).not.toThrow();
});

test('price guard requires a non-negative integer minor unit', () => {
  expect(() => assertIntegerMinor(-1)).toThrow();
  expect(() => assertIntegerMinor(12.5)).toThrow();
  expect(() => assertIntegerMinor(0)).not.toThrow();
  expect(() => assertIntegerMinor(45000)).not.toThrow();
});

test('isMovement guards the seed JSON at the trust boundary', () => {
  const ok = { id: 'a', shop: '', brand: '', beanName: '', delta: -1, price: 0, at: 1 };
  expect(isMovement(ok)).toBe(true);
  expect(isMovement({ ...ok, id: 5 })).toBe(false); // wrong id type
  expect(isMovement({ delta: -1, price: 0, at: 1 })).toBe(false); // missing id
  expect(isMovement(null)).toBe(false);
  expect(isMovement('nope')).toBe(false);
  // Same invariants as the UI write path: whole capsules, integer non-negative satang, integer ms.
  expect(isMovement({ ...ok, delta: 0.25 })).toBe(false);
  expect(isMovement({ ...ok, price: -550 })).toBe(false);
  expect(isMovement({ ...ok, price: 12.5 })).toBe(false);
  expect(isMovement({ ...ok, at: 1.5 })).toBe(false);
  // Text columns are NOT NULL in SQLite — a non-string would fail the whole import batch.
  expect(isMovement({ ...ok, shop: { evil: true } })).toBe(false);
  expect(isMovement({ ...ok, brand: 5 })).toBe(false);
});

test('parseBackup drops rows outside the write-path invariants, keeps legacy rows', () => {
  // 1e400 parses to Infinity — must not reach the stock/spend reducers.
  const text = '[{"id":"inf","shop":"","brand":"","beanName":"","delta":1e400,"price":0,"at":1}]';
  expect(parseBackup(text)).toEqual([]);
  // A pre-brand/beanName backup row still restores, with the DB's '' defaults.
  expect(parseBackup('[{"id":"old","shop":"Shopee","delta":10,"price":45000,"at":1}]')).toEqual([
    { id: 'old', shop: 'Shopee', brand: '', beanName: '', delta: 10, price: 45000, at: 1 },
  ]);
});

test('parseBahtToSatang rounds baht to integer satang, rejects junk', () => {
  expect(parseBahtToSatang('25')).toBe(2500);
  expect(parseBahtToSatang('25.50')).toBe(2550);
  expect(parseBahtToSatang('19.99')).toBe(1999); // float-safe rounding
  expect(parseBahtToSatang('')).toBeNull();
  expect(parseBahtToSatang('abc')).toBeNull();
  expect(parseBahtToSatang('-5')).toBeNull();
});

// The bug this guards: Home's "Recent" list shows only HH:mm, so a 12:10 entry from yesterday
// rendered below today's 07:23 and looked like a broken sort. Grouping splits on the LOCAL day.
test('groupByDay splits newest-first movements on the local day boundary', () => {
  const at = (day: number, hour: number, minute: number) =>
    new Date(2026, 6, day, hour, minute).getTime();

  const groups = groupByDay([{ at: at(18, 10, 47) }, { at: at(18, 8, 9) }, { at: at(17, 12, 10) }]);

  expect(groups.map((g) => g.rows.length)).toEqual([2, 1]);
  expect(groups[0]?.key).not.toBe(groups[1]?.key);
  // Group order follows input order (newest day first) and each keeps its own label timestamp.
  expect(groups[0]?.at).toBe(at(18, 10, 47));
  expect(groups[1]?.at).toBe(at(17, 12, 10));
});

test('backup round-trips, and parse drops junk rows without failing the whole file', () => {
  const rows = [
    {
      id: 'a',
      shop: 'Shopee',
      brand: 'Starbucks',
      beanName: 'House',
      delta: 10,
      price: 45000,
      at: 1,
    },
    { id: 'b', shop: '', brand: '', beanName: '', delta: -1, price: 0, at: 2 },
  ];
  const file = serializeBackup(rows, new Date(2026, 6, 18, 9, 0).getTime());

  // .txt / text/plain, NOT .json — Chromium refuses to share JSON, silently downgrading to a
  // download. Guard it here so a "tidy-up" rename can't quietly kill Drive export.
  expect(file.name).toBe('kapsoon-backup-2026-07-18.txt');
  expect(file.type).toBe('text/plain');

  expect(parseBackup(file.text)).toEqual(rows);
  // A bare array (the legacy seed export shape) imports too.
  expect(parseBackup(JSON.stringify(rows))).toEqual(rows);
  // One corrupt row costs that row, not the file.
  expect(parseBackup(JSON.stringify([rows[0], { id: 5 }, rows[1]]))).toEqual(rows);
  expect(parseBackup('not json')).toBeNull();
  expect(parseBackup('{"nope":1}')).toBeNull();
});

test('matchesFilter narrows the log by movement type', () => {
  const drink = { delta: -1 };
  const order = { delta: 10 };

  expect(matchesFilter(drink, 'all')).toBe(true);
  expect(matchesFilter(order, 'all')).toBe(true);

  expect(matchesFilter(drink, 'drinks')).toBe(true);
  expect(matchesFilter(order, 'drinks')).toBe(false);

  expect(matchesFilter(drink, 'orders')).toBe(false);
  expect(matchesFilter(order, 'orders')).toBe(true);
});

test('buildDayEntries collapses a day of drinks into one entry and keeps orders separate', () => {
  // Newest-first, exactly as listMovements returns them.
  const rows = [
    { id: 'd3', shop: '', brand: '', beanName: '', delta: -1, price: 0, at: 500 },
    {
      id: 'o1',
      shop: 'Shopee',
      brand: 'Nespresso',
      beanName: 'Ristretto',
      delta: 10,
      price: 45000,
      at: 400,
    },
    { id: 'd2', shop: '', brand: '', beanName: '', delta: -1, price: 0, at: 300 },
    { id: 'd1', shop: '', brand: '', beanName: '', delta: -1, price: 0, at: 200 },
  ];

  const entries = buildDayEntries(rows);

  // One drinks entry (placed where the newest drink was) plus the order — not four rows.
  expect(entries.length).toBe(2);

  const first = entries[0];
  if (first?.kind !== 'drinks') throw new Error('expected the first entry to be the drinks entry');
  expect(first.cups).toBe(3);
  expect(first.from).toBe(200); // earliest drink
  expect(first.to).toBe(500); // latest drink
  expect(first.movements.length).toBe(3);

  const second = entries[1];
  if (second?.kind !== 'order') throw new Error('expected the second entry to be the order');
  expect(second.movement.id).toBe('o1');
});

test('buildDayEntries counts multi-cup drinks and handles a day with no drinks', () => {
  const twoCupsAtOnce = [
    { id: 'd1', shop: '', brand: '', beanName: '', delta: -2, price: 0, at: 100 },
  ];
  const collapsed = buildDayEntries(twoCupsAtOnce)[0];
  if (collapsed?.kind !== 'drinks') throw new Error('expected a drinks entry');
  expect(collapsed.cups).toBe(2);

  const ordersOnly = [
    { id: 'o1', shop: 'Shopee', brand: '', beanName: '', delta: 10, price: 45000, at: 100 },
  ];
  expect(buildDayEntries(ordersOnly).every((e) => e.kind === 'order')).toBe(true);
  expect(buildDayEntries([]).length).toBe(0);
});
