import { expect, test } from 'vitest';
import {
  startOfDaysAgo,
  startOfMonth,
  startOfMonthsAgo,
  startOfPrevMonth,
  startOfToday,
} from './datetime';
import {
  averageCups,
  costPerCapsule,
  dailyCups,
  habitCost,
  monthGrids,
  orderCadence,
  orderSuggestions,
  shopRates,
  spendByMonth,
} from './stats';

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

// The bug this guards: the Dashboard chart's reference line must sit at the mean of the days it
// actually draws. Dividing by "days I drank" instead of "days shown" floats the line above most of
// its own bars, and borrowing Home's 14-day pace (movement.ts's consumptionPerDay) for a 30-day
// chart does the same.
test('averageCups divides by every day shown, including the zero ones', () => {
  const day = (cups: number, i: number) => ({ at: i, cups });

  // 8 cups over 4 days is 2/day — not 4/day, which is what dropping the two dry days would give.
  expect(averageCups([day(4, 0), day(0, 1), day(4, 2), day(0, 3)])).toBe(2);
  expect(averageCups([day(0, 0), day(0, 1)])).toBe(0);
  expect(averageCups([])).toBe(0);

  // It is the mean of the series handed to it, so a 30-day window and a 14-day one disagree — the
  // chart must pass its own series rather than borrow the runway's rate.
  const spike = [day(30, 0), ...Array.from({ length: 29 }, (_, i) => day(0, i + 1))];
  expect(averageCups(spike)).toBe(1);
  expect(averageCups(spike.slice(0, 15))).toBe(2);
});

test('startOfDaysAgo(0) is today at local midnight', () => {
  expect(startOfDaysAgo(0)).toBe(startOfToday());
});

test('startOfDaysAgo(n) is n local midnights back and always at midnight', () => {
  for (const n of [1, 13, 29]) {
    const at = startOfDaysAgo(n);
    const d = new Date(at);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    // Local days are 24h apart except across a DST shift. A DST shift is at most 1 hour,
    // so we assert elapsed is within ±1 hour of exactly n days. This tighter window catches
    // an off-by-one bug (e.g., returning n-1 days would give (n-1)·24h, still within a ±24h
    // window but violating the ±1h constraint). This must not go red in a DST timezone.
    const elapsed = startOfToday() - at;
    expect(elapsed).toBeGreaterThanOrEqual(n * MS_PER_DAY - MS_PER_HOUR);
    expect(elapsed).toBeLessThanOrEqual(n * MS_PER_DAY + MS_PER_HOUR);
  }
});

test('startOfPrevMonth is the 1st of the month before startOfMonth', () => {
  const prev = new Date(startOfPrevMonth());
  const current = new Date(startOfMonth());
  expect(prev.getDate()).toBe(1);
  expect(prev.getHours()).toBe(0);
  // Wraps the year correctly: January's previous month is December of the prior year.
  const expectedMonth = (current.getMonth() + 11) % 12;
  expect(prev.getMonth()).toBe(expectedMonth);
  expect(prev.getTime()).toBeLessThan(current.getTime());
});

test('dailyCups returns exactly `days` entries, oldest first', () => {
  const series = dailyCups([], 30);
  expect(series).toHaveLength(30);
  expect(series[29]?.at).toBe(startOfDaysAgo(0));
  expect(series[0]?.at).toBe(startOfDaysAgo(29));
  for (const day of series) expect(day.cups).toBe(0);
});

test('dailyCups buckets consumption into its local calendar day', () => {
  const rows = [
    { delta: -1, at: startOfDaysAgo(0) + 8 * 3_600_000 }, // today, 08:00
    { delta: -1, at: startOfDaysAgo(0) + 20 * 3_600_000 }, // today, 20:00
    { delta: -1, at: startOfDaysAgo(2) + 9 * 3_600_000 }, // two days ago
  ];
  const series = dailyCups(rows, 7);
  expect(series[6]?.cups).toBe(2); // today
  expect(series[5]?.cups).toBe(0); // yesterday — a real gap, not a dropped entry
  expect(series[4]?.cups).toBe(1);
});

