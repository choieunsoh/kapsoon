import { afterEach, expect, test, vi } from 'vitest';
import { formatMonthLabel, isSameMonth, startOfMonthsAgo, startOfPrevMonth } from './datetime';

// These pin the clock to month-end dates specifically because `setDate(1)` must run BEFORE
// `setMonth()` in both functions under test. Reverse that order and, on the 31st, `setMonth(n-1)`
// asks the Date object for "31 <month n-1>" while the day-of-month field still reads 31 — a value
// most short months don't have, so JS rolls the overflow forward into the following month. E.g. on
// 31 March, decrementing the month first lands on "31 February", which normalizes to 3 March, so
// "one month ago" would wrongly read as March instead of February. Without a fixed clock, this only
// ever shows up on the 29th-31st of a month, which is exactly why it shipped uncaught.

afterEach(() => {
  vi.useRealTimers();
});

function pin(isoLocal: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoLocal));
}

test('startOfMonthsAgo(1) from 31 March is 1 February, not 1 March', () => {
  pin('2026-03-31T12:00:00');

  const d = new Date(startOfMonthsAgo(1));
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(1); // February
  expect(d.getDate()).toBe(1);
  expect(d.getHours()).toBe(0);
});

test('startOfMonthsAgo(0) from 31 March is 1 March, the current month', () => {
  pin('2026-03-31T12:00:00');

  const d = new Date(startOfMonthsAgo(0));
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(2); // March
  expect(d.getDate()).toBe(1);
});

test('startOfPrevMonth from 31 March is 1 February, not 1 March', () => {
  pin('2026-03-31T12:00:00');

  const d = new Date(startOfPrevMonth());
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(1); // February
  expect(d.getDate()).toBe(1);
  expect(d.getHours()).toBe(0);
});

test('startOfMonthsAgo(1) from 31 May is 1 April, not 1 May', () => {
  pin('2026-05-31T09:30:00');

  const d = new Date(startOfMonthsAgo(1));
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(3); // April
  expect(d.getDate()).toBe(1);
});

test('startOfPrevMonth from 31 January crosses the year boundary to 1 December', () => {
  pin('2026-01-31T00:00:00');

  const d = new Date(startOfPrevMonth());
  expect(d.getFullYear()).toBe(2025);
  expect(d.getMonth()).toBe(11); // December
  expect(d.getDate()).toBe(1);
});

test('month comparison is calendar-based, not a 30-day window', () => {
  // Date arithmetic, not string slicing — matching how every other boundary in this file works, and
  // so a device timezone change can't shift which month a timestamp belongs to.
  expect(isSameMonth(Date.UTC(2026, 5, 1, 12), Date.UTC(2026, 5, 30, 12))).toBe(true);
  expect(isSameMonth(Date.UTC(2026, 5, 30, 12), Date.UTC(2026, 6, 1, 12))).toBe(false);
  // Same month number, different year.
  expect(isSameMonth(Date.UTC(2025, 6, 15, 12), Date.UTC(2026, 6, 15, 12))).toBe(false);
});

test('a month label names the month and the year', () => {
  expect(formatMonthLabel(Date.UTC(2026, 5, 15, 12))).toBe('June 2026');
});
