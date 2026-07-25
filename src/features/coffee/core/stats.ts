import { type Movement } from './movement';
import { dayKey, startOfDaysAgo, startOfMonth, startOfMonthsAgo } from './datetime';

// Pure derivations for the Dashboard: plain rows in, numbers out. No React, no DB access, no async,
// no throws — every function is total, returning null where a number would be a lie (a zero burn
// rate is not "0 days left", it's unknown). That's what makes this testable with array literals.
//
// `rows` arrive newest-first from listMovements; nothing here depends on the order.

export type CupDay = {
  at: number;
  cups: number;
};

// Cups per local calendar day over the last `days` days, oldest→newest. Always returns exactly
// `days` entries: a day with no coffee is a zero-cup entry, never a missing one, so the chart shows
// gaps as gaps instead of silently compressing the timeline.
export function dailyCups(rows: Pick<Movement, 'delta' | 'at'>[], days: number): CupDay[] {
  // Bucket by local day key first (one pass), then read the window off it — keeps this O(n + days)
  // instead of scanning every row once per day.
  const counts = new Map<string, number>();
  for (const m of rows) {
    if (m.delta >= 0) continue;
    const key = dayKey(m.at);
    counts.set(key, (counts.get(key) ?? 0) + -m.delta);
  }

  const series: CupDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const at = startOfDaysAgo(i);
    series.push({ at, cups: counts.get(dayKey(at)) ?? 0 });
  }
  return series;
}

// The mean of a daily series, for the chart's reference line. Zero-cup days stay in the divisor:
// they're real days you didn't drink, and dropping them would answer "how much on days I drank" —
// a different, much higher number than "how much a day".
//
// Deliberately NOT reused from movement.ts's consumptionPerDay, which Home's runway and pace use:
// that's a 14-day window and the chart draws 30, so borrowing it would put the line somewhere other
// than the visual middle of its own bars. The two figures are meant to differ, which is why the
// dashboard names its window on screen.
export function averageCups(series: CupDay[]): number {
  if (series.length === 0) return 0;
  let total = 0;
  for (const day of series) total += day.cups;
  return total / series.length;
}

export type ShopRate = {
  shop: string;
  satang: number; // quantity-weighted per-capsule rate, integer satang
  capsules: number; // capsules bought there, all-time
};

// Every shop you have ordered from and what a capsule actually costs there — cheapest first. This
// is the map costPerCapsule used to build privately and throw away after reading one name off it;
// it is now the single definition of per-shop ranking, so the Dashboard's list and the
// `cheapestShop` field cannot drift apart.
//
// WEIGHTED per shop (Σprice / Σcapsules), so repeat visits aggregate before ranking: averaging each
// receipt's own rate would let a single-capsule impulse buy pull a shop as hard as a 50-capsule bulk
// order. Three exclusions, all inherited: a drink carries no price; a `price === 0` order means cost
// UNKNOWN (an opening-balance row for stock already owned) rather than free, and would otherwise win
// "cheapest" on no evidence at all; an order with no shop name can be costed but not attributed.
//
// Sorted on the ROUNDED rate — the figure that is printed. Sorting on the unrounded one would order
// two rows both displaying ฿10.00 by a difference the reader cannot see, which reads as a broken
// sort. Ties then break toward the shop you have bought more from: the better-evidenced rate.
export function shopRates(rows: Pick<Movement, 'delta' | 'price' | 'shop'>[]): ShopRate[] {
  const byShop = new Map<string, { price: number; capsules: number }>();
  for (const m of rows) {
    if (m.delta <= 0 || m.price === 0 || m.shop === '') continue;
    const shop = byShop.get(m.shop) ?? { price: 0, capsules: 0 };
    shop.price += m.price;
    shop.capsules += m.delta;
    byShop.set(m.shop, shop);
  }

  const rates: ShopRate[] = [];
  // Round only here: satang stays an integer at the boundary, per the house money rule.
  for (const [shop, sums] of byShop) {
    rates.push({ shop, satang: Math.round(sums.price / sums.capsules), capsules: sums.capsules });
  }
  return rates.toSorted((a, b) => a.satang - b.satang || b.capsules - a.capsules);
}

export type CapsuleCost = {
  satang: number; // integer satang per capsule, all-time
  cheapestShop: string | null;
};

// All-time cost per capsule, WEIGHTED BY QUANTITY (Σprice / Σdelta). Averaging each order's own
// per-capsule rate would let a single-capsule impulse buy pull the mean as hard as a 50-capsule
// bulk order — the number people actually want is what a capsule costs on average, not what an
// order costs on average.
//
// A `price === 0` order is excluded: zero price carries no price information, so it means "cost
// unknown" — e.g. an opening-balance row for stock you already had — not "free".
//
// This total is NOT the sum of shopRates': an order with no shop name is costed here and ranked
// there, which is why the loop below stays separate rather than folding into shopRates.
export function costPerCapsule(
  rows: Pick<Movement, 'delta' | 'price' | 'shop'>[],
): CapsuleCost | null {
  let price = 0;
  let capsules = 0;
  for (const m of rows) {
    if (m.delta <= 0 || m.price === 0) continue;
    price += m.price;
    capsules += m.delta;
  }

  if (capsules === 0) return null;

  return { satang: Math.round(price / capsules), cheapestShop: shopRates(rows)[0]?.shop ?? null };
}

