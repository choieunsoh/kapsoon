import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { DARK_INK_FROM, MonthCalendar, SHADES } from './components/MonthCalendar';
import type { MonthGrids } from './stats';

const JAN_2026 = new Date(2026, 0, 1).getTime();
const FEB_2026 = new Date(2026, 1, 1).getTime();
const JAN_15 = new Date(2026, 0, 15).getTime(); // a fixed, injected "today" (local midnight)
const FEB_20 = new Date(2026, 1, 20).getTime();

// A single January grid with cups on specific days. days is 1-indexed; index 0 is unused.
function january(cupsByDay: Record<number, number>): MonthGrids {
  const days = Array.from({ length: 32 }, () => 0);
  for (const [d, cups] of Object.entries(cupsByDay)) days[Number(d)] = cups;
  return { months: [{ at: JAN_2026, days }], max: Math.max(...Object.values(cupsByDay), 1) };
}

// February (newest) then January, matching monthGrids' newest-first contract.
function twoMonths(): MonthGrids {
  return {
    months: [
      { at: FEB_2026, days: Array.from({ length: 29 }, () => 0) },
      { at: JAN_2026, days: Array.from({ length: 32 }, () => 0) },
    ],
    max: 1,
  };
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

test('one month is shown at a time, with seven weekday columns', () => {
  render(<MonthCalendar data={twoMonths()} today={FEB_20} />);

  expect(screen.getAllByRole('table')).toHaveLength(1);
  expect(screen.getAllByRole('columnheader')).toHaveLength(7);
});

// months[0] is the newest month, so "opens on the current month" is an initial-state guarantee that
// needs no clock read of its own.
test('it opens on the current month', () => {
  render(<MonthCalendar data={twoMonths()} today={FEB_20} />);

  expect(screen.getByText('February 2026')).toBeInTheDocument();
  expect(screen.queryByText('January 2026')).not.toBeInTheDocument();
});

test('the previous-month button steps back through the log', async () => {
  const user = userEvent.setup();
  render(<MonthCalendar data={twoMonths()} today={FEB_20} />);

  await user.click(screen.getByRole('button', { name: 'Previous month' }));

  expect(screen.getByText('January 2026')).toBeInTheDocument();
  expect(screen.queryByText('February 2026')).not.toBeInTheDocument();
});

test('the next-month button returns to the current month', async () => {
  const user = userEvent.setup();
  render(<MonthCalendar data={twoMonths()} today={FEB_20} />);

  await user.click(screen.getByRole('button', { name: 'Previous month' }));
  await user.click(screen.getByRole('button', { name: 'Next month' }));

  expect(screen.getByText('February 2026')).toBeInTheDocument();
});

// The log is finite in both directions: there is no month after the current one and none before the
// first cup, and a disabled button says so rather than silently doing nothing.
test('stepping is disabled at both ends of the log', async () => {
  const user = userEvent.setup();
  render(<MonthCalendar data={twoMonths()} today={FEB_20} />);

  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled();

  await user.click(screen.getByRole('button', { name: 'Previous month' }));

  expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
});

// Without this the buttons keep their static labels and a screen reader is never told which month it
// landed on.
test('the visible month label is a live region', () => {
  render(<MonthCalendar data={twoMonths()} today={FEB_20} />);

  expect(screen.getByText('February 2026')).toHaveAttribute('aria-live', 'polite');
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

test('a count past the end of the ramp clamps to the brightest rung', () => {
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
// it against NEITHER ink, so this is also what stops anyone "smoothing" the 62→85 gap.
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

// The ramp must stay monotonically brighter as the count climbs — that direction IS the encoding.
test('the ramp brightens monotonically as the capsule count rises', () => {
  for (let cups = 2; cups < SHADES.length; cups++) {
    expect(luminance(mixed(SHADES[cups] ?? 0))).toBeGreaterThan(
      luminance(mixed(SHADES[cups - 1] ?? 0)),
    );
  }
});
