'use client';

import { useState } from 'react';
import { useCoffee } from '@features/coffee/use-coffee';
// Side-effect import: registers the coffee backup adapter before any Drive action runs.
import '@features/coffee/drive/coffee-adapter';
import { useDriveSync } from '@features/coffee/drive/use-drive-sync';
import { AddOrderSheet } from './AddOrderSheet';
import { BottomNav, type Tab } from './BottomNav';
import { DashboardView } from './DashboardView';
import { Header } from './Header';
import { HistoryView } from './HistoryView';
import { HomeView } from './HomeView';
import { MoreSheet } from './MoreSheet';
import { SettingsView } from './SettingsView';

// App shell: sticky header, the active view, and the sticky bottom nav. One useCoffee instance is
// shared across views so switching tabs never re-reads OPFS or flickers.
export function Coffee() {
  const coffee = useCoffee();
  // Fire-and-forget auto-backup on app open (best-effort; no-op unless connected + stale enough).
  useDriveSync();
  const [tab, setTab] = useState<Tab>('home');
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Gated on `ready` as well as the tab: before OPFS answers, `stock` is 0, and the pill would
          assert "0 capsules" — with the low-stock dot — over a tab that is still loading. Showing
          nothing for that beat is the only honest option; HomeView makes the same call for its hero. */}
      <Header stock={coffee.stock} showStock={tab !== 'home' && coffee.ready} />

      {/* Bottom padding clears the fixed nav (~56px bar + raised button + safe area). */}
      <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4">
        <div key={tab} className="motion-safe:animate-[view-in_220ms_var(--ease-out)]">
          {tab === 'home' ? (
            <HomeView coffee={coffee} onAdd={() => setAddOpen(true)} />
          ) : tab === 'dashboard' ? (
            <DashboardView coffee={coffee} />
          ) : tab === 'history' ? (
            <HistoryView coffee={coffee} onAdd={() => setAddOpen(true)} />
          ) : (
            <SettingsView coffee={coffee} />
          )}
        </div>
      </main>

      <BottomNav
        tab={tab}
        onTab={setTab}
        onAdd={() => setAddOpen(true)}
        onMore={() => setMoreOpen(true)}
        moreOpen={moreOpen}
        moreAlert={coffee.backup.overdue}
      />

      <AddOrderSheet open={addOpen} onClose={() => setAddOpen(false)} onSubmit={coffee.addOrder} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onTab={setTab} />
    </div>
  );
}