test('dailyCups counts multi-cup deltas and ignores orders', () => {
  const rows = [
    { delta: -3, at: startOfDaysAgo(1) + 3_600_000 },
    { delta: 50, at: startOfDaysAgo(1) + 3_600_000 }, // an order — not consumption
  ];
  expect(dailyCups(rows, 3)[1]?.cups).toBe(3);
});

test('dailyCups excludes days outside the window', () => {
  const rows = [{ delta: -5, at: startOfDaysAgo(40) + 3_600_000 }];
  const series = dailyCups(rows, 30);
  expect(series.reduce((sum, day) => sum + day.cups, 0)).toBe(0);
});

// Straddles the window edge deliberately. A fixture sitting comfortably inside the window cannot
// tell a 7-day window from an 8-day one — only data on both sides of the line can, so one cup goes
// on the oldest included day and one on the first excluded day.
test('dailyCups includes the oldest day in the window and excludes the day before it', () => {
  const rows = [
    { delta: -2, at: startOfDaysAgo(6) + 3_600_000 }, // oldest day of a 7-day window
    { delta: -9, at: startOfDaysAgo(7) + 3_600_000 }, // one day too old
  ];
  const series = dailyCups(rows, 7);
  expect(series[0]?.cups).toBe(2);
  expect(series.reduce((sum, day) => sum + day.cups, 0)).toBe(2);
});

test('costPerCapsule weights by quantity, not by order', () => {
  const rows = [
    { delta: 50, price: 50_000, shop: 'Tops' }, // ฿10.00/capsule
    { delta: 1, price: 5_000, shop: 'Cafe' }, // ฿50.00/capsule — one capsule, must not swing the mean
  ];
  // Weighted: 55_000 satang / 51 capsules = 1078.4 → 1078. Unweighted would be 3000 satang.
  expect(costPerCapsule(rows)).toBe(1078);
});

test('costPerCapsule ignores drinks and unnamed shops', () => {
  const rows = [
    { delta: -1, price: 0, shop: '' }, // a drink — never counts toward cost
    { delta: 10, price: 20_000, shop: '' }, // an order with no shop: counts for cost all the same
  ];
  expect(costPerCapsule(rows)).toBe(2_000);
});

test('costPerCapsule is null when nothing has been ordered', () => {
  expect(costPerCapsule([])).toBeNull();
  expect(costPerCapsule([{ delta: -1, price: 0, shop: '' }])).toBeNull();
});

test('costPerCapsule excludes zero-price orders from the weighted average', () => {
  const rows = [
    { delta: 10, price: 20_000, shop: 'Tops' }, // ฿20.00/capsule — the only real price data
    { delta: 175, price: 0, shop: 'Opening balance' }, // stock on hand, not a purchase
  ];
  // If the free capsules were averaged in: 20_000 / 185 = 108 satang. Excluded, it's 2_000.
  expect(costPerCapsule(rows)).toBe(2_000);
});

test('costPerCapsule is null when every order is zero-price', () => {
  const rows = [
    { delta: 175, price: 0, shop: 'Opening balance' },
    { delta: 5, price: 0, shop: 'Free sample' },
  ];
  expect(costPerCapsule(rows)).toBeNull();
});

test('shopRates ranks every shop cheapest first, not just the winner', () => {
  const rows = [
    { delta: 10, price: 30_000, shop: 'Tops' }, // ฿30.00/capsule
    { delta: 10, price: 20_000, shop: 'Makro' }, // ฿20.00/capsule — cheapest
    { delta: 10, price: 40_000, shop: 'Cafe' },
  ];
  expect(shopRates(rows).map((r) => r.shop)).toEqual(['Makro', 'Tops', 'Cafe']);
});

test('shopRates weights repeat visits by quantity rather than averaging receipts', () => {
  const rows = [
    { delta: 1, price: 500, shop: 'Makro' }, // a cheap one-off…
    { delta: 99, price: 99_000, shop: 'Makro' }, // …outweighed by the bulk buy
    { delta: 10, price: 6_000, shop: 'Tops' }, // ฿6.00/capsule — actually cheapest
  ];
  // 99_500 satang / 100 capsules = 995. Averaging the two receipts' own rates would give 750.
  expect(shopRates(rows)).toEqual([
    { shop: 'Tops', satang: 600, capsules: 10 },
    { shop: 'Makro', satang: 995, capsules: 100 },
  ]);
});

