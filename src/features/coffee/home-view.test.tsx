import { render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { Movement } from './core/movement';
import { HomeView } from './components/HomeView';
import { coffeeWith } from '../../../test/coffee-fixture';

// Home's stock line is the one place the app volunteers a conclusion rather than a recorded figure,
// so its states are worth pinning: quiet when the runway is healthy, urgent when it isn't, honest
// ("no idea yet") when there's nothing to extrapolate from, and silent about all three until the
// database has actually answered. The pace maths itself is covered by consumptionPerDay in
// coffee.test.ts; this covers what the user actually reads.

const DAY = 86_400_000;

// Four drinks across the last two days — consumptionPerDay clamps the divisor to the two days of
// history that exist, so the pace is a round 2 cups/day and days-left is just stock / 2.
function recentDrinks(now: number): Movement[] {
  return [0.2, 0.8, 1.2, 2].map((daysAgo, i) => ({
    id: `d${i}`,
    shop: '',
    brand: '',
    beanName: '',
    delta: -1,
    price: 0,
    at: now - daysAgo * DAY,
  }));
}

test('a healthy stash leads with the count and stays quiet', () => {
  const now = Date.now();
  // 20 capsules at 2/day = 10 days.
  render(
    <HomeView coffee={coffeeWith({ stock: 20, movements: recentDrinks(now) })} onAdd={() => {}} />,
  );

  // The count is the hero; the runway it implies supports it. Asserting BOTH figures and which one
  // carries the unit label is what keeps this from passing if the two are ever swapped back.
  expect(screen.getByText('20')).toBeInTheDocument();
  expect(screen.getByText('capsules left')).toBeInTheDocument();
  expect(screen.getByText(/10 days left · 2 a day/)).toBeInTheDocument();
  // The runway must NOT be the hero numeral — 10 appears only inside the supporting sentence.
  expect(screen.queryByText('10')).not.toBeInTheDocument();
  // Nothing to act on yet, so the page doesn't grow a second way to add an order.
  expect(screen.queryByRole('button', { name: 'Add an order' })).not.toBeInTheDocument();
});

test('a short runway switches wording and offers the action it implies', () => {
  const now = Date.now();
  // 6 capsules at 2/day = 3 days, under the 4-day reorder threshold.
  render(
    <HomeView coffee={coffeeWith({ stock: 6, movements: recentDrinks(now) })} onAdd={() => {}} />,
  );

  // Colour is never the only signal — the wording changes too, which is what this asserts.
  expect(screen.getByText(/time to reorder/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add an order' })).toBeInTheDocument();
});

test('out of stock blocks logging without dropping the orb out of the tab order', () => {
  const now = Date.now();
  const drink = vi.fn(async () => {});
  render(
    <HomeView
      coffee={coffeeWith({ stock: 0, movements: recentDrinks(now), drink })}
      onAdd={() => {}}
    />,
  );

  expect(screen.getByText(/Out of capsules/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add an order' })).toBeInTheDocument();

  // aria-disabled, not the disabled attribute: a disabled button is unfocusable, so a keyboard or
  // switch user would never reach the primary control or hear why it won't fire.
  const orb = screen.getByRole('button', { name: 'Log a capsule' });
  expect(orb).toHaveAttribute('aria-disabled', 'true');
  expect(orb).not.toBeDisabled();
  orb.click();
  expect(drink).not.toHaveBeenCalled();
});

test('with nothing consumed yet it admits it cannot project', () => {
  render(<HomeView coffee={coffeeWith({ stock: 30, movements: [] })} onAdd={() => {}} />);

  expect(screen.getByText(/estimate how long they last/)).toBeInTheDocument();
  expect(screen.queryByText(/days left/)).not.toBeInTheDocument();
});

// consumptionPerDay returns null when nothing was consumed IN THE WINDOW, not only when nothing was
// ever logged, so the null branch used to show first-run copy to long-standing users.
test('a lapsed user is told the window is empty, not told to start logging', () => {
  const now = Date.now();
  const old = recentDrinks(now - 60 * DAY);
  render(<HomeView coffee={coffeeWith({ stock: 30, movements: old })} onAdd={() => {}} />);

  expect(screen.getByText(/No cups in the last 14 days/)).toBeInTheDocument();
  // The line no longer repeats the capsule count — that is the hero directly above it now.
  expect(screen.queryByText(/30 capsules left ·/)).not.toBeInTheDocument();
  expect(screen.queryByText(/estimate how long they last/)).not.toBeInTheDocument();
});

test('tapping the orb logs exactly one cup', () => {
  const now = Date.now();
  const drink = vi.fn(async () => {});
  render(
    <HomeView
      coffee={coffeeWith({ stock: 20, movements: recentDrinks(now), drink })}
      onAdd={() => {}}
    />,
  );

  screen.getByRole('button', { name: 'Log a capsule' }).click();
  expect(drink).toHaveBeenCalledTimes(1);
});

// aria-label replaces the button's subtree for the accessible name, so the count inside the orb is
// announced nowhere. Folding it into the label doesn't work either — mutating the label of a focused
// button isn't reliably spoken — so a separate live region carries it.
test('the count the orb hides from the accessible name is announced in a status region', () => {
  const now = Date.now();
  render(
    <HomeView
      coffee={coffeeWith({ stock: 20, movements: recentDrinks(now), consumedToday: 3 })}
      onAdd={() => {}}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('3 logged today');
});

// The ring fires on the press, so a rejected write is otherwise indistinguishable from a good one:
// the only symptom is a count that quietly doesn't move.
test('a failed write says so instead of looking like a success', async () => {
  const now = Date.now();
  const drink = vi.fn(async () => {
    throw new Error('OPFS gone');
  });
  render(
    <HomeView
      coffee={coffeeWith({ stock: 20, movements: recentDrinks(now), drink })}
      onAdd={() => {}}
    />,
  );

  screen.getByRole('button', { name: 'Log a capsule' }).click();
  await waitFor(() => expect(screen.getByText(/didn’t save/)).toBeInTheDocument());
});

// The orb fills with today's cups: 5 is full, and a heavy day tops out rather than overflowing.
// Asserted on the transform because that IS the visual — a wrong sign or a missing clamp would
// push the fill off the disc entirely, and nothing else on the page would show it.
test.each([
  [0, 'translateY(100%)'],
  [1, 'translateY(80%)'],
  [3, 'translateY(40%)'],
  [5, 'translateY(0%)'],
  [9, 'translateY(0%)'],
])('%i cups today fills the orb to %s', (consumedToday, expected) => {
  const now = Date.now();
  render(
    <HomeView
      coffee={coffeeWith({ stock: 20, movements: recentDrinks(now), consumedToday })}
      onAdd={() => {}}
    />,
  );

  expect(screen.getByTestId('orb-fill')).toHaveStyle({ transform: expected });
});

// The blocked orb is a flat cold disc with no fill at all — an empty orb and a blocked orb must not
// be the same thing, since a legitimately empty one is what every morning starts with.
test('a blocked orb has no fill layer', () => {
  render(<HomeView coffee={coffeeWith({ ready: false })} onAdd={() => {}} />);

  expect(screen.queryByTestId('orb-fill')).not.toBeInTheDocument();
});

// Before OPFS answers, every figure is a placeholder zero. Reading those as real once made the
// launch frame of every session assert the user had run out of coffee — the precise failure the
// product exists to prevent — and disable the primary action while saying it.
test('while loading it shows placeholders rather than a false empty stash', () => {
  render(<HomeView coffee={coffeeWith({ ready: false })} onAdd={() => {}} />);

  expect(screen.queryByText(/Out of capsules/)).not.toBeInTheDocument();
  expect(screen.queryByText(/add your first order/)).not.toBeInTheDocument();
  expect(screen.queryByText(/estimate how long they last/)).not.toBeInTheDocument();
  expect(screen.getByText(/Checking your stash/)).toBeInTheDocument();
});
