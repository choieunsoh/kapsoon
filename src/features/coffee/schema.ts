import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// One row per stock movement. `delta` is a signed cup count:
//   delta > 0  → an order that fills stock (bought `delta` capsules of `brand`/`beanName` at
//                `shop` for `price` satang)
//   delta < 0  → coffee consumed (the one-click "Drink" is always -1; shop/brand/bean = '', price 0)
// Current stock is the running sum of `delta` — no separate balance column to keep in sync.
// `price` is the order's TOTAL cost in integer satang (never a float).
export const movements = sqliteTable('movements', {
  id: text('id').primaryKey(),
  shop: text('shop').notNull(),
  brand: text('brand').notNull(),
  beanName: text('bean_name').notNull(),
  delta: integer('delta').notNull(),
  price: integer('price').notNull(),
  at: integer('at').notNull(),
});
