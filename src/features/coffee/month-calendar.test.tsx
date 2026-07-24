import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ACCENT_INK_FLOOR } from './components/chart-ink';
import { MonthCalendar } from './components/MonthCalendar';
import type { MonthGrids } from './stats';

const JAN_2026 = new Date(2026, 0, 1).getTime();
const JAN_15 = new Date(2026, 0, 15).getTime(); // a fixed, injected "today" (local midnight)

// A single January grid with cups on specific days. days is 1-indexed; index 0 is unused.
function january(cupsByDay: Record<number, number>): MonthGrids {
  const days = Array.from({ length: 32 }, () => 0);
  for (const [d, cups] of Object.entries(cupsByDay)) days[Number(d)] = cups;
  return { months: [{ at: JAN_2026, days }], max: Math.max(...Object.values(cupsByDay), 1) };
}

test('empty months render one honest line, no table', () => {
  render(<MonthCalendar data={{ months: [], max: 1 }} today={JAN_15} />);

  expect(screen.getByText(/no cups logged yet/)).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('a day with cups is a filled cell carrying its date and count as text', () => {
  render(<MonthCalendar data={january({ 10: 2 })} today={JAN_15} />);

  expect(screen.getByText('Jan 10: 2 capsules')).toBeInTheDocument();
});

test('a past day with no cups is named none, not blank', () => {
  render(<MonthCalendar data={january({ 10: 2 })} today={JAN_15} />);

  expect(screen.getByText('Jan 11: none')).toBeInTheDocument();
});

test('the boundary day (at === today) renders as a real day, not blank', () => {
  // today is Jan 15; a cup on Jan 15 must render (today is inclusive, only at > today is blank).
  render(<MonthCalendar data={january({ 15: 1 })} today={JAN_15} />);

  expect(screen.getByText('Jan 15: 1 capsule')).toBeInTheDocument();
});

// A day that hasn't happened is not a skipped day: it renders blank even if it carries cups.
test('a future day is blank', () => {
  render(<MonthCalendar data={january({ 10: 2, 20: 3 })} today={JAN_15} />);

  expect(screen.queryByText(/Jan 20/)).not.toBeInTheDocument();
});

test('each month is its own table, newest first, with seven weekday columns', () => {
  const feb = { at: new Date(2026, 1, 1).getTime(), days: Array.from({ length: 29 }, () => 0) };
  const jan = { at: JAN_2026, days: Array.from({ length: 32 }, () => 0) };
  const data: MonthGrids = { months: [feb, jan], max: 1 };
  render(<MonthCalendar data={data} today={new Date(2026, 1, 20).getTime()} />);

  const tables = screen.getAllByRole('table');
  expect(tables).toHaveLength(2);
  expect(tables[0]?.querySelector('caption')?.textContent).toBe('February 2026');
  expect(screen.getByText('January 2026')).toBeInTheDocument();
  expect(screen.getAllByRole('columnheader')).toHaveLength(14); // 7 per table
});

// A single cup shaded against a busy month must still clear WCAG 1.4.11's 3:1 — the ramp starts at
// ACCENT_INK_FLOOR by construction, so the lightest possible non-zero cell is the one to check.
test('a single-cup day against a busy scale still clears the contrast floor', () => {
  const days = Array.from({ length: 32 }, () => 0);
  days[10] = 1;
  render(<MonthCalendar data={{ months: [{ at: JAN_2026, days }], max: 10 }} today={JAN_15} />);

  const swatch = screen
    .getByText('Jan 10: 1 capsule')
    .closest('td')
    ?.querySelector('[aria-hidden="true"]');
  const opacity = Number(/opacity:\s*([0-9.]+)/.exec(swatch?.getAttribute('style') ?? '')?.[1]);
  expect(opacity).toBeGreaterThanOrEqual(ACCENT_INK_FLOOR);
});
