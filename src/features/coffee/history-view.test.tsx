import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { Movement } from './core/movement';
import { HistoryView } from './components/HistoryView';
import { formatMonthLabel, startOfDaysAgo } from './core/datetime';
import { coffeeWith } from '../../../test/coffee-fixture';

// History's job after the redesign is to stop rendering 597 identical drink rows. These tests pin
// the collapse, the things that must survive it (per-cup edit and delete), and the paging window.

function drink(daysAgo: number, hour: number, id = `d${daysAgo}-${hour}`): Movement {
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

function order(
  daysAgo: number,
  hour: number,
  quantity = 1,
  price = 100,
  id = `o${daysAgo}-${hour}`,
): Movement {
  return {
    id,
    shop: 'Test Shop',
    brand: 'Test Brand',
    beanName: 'Test Bean',
    delta: quantity,
    price,
    at: startOfDaysAgo(daysAgo) + hour * 3_600_000,
  };
}

// Newest-first, exactly as listMovements returns them.
function newestFirst(rows: Movement[]): Movement[] {
  return [...rows].sort((a, b) => b.at - a.at);
}

test('a day of drinks collapses into one row instead of one row per cup', () => {
  const movements = newestFirst([drink(1, 7), drink(1, 12), drink(1, 21)]);
  render(<HistoryView coffee={coffeeWith({ movements })} onAdd={vi.fn()} />);

  // The whole point: three cups, one row.
  expect(screen.getByText('3 capsules')).toBeInTheDocument();
  expect(screen.queryAllByText('Drank a coffee').length).toBe(0);
  expect(screen.getByText('07:00 – 21:00')).toBeInTheDocument();
});

test('expanding a collapsed day reveals each cup with its own delete control', async () => {
  const user = userEvent.setup();
  const movements = newestFirst([drink(1, 7), drink(1, 12)]);
  render(<HistoryView coffee={coffeeWith({ movements })} onAdd={vi.fn()} />);

  const summary = screen.getByRole('button', { expanded: false });
  await user.click(summary);

  // Collapsing is a display decision — no control may be lost by it.
  expect(screen.getAllByText('Drank a coffee').length).toBe(2);
  expect(screen.getAllByRole('button', { name: 'Delete entry' }).length).toBe(2);
  expect(screen.getByRole('button', { expanded: true })).toBe(summary);
});

test('a single cup states its time rather than an empty range', () => {
  render(<HistoryView coffee={coffeeWith({ movements: [drink(1, 9)] })} onAdd={vi.fn()} />);

  expect(screen.getByText('1 capsule')).toBeInTheDocument();
  expect(screen.getByText('09:00')).toBeInTheDocument();
  expect(screen.queryByText(/–/)).not.toBeInTheDocument();
});

test('the log pages rather than mounting every day at once', async () => {
  const user = userEvent.setup();
  // 40 days, one cup each — past the 30-day window.
  const movements = newestFirst(Array.from({ length: 40 }, (_, i) => drink(i + 1, 9, `d${i}`)));
  render(<HistoryView coffee={coffeeWith({ movements })} onAdd={vi.fn()} />);

  expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(30);
  const older = screen.getByRole('button', { name: /Show older/ });
  expect(older).toHaveTextContent('10 more days');

  await user.click(older);

  expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(40);
  expect(screen.queryByRole('button', { name: /Show older/ })).not.toBeInTheDocument();
});

test('changing the filter resets how far the log was paged', async () => {
  const user = userEvent.setup();
  // Without the effect that resets daysShown on [filter], paging to 40 on All, switching to
  // Orders, then back to All would remount every previously-paged day at once — exactly the
  // unbounded-mount problem this branch exists to eliminate.
  const movements = newestFirst(Array.from({ length: 40 }, (_, i) => drink(i + 1, 9, `d${i}`)));
  render(<HistoryView coffee={coffeeWith({ movements })} onAdd={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: /Show older/ }));
  expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(40);

  await user.click(screen.getByRole('radio', { name: 'Capsules' }));
  await user.click(screen.getByRole('radio', { name: 'All' }));

  expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(30);
  expect(screen.getByRole('button', { name: /Show older/ })).toBeInTheDocument();
});

