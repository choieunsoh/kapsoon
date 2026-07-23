'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Movement } from '../db';
import { parseBahtToSatang } from '../money';

type Props = {
  open: boolean;
  // When set, the sheet edits this order instead of creating a new one: fields prefill from it and
  // the title/submit label change. The caller supplies an onSubmit closed over the row's id.
  movement?: Movement | null;
  onClose: () => void;
  onSubmit: (
    shop: string,
    brand: string,
    beanName: string,
    quantity: number,
    price: number,
  ) => Promise<void>;
};

const fieldClass =
  'w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[var(--color-text)] placeholder:text-[var(--color-faint)]';
const labelClass = 'mb-1 block text-sm font-medium text-[var(--color-muted)]';

// Bottom sheet for logging an order. Rendered as a native <dialog> so showModal() puts it in the
// browser's top layer — above the sticky nav/header, with a free backdrop + focus trap, no z-index
// juggling and no clipping by the 430px column's overflow.
export function AddOrderSheet({ open, movement, onClose, onSubmit }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [shop, setShop] = useState('');
  const [brand, setBrand] = useState('');
  const [beanName, setBeanName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = movement != null;

  // Drive the real dialog element from the `open` prop.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Reset or prefill whenever the sheet opens. `toFixed(2)` (not Intl) on purpose: this value feeds
  // an inputMode="decimal" field that parseBahtToSatang must be able to read back, and a formatted
  // "฿450.00" with a currency symbol and separators would not parse.
  useEffect(() => {
    if (!open) return;
    if (movement) {
      setShop(movement.shop);
      setBrand(movement.brand);
      setBeanName(movement.beanName);
      setQuantity(String(movement.delta));
      setPriceInput((movement.price / 100).toFixed(2));
    } else {
      setShop('');
      setBrand('');
      setBeanName('');
      setQuantity('');
      setPriceInput('');
    }
    setError('');
  }, [open, movement]);

  function reset() {
    setShop('');
    setBrand('');
    setBeanName('');
    setQuantity('');
    setPriceInput('');
    setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    const satang = parseBahtToSatang(priceInput);
    if (shop.trim() === '') return setError('Enter a shop name.');
    if (!Number.isInteger(qty) || qty < 1) return setError('Enter a whole number of capsules.');
    if (satang === null) return setError('Enter a valid total price.');

    setSaving(true);
    try {
      await onSubmit(shop, brand, beanName, qty, satang);
      reset();
      onClose();
    } catch {
      setError('Could not save the order. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      // Click on the backdrop (the dialog element itself, outside the inner card) dismisses.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={`${uid}-title`}
      className="sheet m-0 mx-auto mt-auto w-full max-w-[430px] rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-[var(--color-text)]"
    >
      <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-border-strong)]" />
      <h2 id={`${uid}-title`} className="mb-4 text-lg font-semibold">
        {editing ? 'Edit order' : 'Add an order'}
      </h2>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label htmlFor={`${uid}-shop`} className={labelClass}>
            Shop
          </label>
          <input
            id={`${uid}-shop`}
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            placeholder="e.g. Amazon"
            autoComplete="off"
            className={fieldClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-brand`} className={labelClass}>
              Brand
            </label>
            <input
              id={`${uid}-brand`}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Starbucks"
              autoComplete="off"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-bean`} className={labelClass}>
              Bean
            </label>
            <input
              id={`${uid}-bean`}
              value={beanName}
              onChange={(e) => setBeanName(e.target.value)}
              placeholder="House Blend"
              autoComplete="off"
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-qty`} className={labelClass}>
              Quantity (capsules)
            </label>
            <input
              id={`${uid}-qty`}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="50"
              inputMode="numeric"
              className={`${fieldClass} tnum`}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-price`} className={labelClass}>
              Total price (฿)
            </label>
            <input
              id={`${uid}-price`}
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="450.00"
              inputMode="decimal"
              className={`${fieldClass} tnum`}
            />
          </div>
        </div>

        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-4 font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-border)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-[2] rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 font-semibold text-[var(--color-on-accent)] transition-colors enabled:hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : editing ? 'Save' : 'Add order'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
