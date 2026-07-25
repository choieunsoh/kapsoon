'use client';

import { useState } from 'react';
import type { Movement } from '../core/movement';
import { formatTime } from '../core/datetime';
import { formatSatang } from '../core/money';
import { ClockIcon, TrashIcon } from './icons';

const number = new Intl.NumberFormat('en-US');

type Props = {
  movement: Movement;
  // When provided, the row shows edit-time / delete actions (History). Omit for a read-only row.
  onEditTime?: (movement: Movement) => void;
  // Returns a promise when the caller writes to OPFS (both real callers do). Typed as
  // `void | Promise<void>` so the row can await the outcome without forcing a read-only caller to
  // be async.
  onDelete?: (id: string) => void | Promise<void>;
  // When provided, the row's text region becomes a button that opens the right editor for this
  // movement. Deliberately a SIBLING of the icon buttons below, not a wrapper: nesting them inside
  // a button is invalid HTML and announces as one confused control instead of three.
  onEdit?: (movement: Movement) => void;
};

// One log line: time · what happened · cup delta (+ cost for orders). The timestamp leads every row
// so the log is scannable by when things happened.
export function MovementRow({ movement, onEditTime, onDelete, onEdit }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const isOrder = movement.delta > 0;
  const subtitle = [movement.brand, movement.beanName].filter(Boolean).join(' · ');
  const actionable = Boolean(onEditTime || onDelete);

  // Defined once and wrapped below in a <button> or a <div>. Spans, not <p>: a <p> is not valid
  // inside a <button>, and only one of these two wrappers may exist per row.
  const text = (
    <>
      <span className="block truncate font-medium">
        {isOrder ? movement.shop || 'Order' : 'Drank a coffee'}
      </span>
      {isOrder && subtitle ? (
        <span className="block truncate text-xs text-[var(--color-muted)]">{subtitle}</span>
      ) : null}
    </>
  );

  return (
    // Inside a log, the fill marks an ORDER and nothing else. 9 of 606 movements are orders, and
    // they are the reason to open History at all — a filled block among hairline-separated drink
    // rows is the rank signal PRODUCT.md's anti-reference asks for ("every block must earn its
    // visual weight").
    // Against --color-bg the fill measures only 1.06:1, so it was never a legible record boundary
    // when every row carried it; as a 1-in-13 promotion it reads. Drink rows are separated by the
    // container's hairlines instead.
    <li
      className={`flex items-center gap-3 px-3 py-2.5${
        isOrder ? ' rounded-[var(--radius-md)] bg-[var(--color-surface)]' : ''
      }`}
    >
      <time className="tnum w-11 shrink-0 text-sm font-semibold">{formatTime(movement.at)}</time>

      {onEdit ? (
        // The label names the ACTION as well as the row. Bare content ("Shopee") would announce
        // beside "Edit time" / "Delete entry" with no cue that this one opens an editor; a bare
        // "Edit order" would announce identically on every row, so neither half works alone.
        <button
          type="button"
          onClick={() => onEdit(movement)}
          aria-label={
            isOrder ? `Edit order: ${movement.shop || 'Order'}` : 'Edit time: drank a coffee'
          }
          className="min-w-0 flex-1 text-left"
        >
          {text}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{text}</div>
      )}

      {/* Orders only. A drink's delta is always exactly -1, so printing it says nothing the label
           doesn't already say — and the fixed-width column it needed was truncating order subtitles. */}
      {isOrder ? (
        <div className="flex flex-col items-end leading-tight">
          <span className="tnum font-semibold text-[var(--color-accent)]">
            +{number.format(movement.delta)}
          </span>
          {movement.price > 0 ? (
            <span className="tnum text-xs text-[var(--color-muted)]">
              {formatSatang(movement.price)}
            </span>
          ) : null}
        </div>
      ) : null}

      {actionable ? (
        <>
          {/* The icon pair swaps to Cancel/Delete in place. Sighted users see that; a screen-reader
              user gets no signal without this. It lives OUTSIDE the ternary on purpose: a live
              region that is inserted already-populated is not announced — the region has to be in
              the DOM from first render with only its text changing. */}
          <span className="sr-only" aria-live="polite">
            {failed
              ? "That entry didn't delete."
              : confirming
                ? 'Delete confirmation required.'
                : ''}
          </span>
          {confirming ? (
            // Delete FIRST, Cancel last. Both clusters are right-aligned in the same flex row, so
            // the last child is the rightmost element — and the trigger's last child is the trash
            // icon. Ordering Cancel last means the second tap of a careless one-handed double-tap
            // lands on the benign action instead of destroying the row. `onBlur` disarms when focus
            // leaves the pair, so a row armed and scrolled past cannot keep a destructive control
            // sitting where a benign one is expected.
            <div
              className="flex items-center gap-1.5"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setConfirming(false);
              }}
            >
              <button
                type="button"
                onClick={() => {
                  // HomeView.tsx:49 states the rule this follows: a rejected write must not look
                  // like a successful one. The OPFS write can fail if cross-origin isolation is
                  // lost, and dropping the promise left the row on screen with nothing said —
                  // identical to a successful delete followed by a re-render.
                  setFailed(false);
                  const result = onDelete?.(movement.id);
                  if (result instanceof Promise) result.catch(() => setFailed(true));
                }}
                className="rounded-[var(--radius-sm)] bg-[var(--color-danger)] px-2.5 text-sm font-medium text-[var(--color-on-danger)]"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => {
                  // A stale `failed` from a previous, rejected Delete must not survive Cancel: the
                  // live region below checks `failed` before `confirming`, so an un-cleared failure
                  // would keep announcing "That entry didn't delete." forever and silently eat the
                  // next arm's "Delete confirmation required." announcement.
                  setFailed(false);
                  setConfirming(false);
                }}
                className="rounded-[var(--radius-sm)] px-2 text-sm text-[var(--color-muted)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {onEditTime ? (
                <button
                  type="button"
                  onClick={() => onEditTime(movement)}
                  aria-label="Edit time"
                  className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-[var(--color-faint)] transition-colors hover:text-[var(--color-text)]"
                >
                  <ClockIcon className="size-[18px]" />
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    // Belt-and-braces with the Cancel handler above: re-arming also clears any
                    // leftover failure, so a row that once failed can never re-enter the confirming
                    // state with a stale `failed` still pinning the live region's text.
                    setFailed(false);
                    setConfirming(true);
                  }}
                  aria-label="Delete entry"
                  className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-[var(--color-faint)] transition-colors hover:text-[var(--color-danger)]"
                >
                  <TrashIcon className="size-[18px]" />
                </button>
              ) : null}
            </div>
          )}
          {/* Visible counterpart to the live region above: a screen-reader user is told, and a
              sighted user must be too. Sits at the end of the row so it doesn't reflow the controls. */}
          {failed ? (
            <span className="text-xs text-[var(--color-danger)]">Didn&apos;t delete</span>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
