'use client';

// PORTABLE — the change bus for use-drive-status. Kapsoon has no global "refetch" signal that spans
// the coffee hook and this feature, so this zero-dependency bus is the seam: actions.ts calls
// bumpConnection() right after every writeConnection()/clearConnection(), and use-drive-status
// subscribes. Also relays the cross-tab `storage` event so another tab's connect shows up here.

const listeners = new Set<() => void>();

export function bumpConnection(): void {
  for (const l of listeners) l();
}

export function subscribeConnection(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = () => onChange();
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