test('says it is loading rather than claiming the history is empty', () => {
  // movements is [] both while OPFS is loading and when the app is genuinely empty. Rendering
  // nothing left the Header's "0 capsules" as the only thing on screen, which is a lie with 606
  // rows on disk.
  render(<HistoryView coffee={coffeeWith({ ready: false, movements: [] })} onAdd={vi.fn()} />);

  expect(screen.getByText(/Loading your history/)).toBeInTheDocument();
  expect(screen.queryByText(/Nothing logged yet/)).not.toBeInTheDocument();
});

test('the empty state offers the action that would fill it', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  render(<HistoryView coffee={coffeeWith({ ready: true, movements: [] })} onAdd={onAdd} />);

  // A dead end where HomeView offers a way out; and the sr-only heading must survive, or heading
  // navigation lands nowhere on this tab.
  expect(screen.getByRole('heading', { level: 2, name: 'History' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /add your first order/i }));

  expect(onAdd).toHaveBeenCalledOnce();
});

test('changing the filter returns the view to the top of the list', async () => {
  const user = userEvent.setup();
  // jsdom has no layout, so the scroll itself is unobservable — the call is the contract. Without
  // it, switching filters 25 screens down leaves you at the bottom of a now-shorter list with the
  // control you just pressed far off-screen.
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const movements = newestFirst(Array.from({ length: 40 }, (_, i) => drink(i + 1, 9, `d${i}`)));
  render(<HistoryView coffee={coffeeWith({ movements })} onAdd={vi.fn()} />);

  // The effect also runs on mount, which is harmless but would pollute the assertion.
  scrollTo.mockClear();

  await user.click(screen.getByRole('radio', { name: 'Capsules' }));

  expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  scrollTo.mockRestore();
});

test('each page of the log announces a changed message, not the same one twice', async () => {
  const user = userEvent.setup();
  // 100 days so three "Show older" taps are possible — a 40-day fixture can only ever be clicked
  // once and so cannot catch a message that stops changing (and therefore stops being announced)
  // on the second tap onward.
  const movements = newestFirst(Array.from({ length: 100 }, (_, i) => drink(i + 1, 9, `d${i}`)));
  render(<HistoryView coffee={coffeeWith({ movements })} onAdd={vi.fn()} />);

  expect(screen.getByRole('status')).toHaveTextContent('');

  await user.click(screen.getByRole('button', { name: /Show older/ }));
  expect(screen.getByRole('status')).toHaveTextContent('Showing 60 of 100 days');

  await user.click(screen.getByRole('button', { name: /Show older/ }));
  expect(screen.getByRole('status')).toHaveTextContent('Showing 90 of 100 days');
});

test('an expanded day names the list it controls, and a collapsed one points at nothing', async () => {
  const user = userEvent.setup();
  render(
    <HistoryView
      coffee={coffeeWith({ movements: newestFirst([drink(1, 7), drink(1, 12)]) })}
      onAdd={vi.fn()}
    />,
  );

  // The list is conditionally rendered, so advertising its id while collapsed leaves an IDREF
  // resolving to nothing on every row — 59 dangling references on a real 126-day ledger. Caught in
  // a browser, not by these tests, because the first version of this test only checked the
  // expanded case.
  const summary = screen.getByRole('button', { expanded: false });
  expect(summary).not.toHaveAttribute('aria-controls');

  await user.click(summary);

  const controlled = screen.getByRole('button', { expanded: true }).getAttribute('aria-controls');
  expect(controlled).toBeTruthy();
  expect(document.getElementById(controlled ?? '')).toBeInTheDocument();
});

