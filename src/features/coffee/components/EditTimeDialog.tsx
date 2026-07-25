'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Movement } from '../core/movement';
import { fromDateTimeLocal, toDateTimeLocal } from '../core/datetime';

type Props = {
  movement: Movement | null; // the row being edited, or null when closed
  onClose: () => void;
  onSave: (id: string, at: number) => void;
};

// Small centered dialog to correct a movement's timestamp via the native datetime-local control.
export function EditTimeDialog({ movement, onClose, onSave }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [value, setValue] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (movement) {
      setValue(toDateTimeLocal(movement.at));
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [movement]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!movement) return;
    const at = fromDateTimeLocal(value);
    if (Number.isFinite(at)) onSave(movement.id, at);
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={`${uid}-title`}
      className="m-auto w-[min(20rem,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-text)]"
    >
      <h2 id={`${uid}-title`} className="mb-3 text-lg font-semibold">
        Edit time
      </h2>
      <form onSubmit={save} className="flex flex-col gap-4">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="tnum w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[var(--color-text)] [color-scheme:dark]"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-4 font-medium transition-colors hover:bg-[var(--color-border)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 font-semibold text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
