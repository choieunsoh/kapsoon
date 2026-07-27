'use client';

import { useState } from 'react';
import type { UseCoffee } from '../use-coffee';
import { consumptionPerDay } from '../core/movement';
import { formatDaysFromNow, startOfDaysAgo, startOfMonth, startOfToday } from '../core/datetime';
import { formatSatang } from '../core/money';
import { MovementRow } from './MovementRow';

const number = new Intl.NumberFormat('en-US');
// Pace is a derived estimate, not a ledger figure — one decimal is as precise as it deserves.
const rate = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

// How far back the pace estimate looks. Two weeks smooths out a heavy weekend without lagging so
// far behind that a genuine change in habit takes a month to show up in the runway.
const PACE_WINDOW_DAYS = 14;
// Below this the runway stops being background information and starts being the thing to act on.
const REORDER_AT_DAYS = 4;
// Cups that fill the orb. Fixed rather than tracking the 14-day pace: a denominator that drifts
// means the same level stands for a different count each week, and the point is a glanceable
// analogue of the numeral sitting on top of it. Five is roughly a normal day here, so a normal day
// ends near the brim. Nothing marks the brim as good — no colour shift, no flourish — and past five
// it clamps silently. Drinking coffee is not an achievement (PRODUCT.md).
const DAILY_FULL_CUPS = 5;
// A figure and its unit are one token; a line break between them reads as two facts.
const NBSP = ' ';