test('shopRates excludes drinks, unnamed shops and zero-price orders', () => {
  const rows = [
    { delta: -1, price: 0, shop: '' }, // a drink
    { delta: 10, price: 20_000, shop: '' }, // an order that cannot be attributed
    { delta: 175, price: 0, shop: 'Opening balance' }, // cost UNKNOWN, not free
    { delta: 10, price: 15_000, shop: 'Makro' },
  ];
  expect(shopRates(rows)).toEqual([{ shop: 'Makro', satang: 1_500, capsules: 10 }]);
});

test('shopRates breaks a tie toward the shop with more capsules behind the rate', () => {
  const rows = [
    { delta: 5, price: 5_000, shop: 'Cafe' }, // ฿10.00/capsule on 5 capsules
    { delta: 50, price: 50_000, shop: 'Makro' }, // ฿10.00/capsule on 50 — better evidenced
  ];
  expect(shopRates(rows).map((r) => r.shop)).toEqual(['Makro', 'Cafe']);
});

// Rows are sorted on the ROUNDED rate — the figure actually printed. Sorting on the unrounded rate
// would order two rows that both display ฿10.00 by a difference the reader cannot see, which reads
// on screen as a broken sort. The capsule tie-break then decides, as it does for an exact tie.
test('shopRates sorts on the rate it prints, not on sub-satang precision', () => {
  const rows = [
    { delta: 3, price: 3_001, shop: 'Cafe' }, // 1000.33 → ฿10.00
    { delta: 30, price: 30_002, shop: 'Makro' }, // 1000.07 → ฿10.00, more capsules
  ];
  const rates = shopRates(rows);
  expect(rates.map((r) => r.satang)).toEqual([1_000, 1_000]);
  expect(rates.map((r) => r.shop)).toEqual(['Makro', 'Cafe']);
});

test('shopRates is empty when no order carries a shop name', () => {
  expect(shopRates([])).toEqual([]);
  expect(shopRates([{ delta: 10, price: 20_000, shop: '' }])).toEqual([]);
});

// A zero-price shop must never rank first by default: it is excluded outright, not sorted to the
// bottom, so it cannot win "cheapest" just because the real prices happen to all be higher than 0.
test('shopRates never ranks a zero-price shop cheapest', () => {
  const rows = [
    { delta: 175, price: 0, shop: 'Opening balance' }, // 0 satang/capsule — must not win by default
    { delta: 10, price: 20_000, shop: 'Tops' }, // ฿20.00/capsule
    { delta: 10, price: 15_000, shop: 'Makro' }, // ฿15.00/capsule — actually cheapest
  ];
  expect(shopRates(rows).map((r) => r.shop)).toEqual(['Makro', 'Tops']);
});

test('costPerCapsule still costs an unnamed-shop order it cannot rank', () => {
  const rows = [{ delta: 10, price: 20_000, shop: '' }];
  expect(costPerCapsule(rows)).toBe(2_000);
  expect(shopRates(rows)).toEqual([]);
});

test('spendByMonth returns exactly `months` entries, oldest first', () => {
  const series = spendByMonth([], 6);

  expect(series).toHaveLength(6);
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    expect(prev === undefined || cur === undefined || prev.at < cur.at).toBe(true);
  }
});

// A month with no orders is a zero entry, never a missing one — same reasoning as dailyCups. A
// missing month would silently compress the timeline and make a quiet month look like a busy one.
test('spendByMonth zero-fills months with no orders', () => {
  const series = spendByMonth([], 3);

  expect(series.map((m) => m.satang)).toEqual([0, 0, 0]);
});

