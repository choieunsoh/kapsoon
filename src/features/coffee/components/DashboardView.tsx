'use client';

import type { UseCoffee } from '../use-coffee';
import { formatSatang } from '../money';
import {
  averageCups,
  dailyCups,
  habitCost,
  monthGrids,
  orderCadence,
  spendByMonth,
  type MonthSpend,
} from '../stats';
import { ACCENT_INK_FLOOR } from './chart-ink';
import { MonthCalendar } from './MonthCalendar';
import { TrendChart } from './TrendChart';

const number = new Intl.NumberFormat('en-US');
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const dayShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' });

const WINDOW_DAYS = 30;
const SPEND_MONTHS = 6;

// Dashboard: the zoomed-out view. Home answers "now" — what's left, what today looks like, what this
// month has cost. This answers "over time": am I drinking more than I was, what is the habit costing
// me, and when do I actually drink. Nothing Home already states appears here as a raw figure; only
// change over time does.
//
// Three blocks, not five cards. The trend is drawn unboxed, directly on the page, and that absence
// of card chrome is what makes it read as the hero rather than the first of N equal rectangles —
// PRODUCT.md names stacked equal-weight rounded rectangles as the failure mode this app is closest
// to. Every figure comes from the pure stats module; this file only formats and lays out.
export function DashboardView({ coffee }: { coffee: UseCoffee }) {
  const { movements } = coffee;

  // A dashboard of zeros teaches nothing and looks broken. One honest line until there's data.
  if (movements.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] bg-[var(--color-surface)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
        Log a few cups and your stats will show up here.
      </p>
    );
  }

  // One call covers both windows: the last 30 entries are what's drawn, the first 30 are what it's
  // compared against. This is not the only pass over `movements` — habitCost below calls dailyCups
  // again on its own — it's just the one call that would otherwise have been duplicated for nothing.
  const both = dailyCups(movements, WINDOW_DAYS * 2);
  const series = both.slice(WINDOW_DAYS);
  const average = averageCups(series);
  const previous = averageCups(both.slice(0, WINDOW_DAYS));

  // These all read the clock (period boundaries, and orderCadence's default `now`). That is safe
  // here only because `movements` is [] on the server AND on the client's first render — use-coffee
  // loads in a mount effect — so both passes take the early return above and never reach this line.
  // The same reasoning is why HomeView can call consumptionPerDay in render. If that ever changes,
  // this is where a hydration mismatch appears.
  const cost = habitCost(movements, WINDOW_DAYS);
  const spend = spendByMonth(movements, SPEND_MONTHS);
  const cadence = orderCadence(movements);
  const calendar = monthGrids(movements);

  const first = series[0];
  const last = series[series.length - 1];

  return (
    <section className="flex flex-col gap-7">
      {/* 1 — The trend. Unboxed: this is the hero. */}
      <div>
        {/* The other two blocks carry a visible h2; this one deliberately doesn't, because card
            chrome and a label are exactly what would demote it to the first of three equal
            sections. Visually that works — but it also left the most important block on the page
            outside the heading outline, so heading navigation jumped from "Kapsoon" straight to
            "What it costs" and skipped the hero entirely. sr-only restores the outline and changes
            nothing on screen. */}
        <h2 className="sr-only">How much you drink</h2>
        <p className="flex items-baseline gap-2">
          <span data-testid="trend-average" className="tnum text-[32px] font-semibold leading-none">
            {average > 0 ? oneDecimal.format(average) : '—'}
          </span>
          <span className="text-[var(--color-muted)]">capsules a day</span>
        </p>

        {/* Home prints an unlabelled 14-day pace on the runway line; this prints a 30-day one, and on
            a real log the two disagree. An unlabelled figure here would read as proof one of the two
            screens is wrong rather than as two different windows, so the window is named on every
            line that carries a rate — the comparison, when there is one, rides in the same sentence
            rather than repeating "30 days" a second time. Comparison suppression is unchanged: still
            no delta against an empty previous window, still no "same as" line when nothing changed. */}
        {average === 0 ? (
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            no capsules logged in the last {WINDOW_DAYS} days
          </p>
        ) : (
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            over the last {WINDOW_DAYS} days
            {previous > 0 && average !== previous
              ? ` · ${average < previous ? 'down' : 'up'} from ${oneDecimal.format(previous)} before that`
              : ''}
          </p>
        )}

        <TrendChart series={series} average={average} />

        {/* Whole row hidden, not just the middle span: every point on the chart already has its date
            and count read out elsewhere, so this row is visual scaffolding, not new information. The
            two bare endpoint labels are the least useful half of it on their own — exposed without
            "line is the average" they'd read as two orphan dates with nothing to explain them. */}
        <p
          className="mt-2 flex justify-between text-xs text-[var(--color-muted)]"
          aria-hidden="true"
        >
          <span>{first ? dayShort.format(first.at) : ''}</span>
          <span>line is the average</span>
          <span>{last ? dayShort.format(last.at) : ''}</span>
        </p>
      </div>

      {/* 2 — What it costs. */}
      <div className="border-t border-[var(--color-border)] pt-6">
        <h2 className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]">
          What it costs
        </h2>

        {cost ? (
          <>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="tnum text-[30px] font-semibold leading-none">
                {formatSatang(cost.perCapsule)}
              </span>
              <span className="text-[var(--color-muted)]">a capsule</span>
            </p>

            {/* No rate means no run-cost line at all, rather than a line of zeros. The price above
                stands on its own — it's still true — and the caption drops the half of itself that
                would be describing a figure that isn't there. */}
            {cost.rate ? (
              <>
                <p className="tnum mt-1.5 text-sm text-[var(--color-muted)]">
                  about{' '}
                  <span className="font-semibold text-[var(--color-text)]">
                    {formatSatang(cost.rate.perDay)}
                  </span>{' '}
                  a day ·{' '}
                  <span className="font-semibold text-[var(--color-text)]">
                    {formatSatang(cost.rate.perMonth)}
                  </span>{' '}
                  a month
                </p>

                {/* The price and the rate use different windows on purpose; saying so is what keeps
                    the three figures from looking like they fail to reconcile. */}
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  price all-time · rate over the last {WINDOW_DAYS} days
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-[var(--color-muted)]">price all-time</p>
            )}

            <SpendBars spend={spend} />

            <dl className="mt-4">
              {cost.cheapestShop ? (
                <div className="flex items-baseline justify-between border-t border-[var(--color-border)] py-2.5">
                  <dt className="text-sm text-[var(--color-muted)]">Cheapest at</dt>
                  <dd className="font-semibold">{cost.cheapestShop}</dd>
                </div>
              ) : null}
              {cadence ? (
                <div className="flex items-baseline justify-between border-t border-[var(--color-border)] py-2.5">
                  <dt className="text-sm text-[var(--color-muted)]">You order</dt>
                  <dd className="tnum">
                    {cadence.medianGapDays !== null ? (
                      <span className="font-semibold">
                        every ~{number.format(cadence.medianGapDays)} days
                      </span>
                    ) : null}
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      last one {number.format(cadence.daysSinceLast)}d ago
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          </>
        ) : (
          <>
            <p className="mt-2 text-[30px] font-semibold leading-none">—</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">no orders logged yet</p>
          </>
        )}
      </div>

      {/* 3 — When you drink. */}
      <div className="border-t border-[var(--color-border)] pt-6">
        <h2 className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]">
          When you drink
        </h2>
        <MonthCalendar data={calendar} />
      </div>
    </section>
  );
}

