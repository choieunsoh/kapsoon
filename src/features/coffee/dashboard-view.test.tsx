import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { Movement } from './db';
import { ACCENT_INK_FLOOR } from './components/chart-ink';
import { DashboardView } from './components/DashboardView';
import { startOfDaysAgo } from './datetime';
import { formatSatang } from './money';
import { averageCups, dailyCups } from './stats';
import { coffeeWith } from '../../../test/coffee-fixture';

// Mirrors TrendChart's own date formatter exactly — the assertions below build the same aria-label
// strings the component builds, rather than a looser regex, so a wording change in either place would
// show up as a mismatch instead of a silently-still-passing test.
const dayShort = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

// Home answers "now"; this page answers "over time". These tests pin the figures it volunteers and,
// just as importantly, the ones it stays silent about — a dashboard that fills every slot with a
// zero or a delta from nothing is the failure this redesign exists to remove.

function drink(daysAgo: number, hour = 9, id = `d${daysAgo}-${hour}`): Movement {
  return {
    id,
    shop: '',
    brand: '',
    beanName: '',
    delta: -1,
    price: 0,
    at: startOfDaysAgo(daysAgo) + hour * 3_600_000,
  };
}

// Orders sit at exactly local midnight, NOT at an hour offset. daysSinceLast floors
// (now - at) / 86_400_000, so an order at 10:00 N days ago reads as N-1 whenever the test runs
// before 10:00 — a test that passes all afternoon and fails every morning. From midnight the
// difference is always N days plus however far into today it is, which always floors to N.
function order(daysAgo: number, price: number, shop = 'Tops'): Movement {
  return {
    id: `o${daysAgo}`,
    shop,
    brand: '',
    beanName: '',
    delta: 30,
    price,
    at: startOfDaysAgo(daysAgo),
  };
}

// Two capsules a day for the last 30 days, and none before that.
function steadyDrinker(): Movement[] {
  const rows: Movement[] = [];
  for (let d = 0; d < 30; d++) {
    rows.push(drink(d, 9, `a${d}`), drink(d, 15, `b${d}`));
  }
  return rows;
}

// steadyDrinker() plus four extra drinks today, so the chart's peak (today, 6 cups) sits above its
// average — the trivial fixture where every day is equal would make average === max and the
// reference-line assertion pass at 100% regardless of whether the underlying formula is right.
function drinkerWithPeak(): Movement[] {
  return [
    ...steadyDrinker(),
    drink(0, 11, 'peak-a'),
    drink(0, 13, 'peak-b'),
    drink(0, 17, 'peak-c'),
    drink(0, 19, 'peak-d'),
  ];
}

// Two a day except a skipped day partway through the window — a real zero-cup day for the trend
// chart's minimum-height case, distinct from the "day 0 of 30" edge that a shorter fixture would
// only exercise at the boundary.
function drinkerWithGap(): Movement[] {
  const rows: Movement[] = [];
  for (let d = 0; d < 30; d++) {
    if (d === 5) continue;
    rows.push(drink(d, 9, `g${d}a`), drink(d, 15, `g${d}b`));
  }
  return rows;
}

test('an empty log says so once rather than showing a page of zeros', () => {
  render(<DashboardView coffee={coffeeWith({ movements: [] })} />);

  expect(screen.getByText(/Log a few cups/)).toBeInTheDocument();
  expect(screen.queryByText(/a capsule/)).not.toBeInTheDocument();
});

// Queried by test id, not by text: the grid renders a count in all 28 cells, so getByText('2')
// would be matching the hero against a field of loose integers and could resolve to a cell.
test('the hero leads with the daily rate over the window', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.getByTestId('trend-average')).toHaveTextContent('2');
  expect(screen.getByText(/capsules a day/)).toBeInTheDocument();
});

// A delta from nothing is not information — the same rule that keeps percentages off a zero
// baseline. A new user must not be told they are "up from 0". The window label itself still renders
// ("over the last 30 days") — only the comparison clause is what a fresh log has nothing to say.
test('with no history before the window the comparison line is omitted', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.getByText(/over the last 30 days/)).toBeInTheDocument();
  expect(screen.queryByText(/before that/)).not.toBeInTheDocument();
});

