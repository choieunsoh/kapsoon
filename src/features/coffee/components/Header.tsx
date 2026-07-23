import { CapsuleMark } from './icons';

const number = new Intl.NumberFormat('en-US');

// Slim sticky top bar: brand mark + wordmark on the left, a live stock pill on the right. The pill
// keeps the current cup count visible on the tabs where the stock hero isn't shown — Home passes
// showStock={false} because its hero states the same number 40px below, and printing it twice at
// the top of the primary screen just blunts the hero.
export function Header({ stock, showStock = true }: { stock: number; showStock?: boolean }) {
  const low = stock <= 0;
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-bg)_82%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-[var(--header-h)] items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)]">
            <CapsuleMark className="size-[18px]" />
          </span>
          {/* The app's only h1. Every view under it opens at h2, so without this the whole
              document outline starts one level down and screen-reader users get no page title
              to orient from. Sized as a wordmark, not as a heading. */}
          <h1 className="text-[17px] font-semibold tracking-tight">Kapsoon</h1>
        </div>
        {showStock ? (
          <span className="tnum inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1 text-sm font-medium">
            <span
              className={`size-1.5 rounded-full ${low ? 'bg-[var(--color-faint)]' : 'bg-[var(--color-accent)]'}`}
            />
            {number.format(stock)}
            <span className="text-[var(--color-muted)]">capsules</span>
          </span>
        ) : null}
      </div>
    </header>
  );
}