export type MonthSpend = {
  at: number; // local midnight on the 1st of the month
  satang: number; // integer satang actually spent that month
};

// What you ACTUALLY paid, per local calendar month, oldest→newest. Deliberately calendar months
// rather than a rolling window: a bar series needs stable, comparable buckets, and a rolling window
// drawn as bars would have every bar mean something slightly different.
//
// This is cash, not the accrual rate that habitCost reports. The two genuinely differ — you drink
// every day and buy every three weeks — and the labels on screen are what keep them from reading as
// a contradiction.
export function spendByMonth(
  rows: Pick<Movement, 'delta' | 'price' | 'at'>[],
  months: number,
): MonthSpend[] {
  const series: MonthSpend[] = [];
  for (let i = months - 1; i >= 0; i--) series.push({ at: startOfMonthsAgo(i), satang: 0 });

  for (const m of rows) {
    if (m.delta <= 0) continue;
    // Walk newest-first and take the first bucket that starts at or before the order. An order
    // older than the oldest bucket matches nothing and is correctly dropped.
    for (let i = series.length - 1; i >= 0; i--) {
      const bucket = series[i];
      if (bucket === undefined) continue;
      if (m.at >= bucket.at) {
        bucket.satang += m.price;
        break;
      }
    }
  }

  return series;
}

export type OrderCadence = {
  // null with fewer than two orders — a single order has no gap to measure, and reporting 0 would
  // read as "you order every day".
  medianGapDays: number | null;
  daysSinceLast: number; // whole local days, floored
};

const MS_PER_DAY = 86_400_000;

// How often you restock, and how long since you last did. Null when nothing has ever been ordered.
//
// MEDIAN, not mean: one stock-up trip after an unusually long absence should not redefine the
// cadence, and with a handful of orders the mean is dominated by exactly that outlier. With an even
// number of gaps the median is the mean of the two middle values.
//
// `now` is a parameter rather than a Date.now() call so the behaviour is pinnable in tests, matching
// consumptionPerDay in movement.ts. Rows are sorted rather than assumed ordered: they arrive
// newest-first from listMovements, and every other function here is order-independent.
export function orderCadence(
  rows: Pick<Movement, 'delta' | 'at'>[],
  now = Date.now(),
): OrderCadence | null {
  const times: number[] = [];
  for (const m of rows) if (m.delta > 0) times.push(m.at);
  if (times.length === 0) return null;

  times.sort((a, b) => a - b);
  const last = times[times.length - 1];
  if (last === undefined) return null;
  const daysSinceLast = Math.max(0, Math.floor((now - last) / MS_PER_DAY));

  if (times.length < 2) return { medianGapDays: null, daysSinceLast };

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const previous = times[i - 1];
    const current = times[i];
    if (previous === undefined || current === undefined) continue;
    gaps.push((current - previous) / MS_PER_DAY);
  }

  gaps.sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  const upper = gaps[middle];
  const lower = gaps[middle - 1];
  if (upper === undefined) return { medianGapDays: null, daysSinceLast };
  const median = gaps.length % 2 === 1 || lower === undefined ? upper : (lower + upper) / 2;

  return { medianGapDays: Math.round(median), daysSinceLast };
}

export type HabitCost = {
  perCapsule: number; // integer satang, ALL-TIME, quantity-weighted
  // What that price adds up to at the current drinking rate. NULL when the rate is zero — the two
  // figures are one fact ("what the habit costs to run") and they stand or fall together, so they
  // live under one nullable key rather than as two independently-nullable numbers a caller could
  // narrow half of. See the rationale on `habitCost`.
  rate: {
    perDay: number; // integer satang, price × the `days`-window drinking rate
    perMonth: number; // integer satang, the same rate over 30 days
  } | null;
  cheapestShop: string | null;
};

// What the habit costs: the price of a capsule, and what that price times your current drinking rate
// adds up to per day and per month.
//
// TWO WINDOWS, DELIBERATELY. The price is ALL-TIME; the rate is the rolling `days` window. These are
// different kinds of fact — what a capsule costs moves slowly and is best estimated from all
// history, while how fast you drink is a current behaviour. Forcing the price to 30 days means that
// after four weeks without reordering (entirely normal at a ~21-day cadence) the price is null and
// the whole cost section collapses to dashes, on a page whose stated job is what this costs. The
// labels on screen state both windows; see the spec's Deviation section.
//
// perDay uses the ROUNDED per-capsule price on purpose, so the three figures reconcile with what is
// actually printed. perMonth is computed from the rate directly rather than as perDay * 30, which
// would multiply a sub-satang rounding error thirty-fold.
//
// A ZERO RATE RETURNS null, not zero — this module's rule that a number which would be a lie is
// returned as null, applied to the one place it previously wasn't. With orders on file but no cups
// in the window (a month away, a switch to another machine), price × 0 printed "about ฿0.00 a day ·
// ฿0.00 a month" under a real per-capsule price, which does not read as "unknown" — it reads as a
// claim that the habit is now free, sitting directly beneath the evidence that it isn't.
// movement.ts's consumptionPerDay already returns null for exactly this case and HomeView already
// guards on it; this is the same rule reaching the last function that skipped it.
export function habitCost(
  rows: Pick<Movement, 'delta' | 'price' | 'shop' | 'at'>[],
  days = 30,
): HabitCost | null {
  const cost = costPerCapsule(rows);
  if (cost === null) return null;

  const cupsPerDay = averageCups(dailyCups(rows, days));

  return {
    perCapsule: cost.satang,
    rate:
      cupsPerDay === 0
        ? null
        : {
            perDay: Math.round(cost.satang * cupsPerDay),
            perMonth: Math.round(cost.satang * cupsPerDay * 30),
          },
    cheapestShop: cost.cheapestShop,
  };
}