test('with history on both sides it states the direction of the change', () => {
  const rows = steadyDrinker();
  // Four a day across the PREVIOUS 30 days, against two a day in the current window.
  for (let d = 30; d < 60; d++) {
    for (let c = 0; c < 4; c++) rows.push(drink(d, 9, `p${d}-${c}`));
  }
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  expect(screen.getByText(/over the last 30 days · down from 4 before that/)).toBeInTheDocument();
});

// An unchanged habit must not be told it went "up": at equality `average < previous` is false, so a
// bare `previous > 0` guard falls through to "up from 2 before that" — a false statement. Queries
// `before that` rather than `up`/`down` so a reworded line can't slip past this the way the missing
// `average !== previous` half did. The window label still renders on its own at equality.
test('with the same average on both sides of the window the comparison line is omitted', () => {
  const rows: Movement[] = [];
  for (let d = 0; d < 60; d++) rows.push(drink(d, 9, `s${d}a`), drink(d, 15, `s${d}b`));
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  expect(screen.getByText(/over the last 30 days/)).toBeInTheDocument();
  expect(screen.queryByText(/before that/)).not.toBeInTheDocument();
});

// Home prints an unlabelled 14-day pace; this prints a 30-day one, and the two disagree on real
// data. The window must be named whenever a rate is shown, not just when there happens to be a
// comparison — this is the line that would go missing if only the comparison branch got a label.
test('the window is named whenever a rate is shown, even with no comparison to make', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.getByText(/over the last 30 days/)).toBeInTheDocument();
});

test('the cost section states all three figures and both windows', () => {
  // ฿20.00 a capsule; two a day gives ฿40.00 a day and ฿1,200.00 a month.
  const rows = [order(0, 60_000), ...steadyDrinker()];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  expect(screen.getByText(/a capsule/)).toBeInTheDocument();
  expect(screen.getByText(/฿40\.00/)).toBeInTheDocument();
  expect(screen.getByText(/฿1,200\.00/)).toBeInTheDocument();
  expect(screen.getByText(/price all-time · rate over the last 30 days/)).toBeInTheDocument();
});

test('with no orders the cost section admits it rather than printing zero', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.getByText(/no orders logged yet/)).toBeInTheDocument();
  expect(screen.queryByText(/฿0\.00/)).not.toBeInTheDocument();
});

test('a single order reports days since it without inventing a cadence', () => {
  const rows = [order(12, 60_000), ...steadyDrinker()];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  expect(screen.getByText(/12d ago/)).toBeInTheDocument();
  expect(screen.queryByText(/every ~/)).not.toBeInTheDocument();
});

test('two orders report the gap between them', () => {
  const rows = [order(2, 60_000), order(23, 60_000), ...steadyDrinker()];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  expect(screen.getByText(/every ~21 days/)).toBeInTheDocument();
});

// The calendar carries each day's count as colour, so every count must also be readable as text or
// the block is inaccessible by construction. steadyDrinker() drinks two a day, so at least one
// "...: 2 capsules" label must be present, inside a month table.
test('the calendar renders month tables that carry each day count as text', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
  // 7 weekday column headers per month table.
  expect(screen.getAllByRole('columnheader').length % 7).toBe(0);
  expect(screen.getAllByText(/: 2 capsules/).length).toBeGreaterThan(0);
});

// TrendChart had zero coverage: every existing test rendered it but asserted only on
// data-testid="trend-average", which lives in DashboardView, not the chart. Replacing the chart's
// body with `return null` left the full suite green. These three pin what the chart actually draws.
test('the trend chart renders one labelled bar per day in the window', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  const bars = screen.getAllByLabelText(/^[A-Za-z]{3}, [A-Za-z]{3} \d{1,2}: \d+ capsules$/);
  expect(bars).toHaveLength(30);
});

