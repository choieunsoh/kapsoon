import { vi } from 'vitest';
import type { UseCoffee } from '@features/coffee/use-coffee';

// One UseCoffee stub for both view test files. Extracted on the second consumer rather than the
// third: the shape is wide enough that two copies drift the moment one gains a field, and a stub
// that silently lags the real type is worse than no stub — every test built on it passes against
// an interface the app no longer has.
export function coffeeWith(overrides: Partial<UseCoffee>): UseCoffee {
  return {
    ready: true,
    movements: [],
    stock: 0,
    blend: null,
    consumedToday: 0,
    consumedWeek: 0,
    consumedMonth: 0,
    spentMonth: 0,
    backup: { overdue: false, daysSince: null },
    drink: vi.fn(async () => {}),
    addOrder: vi.fn(async () => {}),
    removeMovement: vi.fn(async () => {}),
    editMovementTime: vi.fn(async () => {}),
    editOrder: vi.fn(async () => {}),
    restore: vi.fn(async () => 0),
    noteBackup: vi.fn(async () => {}),
    ...overrides,
  } satisfies UseCoffee;
}