export type OrderSuggestions = {
  shops: string[];
  brands: string[];
  beans: string[];
};

// Locale-sorted array off a Set. toSorted (not sort) makes the no-mutation intent explicit — the
// [...s] spread already produces a fresh array, but toSorted says so without the reader checking.
// Module-scope so it isn't rebuilt on every orderSuggestions call.
function sortedValues(values: Set<string>): string[] {
  return [...values].toSorted((a, b) => a.localeCompare(b));
}

// Distinct, non-empty, locale-sorted shop/brand/bean values seen on past ORDERS — the option lists
// behind the order form's <datalist> autocomplete. Orders only (delta > 0): a drink carries no
// shop/brand/bean, and its empty strings would just be filtered out anyway. Deduping here is the
// actual point of the feature: costPerCapsule groups shops by exact string, so surfacing the
// spelling you already used stops "7-11" and "7-Eleven" ranking as two shops.
export function orderSuggestions(
  rows: Pick<Movement, 'delta' | 'shop' | 'brand' | 'beanName'>[],
): OrderSuggestions {
  const shops = new Set<string>();
  const brands = new Set<string>();
  const beans = new Set<string>();
  for (const m of rows) {
    if (m.delta <= 0) continue;
    if (m.shop !== '') shops.add(m.shop);
    if (m.brand !== '') brands.add(m.brand);
    if (m.beanName !== '') beans.add(m.beanName);
  }
  return { shops: sortedValues(shops), brands: sortedValues(brands), beans: sortedValues(beans) };
}

export type MonthGrid = {
  at: number; // local midnight on the 1st of the month
  days: number[]; // cups per day-of-month, 1-indexed (days[1] = the 1st); index 0 unused
};

export type MonthGrids = {
  months: MonthGrid[]; // newest month first
  max: number; // largest single-day cup count across ALL months, floored at 1
};

// Which calendar days you drank, laid out as month grids for the Dashboard. Consumption only
// (delta < 0). Months are CONTIGUOUS from the current month back to the month of the earliest cup:
// a dormant month in between is an all-zero grid, never skipped, so the timeline can't silently
// compress (same rule as dailyCups zero-filling days). `max` is the busiest single day across ALL
// months, floored at 1, so one global shade scale means a dark cell reads the same in every month.
//
// Reads the clock (startOfMonth, and `new Date()` for day timestamps). Safe for the same reason the
// rest of the dashboard's clock-reading stats are: movements is [] on the server and on the client's
// first render (use-coffee loads in a mount effect), so DashboardView's movements.length === 0 early
// return fires on both passes and this never runs during hydration.
export function monthGrids(rows: Pick<Movement, 'delta' | 'at'>[]): MonthGrids {
  // One pass: bucket consumption by local day key and remember the earliest cup.
  const perDay = new Map<string, number>();
  let earliest = Number.POSITIVE_INFINITY;
  for (const m of rows) {
    if (m.delta >= 0) continue;
    const key = dayKey(m.at);
    perDay.set(key, (perDay.get(key) ?? 0) + -m.delta);
    if (m.at < earliest) earliest = m.at;
  }

  if (perDay.size === 0) return { months: [], max: 1 };

  const start = new Date(earliest);
  const startYear = start.getFullYear();
  const startMonth = start.getMonth();

  const months: MonthGrid[] = [];
  let max = 0;
  // startOfMonth() is local midnight on the 1st of the current month; keeping the cursor on the 1st
  // means setMonth(-1) can't overflow (the 31st→wrong-month trap datetime.ts documents).
  const cursor = new Date(startOfMonth());
  while (
    cursor.getFullYear() > startYear ||
    (cursor.getFullYear() === startYear && cursor.getMonth() >= startMonth)
  ) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    // Day 0 of the next month is the last day of this one — the day count, without a lookup table.
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth + 1 }, () => 0);
    for (let d = 1; d <= daysInMonth; d++) {
      const cups = perDay.get(dayKey(new Date(year, month, d).getTime())) ?? 0;
      days[d] = cups;
      if (cups > max) max = cups;
    }
    months.push({ at: cursor.getTime(), days });
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return { months, max: Math.max(max, 1) };
}