test('the average reference line sits at the height the average implies', () => {
  const rows = drinkerWithPeak();
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  // Same formula the component uses, computed independently from the same pure stats functions it
  // calls — not a hardcoded percentage, so this fails if either side's arithmetic changes alone.
  const series = dailyCups(rows, 30);
  const average = averageCups(series);
  const max = Math.max(...series.map((day) => day.cups), 1);

  expect(screen.getByTestId('trend-average-line')).toHaveStyle({
    bottom: `${(average / max) * 100}%`,
  });
});

test('a zero-cup day still renders a bar at the 2% minimum height', () => {
  const rows = drinkerWithGap();
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  const series = dailyCups(rows, 30);
  const zeroDay = series.find((day) => day.cups === 0);
  if (zeroDay === undefined) throw new Error('fixture must contain a zero-cup day');

  const label = `${dayShort.format(zeroDay.at)}: 0 capsules`;
  expect(screen.getByLabelText(label)).toHaveStyle({ height: '2%' });
});

// A page that logged cups but never an order still has a trend and a calendar to show; only the cost
// block should degrade.
test('a log with no orders still renders the trend and the calendar', () => {
  render(<DashboardView coffee={coffeeWith({ movements: steadyDrinker() })} />);

  expect(screen.getByText(/capsules a day/)).toBeInTheDocument();
  expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
});

// The order predates the 6-month spend window (SPEND_MONTHS) but is still priced all-time, so `cost`
// is non-null while `spend` is six zero-satang months — the exact split that starves
// `Math.max(...spend.map(...))` of a nonzero input. Without the `, 1` floor that's `Math.max()` on an
// all-zero array, every bar's height computes as NaN%, and the row renders with no visible bars.
test('a spend window with no priced order in it still renders bars instead of vanishing', () => {
  const rows = [order(300, 60_000), ...steadyDrinker()];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  // Scoped by the ฿ in each spend bar's aria-label: getAllByRole('listitem') would also catch the
  // 30 unrelated TrendChart day-bars rendered above it in the same page.
  const bars = screen.getAllByLabelText(/฿/);
  expect(bars.length).toBeGreaterThan(0);
  for (const bar of bars) expect(bar).toHaveStyle({ height: '2%' });
});

// The cost block degrades to the one fact it still knows. It keeps the per-capsule price — that is
// still true — and drops the run-cost line rather than printing it as zeros, along with the half of
// the caption that would be describing the figure that is no longer there.
test('an order with no cups in the window prints the price without a rate of zeros', () => {
  // One 30-capsule order at ฿600.00 — ฿20.00 a capsule — and not a single cup logged since.
  const rows = [order(0, 60_000)];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  expect(screen.getByText(formatSatang(2_000))).toBeInTheDocument();
  expect(screen.queryByText(/a day ·/)).not.toBeInTheDocument();
  expect(screen.getByText('price all-time')).toBeInTheDocument();
});

// WCAG 2.2 1.4.11: a bar carrying the series is a graphical object and needs 3:1 against the page.
// --color-accent over --color-bg reaches 3:1 at ACCENT_INK_FLOOR (0.62) and sits at 2.47:1 at the
// 0.5 both bar charts used before. The failure was drift, not ignorance — the floor was derived once
// inside the weekday grid and the two sibling charts never saw it — so the check is on every accent mark
// this view draws, not on the one that happened to be wrong.
test('every recessive accent bar is drawn at or above the 3:1 contrast floor', () => {
  // Pinned, not just referenced: asserting bars match the constant would still pass if the constant
  // itself were lowered, which is the other half of the same failure.
  expect(ACCENT_INK_FLOOR).toBeGreaterThanOrEqual(0.62);

  const rows = [order(0, 60_000), ...steadyDrinker()];
  render(<DashboardView coffee={coffeeWith({ movements: rows })} />);

  // Day bars ("Mon, Jan 5: 2 capsules") and month bars ("Jan: ฿120.00") alike.
  const bars = screen.getAllByLabelText(/capsules$|฿/);
  expect(bars.length).toBeGreaterThan(30);

  for (const bar of bars) {
    // Today's bar is the one deliberate exception: full strength, well past the floor.
    const opacity = Number(bar.style.opacity);
    expect(opacity).toBeGreaterThanOrEqual(ACCENT_INK_FLOOR);
  }
});