// Actual cash per calendar month — the lumpy reality behind the smooth rate above. Each bar carries
// its month and amount as a label, so the series is readable without sight; a zero month keeps a 2px
// baseline tick rather than vanishing, matching the trend chart.
function SpendBars({ spend }: { spend: MonthSpend[] }) {
  const max = Math.max(...spend.map((m) => m.satang), 1);

  return (
    <>
      {/* The caption moves ABOVE the bars now that every column carries its own month underneath.
          Below, it had to share a line with the two endpoint labels, which is what forced the
          series to be read from its ends inward. */}
      <p className="mt-4 text-xs text-[var(--color-muted)]">actually spent, by month</p>
      {/* Height is a rank decision AND a legibility one. Spend is context, not the hero, so this
          stays visibly under the 30-day trend's h-28 — but at the h-10 it started as, the encoding
          stopped working: a ฿1,259 month rendered 7px against a ฿0 month's 1px, so "how much less"
          was unanswerable on a chart read to answer exactly that. h-20 keeps the subordination and
          gives the range back.
          The baseline is what makes a zero month legible. The 2% floor renders ~2px, and with a
          radius on every corner a ฿0.00 month came out as a floating rounded dash that read as a
          divider rather than as nothing. Rounding only the top edge sits every bar flat on a shared
          axis, and the hairline gives that axis somewhere to be: a zero is visibly ON the line
          rather than adrift above it. The floor itself stays — without it the height computes to
          NaN% on an all-zero window and the whole row disappears. */}
      <ul
        aria-label="Spent by month"
        className="mt-1.5 flex h-20 items-end gap-1.5 border-b border-[var(--color-border)]"
      >
        {spend.map((month) => (
          <li
            key={month.at}
            aria-label={`${monthShort.format(month.at)}: ${formatSatang(month.satang)}`}
            className="flex-1 rounded-t-[2px] bg-[var(--color-accent)]"
            // opacity-50 here was 2.47:1 against the page — below WCAG 1.4.11's 3:1 for a bar that
            // carries the series. Same floor as every other accent mark on the dashboard.
            style={{
              height: `${Math.max((month.satang / max) * 100, 2)}%`,
              opacity: ACCENT_INK_FLOOR,
            }}
          />
        ))}
      </ul>
      {/* A month under every bar, not just the two ends. Endpoint labels only date the series; they
          leave the four bars between them unidentified, so "which month was the big one?" — the
          question a spend series is read to answer — could not be answered from the chart at all.
          Same flex geometry as the bar row above, so each label tracks its own bar's width.
          aria-hidden because every bar's own label already announces its month AND its amount;
          repeating the months alone would just add six unanchored words. */}
      <ul aria-hidden="true" className="mt-1.5 flex gap-1.5" data-testid="spend-months">
        {spend.map((month) => (
          <li key={month.at} className="flex-1 text-center text-[10px] text-[var(--color-muted)]">
            {monthShort.format(month.at)}
          </li>
        ))}
      </ul>
    </>
  );
}
