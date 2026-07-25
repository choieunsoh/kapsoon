'use client';

import type { CupDay } from '../core/stats';
import { ACCENT_INK_FLOOR } from './chart-ink';

const dayShort = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

// The 30-day trend. CSS bars: a chart library would be ~90kB gzipped for flex and a percentage
// height. The chart is a list, not decoration — each bar carries a label so it is readable without
// sight. Bars are min-height 2px so a zero day still shows as a baseline tick rather than vanishing.
export function TrendChart({ series, average }: { series: CupDay[]; average: number }) {
  const max = Math.max(...series.map((day) => day.cups), 1);

  return (
    <div className="relative mt-4 h-28">
      {/* Named, because a list of 30 dated readings with no statement of what is being read is 30
          numbers and no question answered. MonthCalendar gets this from its <caption>; a <ul> has no
          equivalent element, so the name is an attribute. */}
      <ul
        aria-label={`Capsules per day, last ${series.length} days`}
        className="flex h-full items-end gap-[3px]"
      >
        {series.map((day, i) => (
          <li
            key={day.at}
            aria-label={`${dayShort.format(day.at)}: ${day.cups} capsules`}
            className="flex-1 rounded-sm bg-[var(--color-accent)]"
            style={{
              height: `${Math.max((day.cups / max) * 100, 2)}%`,
              // Today is the bar you're standing on — full strength, the rest recede. They recede
              // to ACCENT_INK_FLOOR, not below it: a bar is a graphical object carrying the whole
              // point of the chart, so 3:1 is a floor, not a target. 0.62 against 1.0 still reads
              // as a clear step (3.17:1 vs 6.44:1 — today is twice the contrast of any other day).
              opacity: i === series.length - 1 ? 1 : ACCENT_INK_FLOOR,
            }}
          />
        ))}
      </ul>

      {/* Average reference line — what turns 30 bars from "tallest vs rest" into "above or below
          normal". A recessive 1px SOLID hairline, not dashed (dashes read as a second data series);
          aria-hidden because the header already states the value as text. Skipped at zero, where it
          would just trace the baseline. */}
      {average > 0 ? (
        <span
          aria-hidden="true"
          data-testid="trend-average-line"
          className="pointer-events-none absolute inset-x-0 block border-t border-[var(--color-muted)]"
          style={{ bottom: `${(average / max) * 100}%` }}
        />
      ) : null}
    </div>
  );
}