test('the filter announces as one exclusive choice, not three toggles', async () => {
  const user = userEvent.setup();
  render(<HistoryView coffee={coffeeWith({ movements: [drink(1, 9)] })} onAdd={vi.fn()} />);

  const group = screen.getByRole('radiogroup', { name: 'Filter history' });
  expect(within(group).getAllByRole('radio').length).toBe(3);
  expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Capsules' })).not.toBeChecked();

  // Arrow keys move the selection, which is the whole reason the radio role is correct here.
  screen.getByRole('radio', { name: 'All' }).focus();
  await user.keyboard('{ArrowRight}');

  expect(screen.getByRole('radio', { name: 'Capsules' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'All' })).not.toBeChecked();
  // The handler resolves radios via a querySelectorAll on DOM order, not React state, so a passing
  // aria-checked assertion alone would not catch it drifting from where focus actually lands.
  expect(screen.getByRole('radio', { name: 'Capsules' })).toHaveFocus();

  // Backward wrap: from the first option, ArrowLeft must land on the last one, not do nothing.
  // A click, not a programmatic .focus(), because selection follows the `filter` state — the
  // previous ArrowRight already moved it to "Capsules", and only a click drives it back to "All".
  await user.click(screen.getByRole('radio', { name: 'All' }));
  await user.keyboard('{ArrowLeft}');

  expect(screen.getByRole('radio', { name: 'Orders' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Orders' })).toHaveFocus();
});

test('the log names its unit the way the rest of the app does, and binds each day to its date', async () => {
  const user = userEvent.setup();
  render(
    <HistoryView
      coffee={coffeeWith({ movements: newestFirst([drink(1, 7), drink(1, 12)]) })}
      onAdd={vi.fn()}
    />,
  );

  // "Drinks" was the app's only use of that noun; everything else counts capsules.
  expect(screen.getByRole('radio', { name: 'Capsules' })).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: 'Drinks' })).not.toBeInTheDocument();

  // Without the binding, TalkBack's controls list is ~30 buttons reading "2 capsules 07:00 – 12:00"
  // with no date anywhere — the <h3> supplies it in reading order only.
  const day = screen.getByRole('region', { name: 'Yesterday' });
  expect(within(day).getByRole('button', { expanded: false })).toBeInTheDocument();
  await user.click(within(day).getByRole('button', { expanded: false }));
  expect(within(day).getAllByText('Drank a coffee').length).toBe(2);
});

test('an empty Orders filter offers the action that would fill it', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  render(<HistoryView coffee={coffeeWith({ movements: [drink(1, 9)] })} onAdd={onAdd} />);

  await user.click(screen.getByRole('radio', { name: 'Orders' }));
  await user.click(screen.getByRole('button', { name: /No orders logged yet/i }));

  expect(onAdd).toHaveBeenCalledOnce();
});

test('an empty Capsules filter announces "capsules" not "drinks" to both visible and screen-reader users', async () => {
  // The filter tab was renamed to "Capsules" but the empty-state message still read "No drinks
  // logged yet." — reachable exactly when that filter matched nothing. The string feeds the sr-only
  // status region, so a screen-reader user heard the contradiction spoken aloud. This test pins both
  // the visible and announced text.
  const user = userEvent.setup();
  const movements = newestFirst([order(1, 9), order(0, 12)]);
  render(<HistoryView coffee={coffeeWith({ movements })} onAdd={vi.fn()} />);

  await user.click(screen.getByRole('radio', { name: 'Capsules' }));

  // Visible empty-state message (rendered as a paragraph, not sr-only) uses the same noun as the
  // filter tab.
  const visibleEmptyMessage = screen.getAllByText('No capsules logged yet.').find((el) => {
    return !el.classList.contains('sr-only');
  });
  expect(visibleEmptyMessage).toBeInTheDocument();

  // The sr-only status region announces the same text to assistive technology.
  expect(screen.getByRole('status')).toHaveTextContent('No capsules logged yet.');
});

test('a month change is the only landmark on a log this long, so it is marked', () => {
  // Two days either side of a month boundary. startOfDaysAgo walks calendar dates, so 45 days back
  // is reliably in a different month than yesterday regardless of when this test runs.
  const movements = newestFirst([drink(1, 9, 'recent'), drink(45, 9, 'older')]);
  render(<HistoryView coffee={coffeeWith({ movements })} onAdd={vi.fn()} />);

  const headings = screen.getAllByRole('heading', { level: 3 });
  expect(headings.length).toBe(2);

  // Exactly one band: above the older group, never above the first.
  const label = formatMonthLabel(startOfDaysAgo(45));
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.queryByText(formatMonthLabel(startOfDaysAgo(1)))).not.toBeInTheDocument();
});
