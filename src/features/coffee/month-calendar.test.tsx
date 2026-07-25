import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { DARK_INK_FROM, MonthCalendar, SHADES } from './components/MonthCalendar';
import type { MonthGrids } from './stats';

const JAN_2026 = new Date(2026, 0, 1).getTime();
const JAN_15 = new Date(2026, 0, 15).getTime(); // a fixed, injected "today" (local midnight)

// A single January grid with cups on specific days. days is 1-indexed; index 0 is unused.
function january(cupsByDay: Record<number, number>): MonthGrids {
  const days = Array.from({ length: 32 }, () => 0);
  for (const [d, cups] of Object.entries(cupsByDay)) days[Number(d)] = cups;
  return { months: [{ at: JAN_2026, days }], max: Math.max(...Object.values(cupsByDay), 1) };
}

// The filled/outlined square a day renders, found via the sr-only label that names it.
function swatchFor(label: string): Element | null | undefined {
  return screen.getByText(label).closest('td')?.querySelector('[aria-hidden="true"]');
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

// The count is now PRINTED in the cell, not just announced. This is the whole reason the fill was
// allowed to drop below ACCENT_INK_FLOOR, so it is the assertion that keeps that trade honest.
test('a day with cups prints its capsule count in the cell', () => {
  render(<MonthCalendar data={january({ 10: 3 })} today={JAN_15} />);

  expect(swatchFor('Jan 10: 3 capsules')?.textContent).toBe('3');
});

test('a past day with no cups is named none, not blank', () => {
  render(<MonthCalendar data={january({ 10: 2 })} today={JAN_15} />);

  expect(screen.getByText('Jan 11: none')).toBeInTheDocument();
});

// Printing a 0 on every quiet day would make "no coffee" the loudest thing in the grid.
test('a past day with no cups prints no digit', () => {
  render(<MonthCalendar data={january({ 10: 2 })} today={JAN_15} />);

  expect(swatchFor('Jan 11: none')?.textContent).toBe('');
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

// The strip opens on the current month with no scroll restoration: months[0] is the newest month and
// a fresh scroll container sits at offset 0, so "current month first" is a DOM-order guarantee.
test('the months strip is a focusable group whose first slide is the newest month', () => {
  const feb = { at: new Date(2026, 1, 1).getTime(), days: Array.from({ length: 29 }, () => 0) };
  const jan = { at: JAN_2026, days: Array.from({ length: 32 }, () => 0) };
  render(
    <MonthCalendar data={{ months: [feb, jan], max: 1 }} today={new Date(2026, 1, 20).getTime()} />,
  );

  const strip = screen.getByRole('group', { name: /scroll sideways to change month/i });
  // WCAG 2.1.1: a scroll container the keyboard cannot reach hides every older month from it.
  expect(strip).toHaveAttribute('tabindex', '0');
  expect(strip.firstElementChild?.querySelector('caption')?.textContent).toBe('February 2026');
});

// Shading is ABSOLUTE, not relative to the busiest day: the same count must be the same colour in
// every month, or the printed digit and the fill would disagree with each other.
test('the same capsule count is the same shade regardless of the busiest day', () => {
  const quiet = render(<MonthCalendar data={{ ...january({ 10: 2 }), max: 2 }} today={JAN_15} />);
  const quietMonth = swatchFor('Jan 10: 2 capsules')?.getAttribute('style');
  quiet.unmount();

  render(<MonthCalendar data={{ ...january({ 10: 2, 12: 9 }), max: 9 }} today={JAN_15} />);
  const busyMonth = swatchFor('Jan 10: 2 capsules')?.getAttribute('style');

  expect(quietMonth).toBe(busyMonth);
});

test('a count past the end of the ramp clamps to the darkest rung', () => {
  const five = render(<MonthCalendar data={january({ 10: 5 })} today={JAN_15} />);
  const atRamp = swatchFor('Jan 10: 5 capsules')?.getAttribute('style');
  five.unmount();

  render(<MonthCalendar data={january({ 10: 42 })} today={JAN_15} />);

  expect(swatchFor('Jan 10: 42 capsules')?.getAttribute('style')).toBe(atRamp);
});

// ── The contrast proof ────────────────────────────────────────────────────────
// SHADES is not a taste call, so it does not get to be checked by eye. Every rung composites
// --color-accent over --color-bg, and the digit sitting on it must clear WCAG 2.2 1.4.3's 4.5:1
// against whichever ink DARK_INK_FROM selects. The band between luminance 0.1495 and 0.2055 clears
// it against NEITHER ink, so this is also what stops anyone "smoothing" the 85→62 gap.
const ACCENT = [199, 138, 74]; // #c78a4a
const BG = [16, 17, 20]; // #101114
const ON_ACCENT = [26, 18, 6]; // #1a1206
const TEXT = [236, 237, 241]; // #ecedf1

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((c) => toLinear(c / 255));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

// color-mix(in srgb, accent P%, bg) — the exact compositing the cell's backgroundColor performs.
function mixed(percent: number): number[] {
  const f = percent / 100;
  return ACCENT.map((c, i) => c * f + (BG[i] ?? 0) * (1 - f));
}

test('every shade rung clears 4.5:1 against the ink it selects', () => {
  for (let cups = 1; cups < SHADES.length; cups++) {
    const mix = SHADES[cups] ?? 0;
    const ink = mix >= DARK_INK_FROM ? ON_ACCENT : TEXT;
    expect(contrast(mixed(mix), ink), `${cups} capsules (mix ${mix}%)`).toBeGreaterThanOrEqual(4.5);
  }
});

// The ramp must stay monotonically darker as the count climbs — that direction IS the encoding.
test('the ramp darkens monotonically as the capsule count rises', () => {
  for (let cups = 2; cups < SHADES.length; cups++) {
    expect(luminance(mixed(SHADES[cups] ?? 0))).toBeLessThan(
      luminance(mixed(SHADES[cups - 1] ?? 0)),
    );
  }
});
