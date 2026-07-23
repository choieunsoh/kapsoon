import { expect, test } from 'vitest';
import { OVERDUE_DAYS, backupStatus } from './backup';

const MS_PER_DAY = 86_400_000;
const NOW = 1_700_000_000_000;

test('never backed up is overdue only when there is data to lose', () => {
  expect(backupStatus(null, NOW, 0)).toEqual({ overdue: false, daysSince: null });
  expect(backupStatus(null, NOW, 5)).toEqual({ overdue: true, daysSince: null });
});

test('a fresh backup is not overdue', () => {
  expect(backupStatus(NOW, NOW, 5)).toEqual({ overdue: false, daysSince: 0 });
});

test('overdue only strictly past OVERDUE_DAYS, not at the boundary', () => {
  const atBoundary = NOW - OVERDUE_DAYS * MS_PER_DAY;
  expect(backupStatus(atBoundary, NOW, 5)).toEqual({ overdue: false, daysSince: OVERDUE_DAYS });

  const pastBoundary = NOW - (OVERDUE_DAYS + 1) * MS_PER_DAY;
  expect(backupStatus(pastBoundary, NOW, 5)).toEqual({
    overdue: true,
    daysSince: OVERDUE_DAYS + 1,
  });
});

test('a backwards clock floors daysSince at zero and is not overdue', () => {
  expect(backupStatus(NOW + MS_PER_DAY, NOW, 5)).toEqual({ overdue: false, daysSince: 0 });
});

test('no data is never overdue even with an ancient backup', () => {
  const ancient = NOW - 365 * MS_PER_DAY;
  expect(backupStatus(ancient, NOW, 0)).toEqual({ overdue: false, daysSince: 365 });
});
