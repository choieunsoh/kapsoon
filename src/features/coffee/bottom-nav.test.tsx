import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { BottomNav } from './components/BottomNav';

// The dot is colour, so it can't be the only signal (WCAG 2.2 AA). What actually gets asserted is
// the accessible-name change it travels with: "More" becomes "More — backup overdue".
const noop = () => {};

test('an overdue backup relabels the More control', () => {
  render(
    <BottomNav tab="home" onTab={noop} onAdd={noop} onMore={noop} moreOpen={false} moreAlert />,
  );
  expect(screen.getByRole('button', { name: 'More — backup overdue' })).toBeInTheDocument();
});

test('a current backup leaves More unadorned', () => {
  render(
    <BottomNav
      tab="home"
      onTab={noop}
      onAdd={noop}
      onMore={noop}
      moreOpen={false}
      moreAlert={false}
    />,
  );
  expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'More — backup overdue' })).not.toBeInTheDocument();
});
