import { useSyncExternalStore } from 'react';

/** A phone: no editing controls in the page bar, and comments rise from the foot of the screen. */
export const PHONE_QUERY = '(max-width: 480px) and (pointer: coarse)';

export function useMedia(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    change => {
      const list = window.matchMedia(query);
      list.addEventListener('change', change);
      return () => list.removeEventListener('change', change);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