// Home: how long the stash lasts, a big tap-to-log counter, the supporting figures, and today's log.
// Ranked deliberately — the orb is the product, everything else is reference.
export function HomeView({ coffee, onAdd }: { coffee: UseCoffee; onAdd: () => void }) {
  const {
    ready,
    stock,
    blend,
    consumedToday,
    consumedWeek,
    consumedMonth,
    spentMonth,
    movements,
    drink,
    removeMovement,
  } = coffee;
  // Bumped on every logged cup to retrigger the tap feedback. Derived state can't do this: logging a
  // second cup in the same minute changes the count, but logging one that replaces a deleted row
  // might not, and the ring should fire on the tap regardless.
  const [pulse, setPulse] = useState(0);
  // A rejected write must not look like a successful one. The ring fires on the press, so without
  // this the only symptom of a failed log is a count that quietly doesn't move.
  const [failed, setFailed] = useState(false);

  // Both gated on `ready`: before OPFS answers, every figure here is a placeholder zero, and
  // treating that as "out of stock" is what made the launch frame lie.
  const outOfStock = ready && stock <= 0;
  const blocked = !ready || outOfStock;

  const monthStart = startOfMonth();
  const ordersThisMonth = movements.filter((m) => m.delta > 0 && m.at >= monthStart).length;
  // Today only — rows show just HH:mm, so scoping to one local day keeps them unambiguous. No cap:
  // a single day is a handful of rows, and truncating would hide cups you just logged.
  const todayStart = startOfToday();
  const today = movements.filter((m) => m.at >= todayStart);

  // Reading the clock in render is safe here only because `movements` is [] on the server AND on the
  // client's first render (use-coffee loads in a mount effect), so both passes produce null.
  const perDay = consumptionPerDay(movements, startOfDaysAgo(PACE_WINDOW_DAYS - 1), Date.now());
  // Round down: a runway that under-promises by a day is useful, one that over-promises isn't.
  const daysLeft =
    ready && perDay !== null && perDay > 0 && stock > 0
      ? Math.max(1, Math.floor(stock / perDay))
      : null;
  const reorderSoon = daysLeft !== null && daysLeft <= REORDER_AT_DAYS;

  // The stock count is the hero. Design Principle 2 argues for the projection over the raw figure,
  // and the runway still leads the supporting line directly beneath — but the capsule count is the
  // thing the owner actually reaches for, and it is the one figure that is always true: the runway
  // silently disappears whenever there's no pace to project from. Making it the hero also removes
  // the old dual-mode hero, which showed days or capsules depending on a condition the reader
  // couldn't see.
  const hero = !ready ? '—' : number.format(stock);
  const heroUnit = !ready ? '' : stock === 1 ? 'capsule left' : 'capsules left';

  // "10 days left (Aug 6)". A count of days is the answer to "should I reorder?"; the date is the
  // answer to "does that land before the trip?" — cheap to add here, and neither replaces the other.
  const daysLine =
    daysLeft === null
      ? ''
      : `${number.format(daysLeft)}${NBSP}${daysLeft === 1 ? 'day' : 'days'} left (${formatDaysFromNow(daysLeft)})`;

  // Escalates only when there's something to act on — a healthy runway stays quiet, so the warning
  // still means something when it appears. Colour is never the only signal: the wording changes too.
  const status = failed
    ? 'That cup didn’t save — tap again.'
    : !ready
      ? 'Checking your stash…'
      : outOfStock
        ? 'Out of capsules — add an order to keep logging.'
        : daysLeft !== null
          ? reorderSoon
            ? `${daysLine} — time to reorder`
            : `${daysLine} · ${rate.format(perDay ?? 0)} a day`
          : movements.length > 0
            ? // consumptionPerDay returns null when nothing was consumed IN THE WINDOW, not only
              // when nothing was ever logged — so a two-year user who skips a fortnight must not be
              // told to start logging. The capsule count is the hero now, so this no longer repeats
              // it.
              `No cups in the last ${PACE_WINDOW_DAYS} days`
            : 'Log a few cups and this will estimate how long they last.';

  const escalated = failed || outOfStock || reorderSoon;

  // Redundant with the numeral by design: it carries no information a screen reader would lose, so
  // the whole fill is aria-hidden. Clamped, so a heavy day tops out rather than overflowing.
  const level = Math.min(consumedToday / DAILY_FULL_CUPS, 1);

  return (
    <section className="flex flex-col gap-10">
      {/* State and its action are one unit; the figures and the log below are reference. A uniform
          gap asserted they were all the same rank, so the two ranks now differ. */}
      <div className="flex flex-col gap-6">
        <div>
          <p className="flex items-baseline gap-2">
            <span className="tnum text-[32px] font-semibold leading-none">{hero}</span>
            <span className="text-[var(--color-muted)]">{heroUnit}</span>
          </p>

          {/* Live only while escalated. The healthy wording carries the pace figure, which moves on
              every logged cup, so an always-on region re-reads the whole sentence on each tap; the
              escalated wording drops the pace and changes only when the runway or the state does. */}
          <p
            aria-live={escalated ? 'polite' : undefined}
            className={`mt-1 text-sm ${
              failed || outOfStock
                ? 'font-medium text-[var(--color-danger)]'
                : reorderSoon
                  ? 'font-medium text-[var(--color-accent)]'
                  : 'text-[var(--color-muted)]'
            }`}
          >
            {status}
          </p>

          {blend ? (
            // min-w-0 + break-words: a long brand + bean name is user data with no length contract,
            // and this is the narrowest text on the page.
            <p className="mt-1 min-w-0 break-words text-xs text-[var(--color-faint)]">
              {[blend.brand, blend.beanName].filter(Boolean).join(' · ')}
            </p>
          ) : null}

          {/* The warning implies an action, so it carries one. Only rendered while it's the useful
              next step — otherwise the ＋ in the bottom nav is the single way in. */}
          {(reorderSoon || outOfStock) && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-3 text-sm font-medium text-[var(--color-text)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Add an order
            </button>
          )}
        </div>

        {/* Big tap target — logs one cup. The orb is a deep coffee brown: --color-accent darkened
            toward --color-on-accent (itself a warm near-black), so it stays warm rather than picking
            up the blue cast of --color-bg, and a reskin still flows through from the accent token.
            It keeps the page's largest AREA — Principle 1, logging dominates — while the runway
            above keeps the largest TYPE, which is the question the app is opened with.
            Blocked uses aria-disabled, not the disabled attribute: `disabled` drops the control out
            of the tab order, so a keyboard or switch user never reaches the primary action or any
            explanation of why it won't fire. The fill moves to --color-surface-2 rather than
            --color-surface (1.06:1 against the page — a 224px control that is simply not there) and
            the ring to --color-border-strong, so the disc stays perceivable while clearly inert. */}
        <button
          type="button"
          onClick={() => {
            if (blocked) return;
            setFailed(false);
            setPulse((p) => p + 1);
            // Catching is the point: an OPFS write can fail silently if cross-origin isolation is
            // lost, and `void` here made that indistinguishable from success.
            drink().catch(() => setFailed(true));
          }}
          aria-disabled={blocked}
          aria-label="Log a capsule"
          className={`relative mx-auto grid size-56 place-items-center rounded-full transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] ${
            blocked
              ? 'bg-[var(--color-surface-2)] ring-1 ring-inset ring-[var(--color-border-strong)]'
              : 'bg-[color-mix(in_oklab,var(--color-accent)_18%,var(--color-on-accent))] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-accent)_45%,var(--color-on-accent))] active:scale-[0.97]'
          }`}
        >
          {/* Today's cups as a level. The clip lives on this wrapper, NOT on the button: the tap
              ring animates out to scale(1.16), so overflow-hidden on the button would eat it.
              The fill is a full-size layer translated down rather than a height change — transform
              is compositor-friendly, and scaling would stretch the gradient instead of moving it.
              Empty is a deep espresso, warm where the blocked disc is cold grey, so the two never
              read as each other on the morning the count is legitimately zero. */}
          {!blocked ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
            >
              <span
                className="absolute inset-0 transition-transform duration-[400ms] ease-[var(--ease-out)]"
                style={{ transform: `translateY(${(1 - level) * 100}%)` }}
                data-testid="orb-fill"
              >
                {/* Nested so the two motions don't fight: the parent owns the level (an inline
                    transform), this owns the slosh (a keyframe). One element can't animate a
                    property it also sets inline. Keyed on pulse so a second tap restarts it.
                    Over-sized sideways and below because the slosh tilts — at inset-0 a 1.4deg
                    rotation would lift a bottom corner off the clip edge and show a sliver of
                    espresso where the liquid should reach the rim. */}
                <span
                  key={pulse}
                  className="orb-liquid absolute inset-x-[-8%] bottom-[-10%] top-0 bg-[radial-gradient(circle_at_50%_38%,color-mix(in_oklab,var(--color-accent)_70%,var(--color-on-accent)),color-mix(in_oklab,var(--color-accent)_32%,var(--color-on-accent)))] motion-safe:animate-[orb-slosh_700ms_var(--ease-out)]"
                />
              </span>
            </span>
          ) : null}
          {/* One ring per tap, keyed so a rapid second tap restarts it. Purely confirmatory — the
              count is the real feedback, this just says the press landed. */}
          {pulse > 0 ? (
            <span
              key={pulse}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full opacity-0 ring-2 ring-[var(--color-accent)] motion-safe:animate-[orb-ping_520ms_var(--ease-out)]"
            />
          ) : null}

          {/* relative, so the count paints above the fill layer rather than under it. */}
          <span className="relative flex flex-col items-center">
            <span
              key={pulse}
              // 72px is ~32% of the 224px disc, which fills it. PRODUCT.md pulls two ways here:
              // Principle 2 prefers the projection over the raw figure, which argues for the runway
              // leading, but Principle 1 says logging is the product and should dominate the screen.
              // Principle 1 wins: the orb is the thing the app is opened to do, and a count that
              // shrinks to defer to a number above it stops looking like the point of the page.
              // The runway keeps 44px — still a promotion from the 28px raw stock it replaced.
              className="tnum text-7xl font-bold leading-none motion-safe:animate-[count-pop_220ms_var(--ease-out)]"
            >
              {ready ? number.format(consumedToday) : '—'}
            </span>
            {/* Warm off-white, not --color-muted: that token is a cold blue-grey tuned for the dark
                surface, and on the brown orb it both clashes and drops under a readable contrast.
                The blocked orb is a neutral surface again, so --color-muted is correct there. */}
            <span
              className={`mt-2 text-sm ${
                blocked
                  ? 'text-[var(--color-muted)]'
                  : 'text-[color-mix(in_oklab,var(--color-text)_82%,var(--color-accent))]'
              }`}
            >
              {!ready ? 'loading…' : outOfStock ? 'add stock to drink' : 'capsules today'}
            </span>
          </span>
        </button>

        {/* aria-label REPLACES the button's subtree for the accessible name, so the count inside is
            announced nowhere. Folding it into the label doesn't work either: mutating the label of
            an already-focused button is not reliably spoken by TalkBack or NVDA, so tapping the
            app's primary control announced nothing at all. A separate status region is an actual
            text change in a live region, which is. */}
        <p className="sr-only" role="status">
          {ready ? `${number.format(consumedToday)} logged today` : ''}
        </p>
      </div>

      {/* Supporting figures. One surface block split by hairlines rather than separate filled cards
          — they're one thought (how much, over what period, at what cost), and a stack of equal
          rounded rectangles was the page's flattest moment. Cup counts share a two-way split; money
          gets its own full-width row because a currency string needs ~90px at 360px wide and a
          three-way split leaves it 80px. Splitting by unit fixes the crowding and reads better.
          Labels name the unit: an unlabelled integer directly above a baht figure is genuinely
          ambiguous at a glance, and it dropped the duplicated "This month" stem for free. */}
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)]">
        <div className="grid grid-cols-2 divide-x divide-[var(--color-border)]">
          {/* "Capsules", not "Cups": the rest of the app counts capsules ("162 capsules left",
              "capsules today", "Log a capsule"), and a second word for the same unit is the kind of
              inconsistency that makes a reader stop and check whether it means something different. */}
          <Figure label="Capsules this week" value={ready ? number.format(consumedWeek) : '—'} />
          <Figure label="Capsules this month" value={ready ? number.format(consumedMonth) : '—'} />
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3">
          <span className="text-sm text-[var(--color-muted)]">Spent this month</span>
          <span className="tnum whitespace-nowrap font-semibold">
            {ready ? formatSatang(spentMonth) : '—'}
            {/* --color-muted, not --color-faint: faint measures 4.4:1 on --color-surface, just under
                AA's 4.5 for small text. Size and weight already rank this below the amount. */}
            <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
              {number.format(ordersThisMonth)} {ordersThisMonth === 1 ? 'order' : 'orders'}
            </span>
          </span>
        </div>
      </div>

      {/* Today's activity — older days live in History */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">Today</h2>
        {today.length > 0 ? (
          // No container fill: `today` filters on time alone (see `today` above), so it includes
          // orders as well as drinks — and MovementRow already fills an order row with
          // --color-surface to mark it as one. A filled container behind that row would cancel the
          // row's own fill and erase the signal in exactly the view meant to make it coherent.
          // Hairlines alone separate the rows, the same treatment History's log uses.
          <ul className="divide-y divide-[var(--color-border)]">
            {today.map((m) => (
              // Delete lives here, not only in History: a 224px target held one-handed mid-brew
              // guarantees the occasional double-log, and that is the app's most likely error.
              // Fixing it used to cost four taps and a context switch, on a screen already showing
              // the offending row. MovementRow already ships the confirm step.
              <MovementRow key={m.id} movement={m} onDelete={removeMovement} />
            ))}
          </ul>
        ) : !ready ? null : movements.length > 0 ? (
          // Logged before, just nothing yet today — a quiet note, not a first-run call to action.
          // Dashed border, no fill: a filled note here would sit right below the now-unfilled list
          // and read as a leftover container rather than a message, and History uses the same
          // dashed-border treatment for its own "filter matched nothing" note.
          <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">
            Nothing logged today yet.
          </p>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className="w-full rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-6 text-sm text-[var(--color-muted)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            No coffee yet — add your first order.
          </button>
        )}
      </div>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-3.5 text-center">
      <span className="text-xs text-[var(--color-muted)]">{label}</span>
      <span className="tnum text-lg font-semibold">{value}</span>
    </div>
  );
}
