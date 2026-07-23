'use client';

import type { ReactNode } from 'react';
import { DashboardIcon, GridIcon, HistoryIcon, HomeIcon, PlusIcon } from './icons';

export type Tab = 'home' | 'dashboard' | 'history' | 'settings';

// Sticky bottom bar: view tabs flanking a raised primary "add order" button, with an overflow
// "More" tab on the right for destinations that don't earn a permanent slot. Fixed to the viewport
// bottom and clamped to the app's 430px column; owns the bottom safe-area inset.
export function BottomNav({
  tab,
  onTab,
  onAdd,
  onMore,
  moreOpen,
  moreAlert,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  onAdd: () => void;
  onMore: () => void;
  moreOpen: boolean;
  moreAlert: boolean;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30">
      <div className="mx-auto flex max-w-[430px] items-stretch justify-between border-t border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-surface)_92%,transparent)] px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <TabButton label="Home" active={tab === 'home'} onClick={() => onTab('home')}>
          <HomeIcon className="size-6" />
        </TabButton>

        <TabButton
          label="Dashboard"
          active={tab === 'dashboard'}
          onClick={() => onTab('dashboard')}
        >
          <DashboardIcon className="size-6" />
        </TabButton>

        <div className="flex items-center px-2">
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add order"
            className="grid size-14 -translate-y-4 place-items-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[0_8px_20px_-4px_color-mix(in_oklab,var(--color-accent)_60%,transparent)] ring-4 ring-[var(--color-bg)] transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] active:scale-90"
          >
            <PlusIcon className="size-7" />
          </button>
        </div>

        <TabButton label="History" active={tab === 'history'} onClick={() => onTab('history')}>
          <HistoryIcon className="size-6" />
        </TabButton>

        {/* Opens the overflow sheet. Highlighted while one of its destinations is the active view,
            so "where am I" still reads off the bar even though the tab itself isn't a view. */}
        <TabButton
          label="More"
          active={tab === 'settings'}
          expanded={moreOpen}
          alert={moreAlert}
          onClick={onMore}
        >
          <GridIcon className="size-6" />
        </TabButton>
      </div>
    </nav>
  );
}

// `popup` marks a tab that opens a sheet rather than switching the view: it announces as a dialog
// trigger instead of claiming aria-current="page", which would lie about where you are.
function TabButton({
  label,
  active,
  onClick,
  children,
  expanded,
  alert,
}: {
  label: string;
  active: boolean;
  onClick?: () => void;
  children: ReactNode;
  // Present only on the sheet-opening tab. Tracks whether the SHEET is open — distinct from
  // `active`, which tints the tab while one of its destinations is the showing view.
  expanded?: boolean;
  // Only the "More" tab passes this. When set, an accent dot rides the icon and the accessible name
  // gains a reason — so the signal is never colour-alone (Accessibility). Accent is a budget spent
  // on real signals (Principle 4); an overdue backup is one.
  alert?: boolean;
}) {
  const popup = expanded !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={!popup && active ? 'page' : undefined}
      aria-haspopup={popup ? 'dialog' : undefined}
      aria-expanded={expanded}
      aria-label={alert ? `${label} — backup overdue` : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
        active ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'
      }`}
    >
      <span className="relative">
        {children}
        {alert ? (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-0.5 size-2 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-surface)]"
          />
        ) : null}
      </span>
      {label}
    </button>
  );
}
