'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  buildDayEntries,
  matchesFilter,
  type DayEntry,
  type HistoryFilter,
  type Movement,
} from '../db';
import type { UseCoffee } from '../use-coffee';
import { formatDayLabel, formatMonthLabel, formatTime, groupByDay, isSameMonth } from '../datetime';
import { AddOrderSheet } from './AddOrderSheet';
import { EditTimeDialog } from './EditTimeDialog';
import { ChevronDownIcon } from './icons';
import { MovementRow } from './MovementRow';

const number = new Intl.NumberFormat('en-US');

// How many day groups render at once, and how many more each "Show older" tap adds. The log is
// unbounded — a real device already holds 606 movements across 127 days, which mounted 9,044 DOM
// nodes and made the page 53 screens tall.
const DAYS_PER_PAGE = 30;

// The filter's options in DOM order. Arrow-key navigation needs the order as data, not as three
// hand-written JSX elements.
// "Capsules", not "Drinks": the rest of the app counts capsules ("162 capsules left", "Capsules this
// week", "6 capsules"), and a second word for the same unit makes a reader stop to check whether it
// means something different. The `value` stays `drinks` — that is the HistoryFilter member in db.ts,
// and renaming a type member to fix a label would be a migration for no gain.
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'drinks', label: 'Capsules' },
  { value: 'orders', label: 'Orders' },
] as const satisfies readonly { value: HistoryFilter; label: string }[];

