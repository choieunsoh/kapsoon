import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SettingsView } from './components/SettingsView';
import { coffeeWith } from '../../../test/coffee-fixture';

// The nudge is the whole point of the feature: it must appear, with the right wording, exactly when
// a backup is overdue — and stay silent otherwise. Colour is not asserted (it carries no info the
// wording doesn't); the wording is.

test('an overdue backup shows how long it has been', async () => {
  render(<SettingsView coffee={coffeeWith({ backup: { overdue: true, daysSince: 20 } })} />);
  expect(await screen.findByText(/Last backed up 20 days ago/)).toBeInTheDocument();
});

test('never having backed up says so', async () => {
  render(<SettingsView coffee={coffeeWith({ backup: { overdue: true, daysSince: null } })} />);
  expect(await screen.findByText(/haven’t backed up yet/)).toBeInTheDocument();
});

test('a current backup shows no nudge', () => {
  render(<SettingsView coffee={coffeeWith({ backup: { overdue: false, daysSince: 3 } })} />);
  expect(screen.queryByText(/backed up/)).not.toBeInTheDocument();
});