test('spendByMonth sums order prices into their calendar month and ignores drinks', () => {
  const thisMonth = startOfMonth() + 1_000;
  const lastMonth = startOfPrevMonth() + 1_000;
  const rows = [
    { delta: 10, price: 30_000, at: thisMonth },
    { delta: 10, price: 20_000, at: thisMonth },
    { delta: 10, price: 50_000, at: lastMonth },
    // Non-zero price: if the `delta <= 0` guard were removed, this would wrongly add 99_999 to
    // this month's total, so the assertion below would fail instead of passing by coincidence.
    { delta: -1, price: 99_999, at: thisMonth },
  ];

  const series = spendByMonth(rows, 2);

  expect(series[0]?.satang).toBe(50_000); // last month
  expect(series[1]?.satang).toBe(50_000); // this month, two orders summed
});

// Pins the bucket edge: an order at the exact first millisecond of a month belongs to the month that
// starts there, not the one before it.
test('spendByMonth puts a midnight-on-the-1st order in the month that starts there', () => {
  const rows = [{ delta: 10, price: 12_345, at: startOfMonth() }];
  const series = spendByMonth(rows, 2);

  expect(series[0]?.satang).toBe(0);
  expect(series[1]?.satang).toBe(12_345);
});

test('spendByMonth excludes orders older than the window', () => {
  const rows = [{ delta: 10, price: 99_999, at: startOfMonthsAgo(5) }];

  expect(spendByMonth(rows, 2).reduce((total, m) => total + m.satang, 0)).toBe(0);
});

const DAY_MS = 86_400_000;

test('orderCadence is null when nothing has ever been ordered', () => {
  const now = Date.now();

  expect(orderCadence([], now)).toBeNull();
  expect(orderCadence([{ delta: -1, at: now }], now)).toBeNull();
});

test('orderCadence reports days since the last order', () => {
  const now = Date.now();
  const rows = [{ delta: 10, at: now - 12 * DAY_MS }];

  expect(orderCadence(rows, now)?.daysSinceLast).toBe(12);
});

// One order has no gap to measure. Reporting 0 would read as "you order every day".
test('orderCadence has no gap figure with only one order', () => {
  const now = Date.now();
  const rows = [{ delta: 10, at: now - 3 * DAY_MS }];

  expect(orderCadence(rows, now)?.medianGapDays).toBeNull();
});

test('orderCadence measures the median gap between consecutive orders', () => {
  const now = Date.now();
  const rows = [
    { delta: 10, at: now - 60 * DAY_MS },
    { delta: 10, at: now - 40 * DAY_MS }, // gap 20
    { delta: 10, at: now - 20 * DAY_MS }, // gap 20
    { delta: 10, at: now - 2 * DAY_MS }, // gap 18
  ];

  expect(orderCadence(rows, now)?.medianGapDays).toBe(20);
});

// The whole reason for median over mean: one stock-up trip after a long absence must not redefine
// the cadence. The mean here is 40; the median is 21.
test('orderCadence is not moved by a single outlier gap', () => {
  const now = Date.now();
  const rows = [
    { delta: 10, at: now - 160 * DAY_MS },
    { delta: 10, at: now - 60 * DAY_MS }, // gap 100 — the outlier
    { delta: 10, at: now - 39 * DAY_MS }, // gap 21
    { delta: 10, at: now - 18 * DAY_MS }, // gap 21
  ];

  expect(orderCadence(rows, now)?.medianGapDays).toBe(21);
});

// With an even number of gaps the median is the mean of the two middle values. Spelled out because
// it is exactly the detail two implementations would disagree on.
test('orderCadence averages the two middle gaps when there is an even number', () => {
  const now = Date.now();
  const rows = [
    { delta: 10, at: now - 40 * DAY_MS },
    { delta: 10, at: now - 30 * DAY_MS }, // gap 10
    { delta: 10, at: now - 10 * DAY_MS }, // gap 20
  ];

  expect(orderCadence(rows, now)?.medianGapDays).toBe(15);
});

// movements arrives newest-first from listMovements. Every other function in this module is
// order-independent, and this one must not be the exception that quietly isn't.
test('orderCadence does not depend on the order rows arrive in', () => {
  const now = Date.now();
  const rows = [
    { delta: 10, at: now - 2 * DAY_MS },
    { delta: 10, at: now - 22 * DAY_MS },
    { delta: 10, at: now - 44 * DAY_MS },
  ];

  expect(orderCadence(rows, now)?.medianGapDays).toBe(21);
  expect(orderCadence([...rows].reverse(), now)?.medianGapDays).toBe(21);
});