// History: the log grouped by day, with a day's drinks collapsed into one expandable row.
export function HistoryView({ coffee, onAdd }: { coffee: UseCoffee; onAdd: () => void }) {
  const { ready, movements, removeMovement, editMovementTime, editOrder } = coffee;
  const [editing, setEditing] = useState<Movement | null>(null);
  const [editingOrder, setEditingOrder] = useState<Movement | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [daysShown, setDaysShown] = useState(DAYS_PER_PAGE);
  const [pageMessage, setPageMessage] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);

  // A radiogroup owes its user arrow-key navigation; the roles alone would announce a control that
  // does not behave the way it says it does. Selection follows focus, which is the expected
  // behaviour for a radiogroup whose options are cheap to apply.
  function onFilterKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !back) return;
    event.preventDefault();

    const current = FILTERS.findIndex((f) => f.value === filter);
    const nextIndex = (current + (forward ? 1 : -1) + FILTERS.length) % FILTERS.length;
    const next = FILTERS[nextIndex];
    if (!next) return;

    setFilter(next.value);
    const radios = filterRef.current?.querySelectorAll('[role="radio"]');
    const target = radios?.[nextIndex];
    if (target instanceof HTMLElement) target.focus();
  }

  const visible = useMemo(
    () => movements.filter((m) => matchesFilter(m, filter)),
    [movements, filter],
  );
  const groups = useMemo(() => groupByDay(visible), [visible]);

  // Narrowing the log resets the window AND the scroll position. Without the reset, switching from
  // a filter you had paged deep into leaves you 90 days down a list that is now 3 days long;
  // without the scroll, the shorter list simply strands you at its bottom, far from the control you
  // just pressed. Firing on mount is intentional — the view is already at the top, and a tab
  // switch away and back should land there too.
  useEffect(() => {
    setDaysShown(DAYS_PER_PAGE);
    setPageMessage('');
    window.scrollTo({ top: 0 });
  }, [filter]);

  // A drink has exactly one editable field, so it routes to the time dialog. An order opens the
  // full sheet; its time stays with the clock icon, same as a drink's.
  function openEditor(m: Movement) {
    if (m.delta > 0) setEditingOrder(m);
    else setEditing(m);
  }

  const shown = groups.slice(0, daysShown);
  const hiddenDays = groups.length - shown.length;

  // Computed once so the visible copy and the persistent status region cannot drift apart.
  const emptyMessage = filter === 'drinks' ? 'No capsules logged yet.' : 'No orders logged yet.';

  // `ready`/`movements.length` gate the loading and empty states below; neither has a paging or
  // filter-empty message to report, so both must report nothing rather than let `pageMessage` (a
  // leftover from a previous filter) or `emptyMessage` (computed against a still-empty `movements`)
  // leak into a status region that hasn't loaded any content yet.
  const statusText =
    !ready || movements.length === 0 ? '' : visible.length === 0 ? emptyMessage : pageMessage;

  return (
    <section className="flex flex-col gap-4">
      {/* The view's own heading. Without it the day labels below are the top-level headings, so
          jumping by heading announces "Today, Yesterday, Sunday Jul 19" with no page identity. */}
      <h2 className="sr-only">History</h2>

      {/* Mounted from first render on purpose, ABOVE the branch switch below: a status region
          created together with its text is never announced — it has to already exist for assistive
          tech to be watching it. The real load path mounts History at `!ready` and only replaces
          the subtree once OPFS answers, so a region nested inside the loaded-content branch would
          be created fresh at the exact moment its text first matters and would never be announced.
          Mirrors the live region in MovementRow. Carries the empty-state copy when the list is
          empty and the paging announcement otherwise; the two can never apply at once. */}
      <span className="sr-only" role="status">
        {statusText}
      </span>

      {!ready ? (
        // Gated on `ready` because before OPFS answers, `movements` is [] — indistinguishable from
        // a genuinely empty app.
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
          Loading your history…
        </p>
      ) : movements.length === 0 ? (
        // A button, not a paragraph — the same offer HomeView makes when there is nothing to show.
        // An empty log's only useful next step is putting something in it.
        <button
          type="button"
          onClick={onAdd}
          className="w-full rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-10 text-center text-sm text-[var(--color-muted)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          Nothing logged yet — add your first order.
        </button>
      ) : (
        <>
          {/* The only control left on the page, so it pins under the Header rather than scrolling
              away — PRODUCT.md: "Reading material can live up top; tappable things cannot." The
              negative margin lets its hairline span the full width inside <main>'s px-4 gutter. No
              fill: inside History a surface fill means "this is an order". The +1px in the sticky
              offset accounts for the Header's 1px border-b, which sits outside --header-h since the
              header's own height is auto. */}
          <div
            ref={filterRef}
            role="radiogroup"
            aria-label="Filter history"
            onKeyDown={onFilterKeyDown}
            className="sticky top-[calc(env(safe-area-inset-top)+var(--header-h)+1px)] z-10 -mx-4 flex gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2"
          >
            {FILTERS.map((f) => (
              <FilterTab
                key={f.value}
                label={f.label}
                active={filter === f.value}
                onClick={() => setFilter(f.value)}
              />
            ))}
          </div>

          {/* An empty result here means the FILTER matched nothing — the movements.length === 0
              branch above already covers a genuinely empty app. Purely visual: the sr-only status
              region above carries the announcement so this text can safely mount with the list.
              Orders offers the action that would fill it, the way HomeView does; Capsules does not,
              because logging a capsule is Home's primary control and History should not grow a
              second one. */}
          {visible.length === 0 ? (
            filter === 'orders' ? (
              <button
                type="button"
                onClick={onAdd}
                className="w-full rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center text-sm text-[var(--color-muted)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                {emptyMessage} Add one.
              </button>
            ) : (
              <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center text-sm text-[var(--color-muted)]">
                {emptyMessage}
              </p>
            )
          ) : (
            <>
              <div className="flex flex-col gap-6">
                {shown.map((group, index) => {
                  // Only when the month CHANGES from the previous shown group — never above the
                  // first, where "July 2026" over "Today" is noise. 127 day-groups otherwise scroll
                  // for ~15 screens with no landmark at all, so a user looking for a day they know
                  // exists can only page linearly toward it.
                  const previous = shown[index - 1];
                  const startsMonth = previous !== undefined && !isSameMonth(previous.at, group.at);
                  return (
                    // A <section> with aria-labelledby, not a bare <div>: without it, TalkBack's
                    // controls list is ~30 buttons reading "3 capsules 07:00 – 21:00" with no date
                    // anywhere, because the <h3> supplies it in reading order only and nothing binds
                    // the two outside linear traversal.
                    <section key={group.key} aria-labelledby={`day-${group.key}`}>
                      {startsMonth ? (
                        <p className="mb-3 border-t border-[var(--color-border)] pt-4 text-xs font-semibold tracking-wide text-[var(--color-muted)]">
                          {formatMonthLabel(group.at)}
                        </p>
                      ) : null}
                      {/* The organising key must outrank what it organises. At text-sm this heading
                          was quieter than the 16px semibold row beneath it, so 127 day-groups had no
                          visible skeleton — the only landmark on a 15-screen scroll ranked below the
                          content. */}
                      <h3
                        id={`day-${group.key}`}
                        className="mb-2 px-1 text-base font-semibold text-[var(--color-text)]"
                      >
                        {formatDayLabel(group.at)}
                      </h3>
                      {/* Hairlines, not gaps between filled pills. The fill now belongs to orders
                          alone (see MovementRow), so drink rows are separated by the container the
                          way HomeView's figures block is — one thought, split, rather than a stack of
                          equal rectangles. An order row keeps its fill and reads as a promoted block
                          inside the divided stack. */}
                      <ul className="divide-y divide-[var(--color-border)]">
                        {buildDayEntries(group.rows).map((entry) => (
                          <EntryRow
                            key={entry.kind === 'order' ? entry.movement.id : `drinks-${group.key}`}
                            entry={entry}
                            onEdit={openEditor}
                            onEditTime={setEditing}
                            onDelete={removeMovement}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>

              {hiddenDays > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const added = Math.min(hiddenDays, DAYS_PER_PAGE);
                    setDaysShown((d) => d + DAYS_PER_PAGE);
                    // A live region only re-announces when its text actually CHANGES. "30 more days
                    // shown" is identical on taps 2, 3 and 4 of a long log (added caps at
                    // DAYS_PER_PAGE), so React never touches the text node and the announcement
                    // that exists for exactly this repeat-tap case silently stops firing after the
                    // first tap. The running total always changes, so it always re-announces.
                    setPageMessage(
                      `Showing ${number.format(daysShown + added)} of ${number.format(groups.length)} days`,
                    );
                  }}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 text-sm font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                >
                  Show older ({number.format(hiddenDays)} more {hiddenDays === 1 ? 'day' : 'days'})
                </button>
              ) : null}
            </>
          )}
        </>
      )}

      <EditTimeDialog
        movement={editing}
        onClose={() => setEditing(null)}
        onSave={editMovementTime}
      />

      <AddOrderSheet
        open={editingOrder !== null}
        movement={editingOrder}
        onClose={() => setEditingOrder(null)}
        onSubmit={async (shop, brand, beanName, quantity, price) => {
          if (editingOrder)
            await editOrder(editingOrder.id, shop, brand, beanName, quantity, price);
        }}
      />
    </section>
  );
}

// One entry: an order renders as the normal log row; a day's drinks render as one collapsed row.
function EntryRow({
  entry,
  onEdit,
  onEditTime,
  onDelete,
}: {
  entry: DayEntry;
  onEdit: (movement: Movement) => void;
  onEditTime: (movement: Movement) => void;
  // Must match MovementRow's `onDelete` type exactly: this is a pass-through, and narrowing it to
  // `void` here would type-check today (the same function reference still flows through at
  // runtime) while silently disabling MovementRow's ability to catch a rejected OPFS write.
  onDelete: (id: string) => void | Promise<void>;
}) {
  if (entry.kind === 'order') {
    return (
      <MovementRow
        movement={entry.movement}
        onEdit={onEdit}
        onEditTime={onEditTime}
        onDelete={onDelete}
      />
    );
  }
  return <DrinkDayRow entry={entry} onEdit={onEdit} onEditTime={onEditTime} onDelete={onDelete} />;
}

// A day's drinking as one line: "6 capsules · 07:12 – 21:08". Tapping it reveals the individual
// cups, which keep the full edit/delete affordances — collapsing is a display decision, not a loss
// of control. Collapsed by default because the summary answers the question the log is usually
// opened with, and 11 identical rows never did.
function DrinkDayRow({
  entry,
  onEdit,
  onEditTime,
  onDelete,
}: {
  entry: Extract<DayEntry, { kind: 'drinks' }>;
  onEdit: (movement: Movement) => void;
  onEditTime: (movement: Movement) => void;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  // A single cup has no range to state, and the time is already the only thing the row would show.
  const range =
    entry.movements.length === 1
      ? formatTime(entry.to)
      : `${formatTime(entry.from)} – ${formatTime(entry.to)}`;

  return (
    // No fill at either level: inside a log, a filled rectangle means "this is an order", and a
    // day's drinking is neither an order nor a single record. The day heading above and the
    // container's hairlines carry the grouping; the chevron carries the affordance.
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // Only while open: the <ul> is conditionally rendered, so pointing at its id while collapsed
        // leaves an IDREF resolving to nothing on every row in the log — 59 dangling references on a
        // real 126-day ledger. aria-expanded already carries the collapsed state on its own.
        aria-controls={open ? listId : undefined}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="tnum font-semibold">
          {number.format(entry.cups)} {entry.cups === 1 ? 'capsule' : 'capsules'}
        </span>
        <span className="tnum flex-1 truncate text-sm text-[var(--color-muted)]">{range}</span>
        <ChevronDownIcon
          className={`size-[18px] shrink-0 text-[var(--color-faint)] transition-transform duration-[var(--dur-fast)] ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        // No fill here, but orders in this list keep their own fill; drinks are separated by the
        // container's hairlines instead. Each MovementRow asserts the fill rule independently.
        <ul
          id={listId}
          className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]"
        >
          {entry.movements.map((m) => (
            <MovementRow
              key={m.id}
              movement={m}
              onEdit={onEdit}
              onEditTime={onEditTime}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function FilterTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      // Roving tabindex: one tab stop for the whole group, then arrow keys within it. Three
      // separate tab stops would make the group cost three presses to skip.
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`flex-1 rounded-[var(--radius-sm)] py-1.5 text-sm transition-colors ${
        // Weight carries the selection alongside the accent. PRODUCT.md: "Status is never encoded
        // in color alone." The old --color-surface-2 riser measured 1.10:1 and said nothing.
        active
          ? 'font-semibold text-[var(--color-accent)]'
          : 'font-normal text-[var(--color-muted)]'
      }`}
    >
      {label}
    </button>
  );
}
