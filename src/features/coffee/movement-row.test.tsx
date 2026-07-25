import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { Movement } from './core/movement';
import { MovementRow } from './components/MovementRow';

// MovementRow is shared by Home's "Today" list and History's log, so every behaviour pinned here
// is pinned for both views at once.

function drinkRow(overrides: Partial<Movement> = {}): Movement {
  return {
    id: 'm1',
    shop: '',
    brand: '',
    beanName: '',
    delta: -1,
    price: 0,
    at: Date.UTC(2026, 6, 21, 9, 0),
    ...overrides,
  };
}

function orderRow(overrides: Partial<Movement> = {}): Movement {
  return drinkRow({
    id: 'o1',
    shop: 'Shopee',
    brand: 'Lavazza',
    beanName: 'Qualita Rossa',
    delta: 50,
    price: 62_000,
    ...overrides,
  });
}

test('the confirmation puts the benign action where the trash icon was', async () => {
  const user = userEvent.setup();
  render(
    <ul>
      <MovementRow movement={drinkRow()} onDelete={vi.fn()} onEditTime={vi.fn()} />
    </ul>,
  );

  await user.click(screen.getByRole('button', { name: 'Delete entry' }));

  // jsdom has no layout, so DOM order is the machine-checkable proxy for screen position: both
  // clusters are right-aligned in the same flex row, so the LAST child is the rightmost element.
  // Trash is last in the trigger cluster; Cancel must be last in the confirm cluster, or the
  // destructive affirmative sits on the pixels the trigger just vacated and a repeated tap deletes.
  const confirm = screen.getByRole('button', { name: 'Cancel' }).parentElement;
  expect(confirm).not.toBeNull();
  const buttons = within(confirm ?? document.body).getAllByRole('button');
  expect(buttons.map((b) => b.textContent)).toEqual(['Delete', 'Cancel']);
});

test('an armed row disarms when focus leaves it', async () => {
  const user = userEvent.setup();
  render(
    <>
      <ul>
        <MovementRow movement={drinkRow()} onDelete={vi.fn()} onEditTime={vi.fn()} />
      </ul>
      <button type="button">elsewhere</button>
    </>,
  );

  await user.click(screen.getByRole('button', { name: 'Delete entry' }));
  expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'elsewhere' }));

  // Left armed, a row scrolled past keeps a destructive control where a benign one is expected.
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete entry' })).toBeInTheDocument();
});

test('the surface fill marks an order, and a drink carries none', () => {
  // The one visual rule a log states once and applies everywhere: a filled rounded rectangle
  // in a log means "this is an order". 9 of 606 movements are orders and they are the reason to
  // open History, so the fill is the rank signal. Asserted on the class because a fill has no
  // behavioural surface — this is the contract, not an implementation detail.
  const { rerender } = render(
    <ul>
      <MovementRow movement={orderRow()} />
    </ul>,
  );
  expect(screen.getByRole('listitem').className).toContain('bg-[var(--color-surface)]');

  rerender(
    <ul>
      <MovementRow movement={drinkRow()} />
    </ul>,
  );
  expect(screen.getByRole('listitem').className).not.toContain('bg-[var(--color-surface)]');
});

test('a delete that fails says so instead of looking like it worked', async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn(() => Promise.reject(new Error('OPFS unavailable')));
  render(
    <ul>
      <MovementRow movement={drinkRow()} onDelete={onDelete} onEditTime={vi.fn()} />
    </ul>,
  );

  await user.click(screen.getByRole('button', { name: 'Delete entry' }));
  await user.click(screen.getByRole('button', { name: 'Delete' }));

  // The row is still on screen because the write failed. Without this, that is indistinguishable
  // from a successful delete of a row the list happened to re-render — the failure is silent.
  expect(await screen.findByText("That entry didn't delete.")).toBeInTheDocument();

  // A failed delete reaches both screen-reader users (via the live region above) and sighted users
  // (via this visible span). Asserting only the live region left the visible span unguarded.
  expect(screen.getByText("Didn't delete")).toBeInTheDocument();
});

test('cancelling after a failed delete clears the failure, so a later arm announces again', async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn(() => Promise.reject(new Error('OPFS unavailable')));
  render(
    <ul>
      <MovementRow movement={drinkRow()} onDelete={onDelete} onEditTime={vi.fn()} />
    </ul>,
  );

  // Arm, fail, then back out with Cancel instead of retrying.
  await user.click(screen.getByRole('button', { name: 'Delete entry' }));
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(await screen.findByText("That entry didn't delete.")).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  // The row disarmed back to the trash icon; the failure text must have gone with it. Left
  // standing, this text would pin the live region on "That entry didn't delete." forever — the
  // region only speaks again when its text CHANGES, and the next arm's own text is identical
  // whether or not this is cleared, so the check has to be on the visible span, not the region.
  expect(screen.queryByText("Didn't delete")).not.toBeInTheDocument();

  // The part that actually matters: re-arming after a cleared failure must announce the
  // confirmation again. Before the fix, `failed` stayed true past Cancel, the live region's
  // ternary checks `failed` before `confirming`, and its text never changed on re-arm — so this
  // announcement was silently lost for the rest of the row's life.
  await user.click(screen.getByRole('button', { name: 'Delete entry' }));
  expect(screen.getByText('Delete confirmation required.')).toBeInTheDocument();
});