// Builds a log with a known price and a known drinking rate: `cups` capsules a day for `days` days.
function habitRows(perCapsuleSatang: number, cups: number, days: number) {
  const rows = [{ delta: 100, price: perCapsuleSatang * 100, shop: 'Tops', at: startOfDaysAgo(0) }];
  for (let d = 0; d < days; d++) {
    for (let c = 0; c < cups; c++) {
      rows.push({ delta: -1, price: 0, shop: '', at: startOfDaysAgo(d) + 9 * 3_600_000 });
    }
  }
  return rows;
}

test('habitCost is null when nothing has been ordered', () => {
  expect(habitCost([])).toBeNull();
  expect(habitCost([{ delta: -1, price: 0, shop: '', at: Date.now() }])).toBeNull();
});

test('habitCost multiplies the capsule price by the daily rate', () => {
  // ฿20.00 a capsule, 2 a day across all 30 days of the window.
  const cost = habitCost(habitRows(2_000, 2, 30), 30);

  expect(cost?.perCapsule).toBe(2_000);
  expect(cost?.rate?.perDay).toBe(4_000);
  expect(cost?.rate?.perMonth).toBe(120_000);
});

// Orders on file but no cups in the window — a month away, a switch to another machine. The price
// is still known and still true; what it costs to RUN the habit is not, and price × 0 is not the
// answer to that. Zero here would print "about ฿0.00 a day · ฿0.00 a month" directly beneath a real
// per-capsule price: a claim that the habit is free, sitting on top of the evidence that it isn't.
test('habitCost reports an unknown rate as null, not as zero', () => {
  const rows = [{ delta: 100, price: 200_000, shop: 'Tops', at: startOfDaysAgo(0) }];
  const cost = habitCost(rows, 30);

  expect(cost?.perCapsule).toBe(2_000);
  expect(cost?.rate).toBeNull();
});

// Zero-cup days stay in the divisor: they are real days you did not drink. Dropping them would
// answer "what it costs on days I drink", a different and much larger number.
test('habitCost divides by every day in the window, including the zero ones', () => {
  // 2 a day for 15 of 30 days = 1 a day overall.
  const cost = habitCost(habitRows(2_000, 2, 15), 30);

  expect(cost?.rate?.perDay).toBe(2_000);
});

// perMonth is computed from the rate directly, NOT as perDay * 30, which would round twice and
// multiply the error thirty-fold. The divergence here comes from the fractional RATE, not the price:
// ฿15.55 × 7 capsules ÷ 7 divides exactly, so costPerCapsule rounds nothing away, but 1 cup over 7
// days is 0.142857… a day. Derived from the rate, ฿1,555 × 0.142857 × 30 rounds once to 6664;
// compounded from the rounded perDay it is 222 × 30 = 6660. Four satang, from one extra rounding.
test('habitCost derives the month from the rate, not from the rounded day', () => {
  const rows = [
    { delta: 7, price: 15_55 * 7, shop: 'Tops', at: startOfDaysAgo(0) },
    { delta: -1, price: 0, shop: '', at: startOfDaysAgo(3) + 9 * 3_600_000 },
  ];
  const cost = habitCost(rows, 7);

  expect(cost).not.toBeNull();
  expect(cost?.rate?.perMonth).not.toBe((cost?.rate?.perDay ?? 0) * 30);
});

// A zero-price order means "cost unknown" (an opening-balance row), not "free". costPerCapsule
// already excludes them and habitCost must inherit that, or the whole habit reads as cheaper.
test('habitCost inherits the zero-price exclusion', () => {
  const rows = [
    { delta: 100, price: 0, shop: 'Free', at: startOfDaysAgo(0) },
    { delta: 10, price: 20_000, shop: 'Tops', at: startOfDaysAgo(0) },
    { delta: -1, price: 0, shop: '', at: startOfDaysAgo(0) + 9 * 3_600_000 },
  ];

  expect(habitCost(rows, 30)?.perCapsule).toBe(2_000);
});

