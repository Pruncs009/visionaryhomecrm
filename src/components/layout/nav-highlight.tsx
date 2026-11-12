'use client';

import { useEffect, useSyncExternalStore } from 'react';

// Lets a page tell the sidebar which menu item it belongs to when the URL alone
// doesn't say (e.g. a deal at /transactions/<id> belongs to its stage's menu item).
let current: string | null = null;
const listeners = new Set<() => void>();
const set = (href: string | null) => {
  current = href;
  listeners.forEach((l) => l());
};

export function useNavHighlight() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}

/** Render on a page to highlight `href` in the sidebar while the page is shown. */
export function NavHighlight({ href }: { href: string }) {
  useEffect(() => {
    set(href);
    return () => set(null);
  }, [href]);
  return null;
}
