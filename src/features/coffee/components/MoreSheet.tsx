'use client';

import { useEffect, useId, useRef } from 'react';
import type { Tab } from './BottomNav';
import { SettingsIcon } from './icons';

// Destinations that don't earn a permanent nav slot. One tile today; the grid is here so the second
// and third cost a line each instead of a nav redesign.
const LINKS = [
  { tab: 'settings', label: 'Settings', Icon: SettingsIcon },
] as const satisfies readonly {
  tab: Tab;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
}[];

// Bottom sheet for the overflow nav, matching the 2×2 grid glyph on the "More" tab that opens it.
// Native <dialog> + showModal() so it lands in the browser's top layer — above the sticky nav, with
// a free focus trap, Esc-to-close and ::backdrop, same as AddOrderSheet.
export function MoreSheet({
  open,
  onClose,
  onTab,
}: {
  open: boolean;
  onClose: () => void;
  onTab: (tab: Tab) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={`${uid}-title`}
      className="sheet m-0 mx-auto mt-auto w-full max-w-[430px] rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-[var(--color-text)]"
    >
      <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-border-strong)]" />
      <h2 id={`${uid}-title`} className="mb-3 text-lg font-semibold">
        More
      </h2>

      <ul className="grid grid-cols-3 gap-2">
        {LINKS.map(({ tab, label, Icon }) => (
          <li key={tab}>
            <button
              type="button"
              onClick={() => {
                onTab(tab);
                onClose();
              }}
              className="flex w-full flex-col items-center gap-2 rounded-[var(--radius-md)] p-3 transition-opacity active:opacity-70"
            >
              <span className="grid size-12 place-items-center rounded-[var(--radius-md)] bg-[var(--color-surface-2)]">
                <Icon className="size-[22px]" />
              </span>
              <span className="text-xs font-medium">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
