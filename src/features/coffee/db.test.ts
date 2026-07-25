import { expect, test } from 'vitest';
import { updateOrder } from './db';

// OPFS + the SQLite worker are browser-only and don't run under jsdom, so the real DB round-trip is
// covered by the offline Playwright check. What IS assertable here is that the write path still
// runs core's guards before it touches getDb() — the rest of the pure logic is tested in ./core.

// updateOrder touches OPFS, so only its guards are unit-testable here — they run before getDb().
test('updateOrder rejects a non-positive/fractional quantity and a float price', async () => {
  await expect(updateOrder('id', 'Shopee', '', '', 0, 45000)).rejects.toThrow();
  await expect(updateOrder('id', 'Shopee', '', '', 2.5, 45000)).rejects.toThrow();
  await expect(updateOrder('id', 'Shopee', '', '', 10, 12.5)).rejects.toThrow();
  await expect(updateOrder('id', 'Shopee', '', '', 10, -1)).rejects.toThrow();
});
