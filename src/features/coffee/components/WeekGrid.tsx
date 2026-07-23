'use client';

import type { WeekGrid as Grid } from '../stats';
import { ACCENT_INK_FLOOR } from './chart-ink';

// Row order matches WeekGrid.cells: night, morning, afternoon, evening.
const BANDS = ['night', 'morning', 'afternoon', 'evening'] as const;
// Column order matches WeekGrid.cells: Monday-first.
const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
const INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

// When you drink, as a real TABLE rather than a picture: colour carries the value visually, but the
// count is also present as text in every cell (sr-only) with the swatch itself aria-hidden, so a
// screen reader sees a table of numbers. That satisfies 1.1.1 (text alternative for non-text content)
// and 1.3.1 (info conveyed structurally, not only visually) — NOT 1.4.1, which governs colour never
// being the sole *visual* means of conveying information; an sr-only span isn't a visual means, so it
// can't be what keeps a visual encoding within 1.4.1.
//
// This block exists for pattern recognition ("mornings are the habit"), not for reading exact
// figures — those stay in text, for anyone who needs them. So the visual ramp only has to be legible
// as a pattern, but "legible" still means WCAG 1.4.11's 3:1 for a graphical object carrying meaning.
// The ramp starts at ACCENT_INK_FLOOR — the opacity a single capsule composites to against
// --color-bg — and climbs to 1, so every non-zero cell clears 3:1 by construction, not just the cell
// that was measured. That constant used to live here; it now lives in chart-ink.ts because the trend
// and spend bars need the same floor and, not seeing it, had drifted to a failing 0.5.

export function WeekGrid({ grid }: { grid: Grid }) {
  return (
    // table-fixed, NOT the browser default of auto. Under auto layout each column sizes to its own
    // content, and the widest content in a header cell is the sr-only full day name — so Wednesday
    // came out 54.7px against Friday's 32.8px, a 67% difference tracking how the weekday is SPELLED.
    // In a chart, width reads as quantity: the widest column was not the busiest one (Wed 15 cups vs
    // Mon 17), so the layout was quietly asserting something false. Fixed layout makes every day the
    // same width, leaving colour as the only thing that varies — which is the only thing that means
    // anything here.
    <table className="mt-3 w-full table-fixed border-separate border-spacing-1">
      <caption className="sr-only">Capsules by weekday and time of day, last 30 days</caption>
      <thead>
        <tr>
          <td className="w-14" />
          {DAYS.map((day, i) => (
            <th key={day} scope="col" className="text-[10px] font-normal text-[var(--color-muted)]">
              <span aria-hidden="true">{INITIALS[i]}</span>
              <span className="sr-only">{day}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {BANDS.map((band, b) => (
          <tr key={band}>
            <th scope="row" className="text-left text-[10px] font-normal text-[var(--color-muted)]">
              {band}
            </th>
            {DAYS.map((day, d) => {
              const cups = grid.cells[b]?.[d] ?? 0;
              return (
                <td key={day} className="p-0">
                  <span className="sr-only">{cups}</span>
                  {cups === 0 ? (
                    // Empty is a positive state, not a faint one: an outline reads as "no cell filled
                    // in" at a glance, where a near-invisible fill just read as "same as the page".
                    // Which only holds if the outline is actually visible — border-strong was
                    // 1.77:1, below the same 3:1 the filled cells are held to. An unfilled cell has
                    // no fill to carry it, so the outline is the whole graphic; --color-border-graphic
                    // is the ramp rung that clears the bar.
                    <span
                      aria-hidden="true"
                      className="block h-5 rounded-sm border border-[var(--color-border-graphic)]"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="block h-5 rounded-sm bg-[var(--color-accent)]"
                      style={{
                        opacity: ACCENT_INK_FLOOR + (cups / grid.max) * (1 - ACCENT_INK_FLOOR),
                      }}
                    />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