test('orderSuggestions returns distinct sorted values from orders only', () => {
  const order = (shop: string, brand: string, beanName: string) => ({
    delta: 10,
    shop,
    brand,
    beanName,
  });
  const drink = { delta: -1, shop: '', brand: '', beanName: '' };

  const rows = [
    order('7-Eleven', 'Nescafe', 'House Blend'),
    order('Amazon', 'Nescafe', 'Crema'),
    order('7-Eleven', 'Bosch', ''), // repeat shop, empty bean
    drink, // drinks contribute nothing
  ];

  expect(orderSuggestions(rows)).toEqual({
    shops: ['7-Eleven', 'Amazon'],
    brands: ['Bosch', 'Nescafe'],
    beans: ['Crema', 'House Blend'],
  });

  // Empty log → three empty lists, never undefined.
  expect(orderSuggestions([])).toEqual({ shops: [], brands: [], beans: [] });
});

const HOUR = 3_600_000;

test('monthGrids on an empty log has no months', () => {
  expect(monthGrids([])).toEqual({ months: [], max: 1 });
});

// Cups only. An order carries no cup, so a log of pure orders has nothing to lay out.
test('monthGrids ignores orders', () => {
  expect(monthGrids([{ delta: 30, at: startOfToday() + 9 * HOUR }])).toEqual({
    months: [],
    max: 1,
  });
});

test('monthGrids buckets this month by day-of-month and ignores orders in the same day', () => {
  const todayDate = new Date(startOfToday()).getDate();
  const data = monthGrids([
    { delta: -2, at: startOfToday() + 9 * HOUR },
    { delta: -1, at: startOfToday() + 20 * HOUR },
    { delta: 50, at: startOfToday() + 10 * HOUR }, // an order — must not count
  ]);

  expect(data.months).toHaveLength(1);
  expect(data.months[0]?.at).toBe(startOfMonth());
  expect(data.months[0]?.days[todayDate]).toBe(3);
  expect(data.max).toBe(3);
});

// The local-day guard: a cup at the very first millisecond of the local day lands on that day,
// not the day before (which a UTC bucketing would give east of Greenwich). Mirrors the dailyCups
// midnight test.
test('monthGrids buckets a cup by its local calendar day, not UTC', () => {
  const todayDate = new Date(startOfToday()).getDate();
  const data = monthGrids([{ delta: -1, at: startOfToday() }]);

  expect(data.months[0]?.days[todayDate]).toBe(1);
});

test('monthGrids spans contiguous months, newest first', () => {
  const data = monthGrids([
    { delta: -1, at: startOfToday() + 9 * HOUR }, // this month
    { delta: -1, at: startOfMonthsAgo(1) + 9 * HOUR }, // 09:00 on the 1st of last month
  ]);

  expect(data.months).toHaveLength(2);
  expect(data.months[0]?.at).toBe(startOfMonth());
  expect(data.months[1]?.at).toBe(startOfPrevMonth());
  expect(data.months[1]?.days[1]).toBe(1); // the 1st of last month
});

// A dormant month between two active ones is present as an all-zero grid, never skipped — else the
// timeline silently compresses, the same failure dailyCups guards against by zero-filling days.
test('monthGrids keeps a dormant middle month as an all-zero grid', () => {
  const data = monthGrids([
    { delta: -1, at: startOfToday() + 9 * HOUR },
    { delta: -1, at: startOfMonthsAgo(2) + 9 * HOUR },
  ]);

  expect(data.months).toHaveLength(3);
  expect(data.months[1]?.at).toBe(startOfMonthsAgo(1));
  expect(data.months[1]?.days.every((c) => c === 0)).toBe(true);
});

// One global scale, not per-month: a heavy day two months ago sets the max a light recent day is
// shaded against, so a dark cell means the same cup-count everywhere.
test('monthGrids scales max globally across every month', () => {
  const todayDate = new Date(startOfToday()).getDate();
  const data = monthGrids([
    { delta: -1, at: startOfToday() + 9 * HOUR }, // light, recent
    { delta: -5, at: startOfMonthsAgo(2) + 9 * HOUR }, // heavy, old
  ]);

  expect(data.max).toBe(5);
  expect(data.months[0]?.days[todayDate]).toBe(1);
  expect(data.months[2]?.days[1]).toBe(5);
});
