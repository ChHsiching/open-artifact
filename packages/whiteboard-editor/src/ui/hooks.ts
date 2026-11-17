/**
 * Small React hooks shared by the chrome.
 */

import { useMemo, useSyncExternalStore } from 'react';

function mediaStore(query: string) {
  return {
    subscribe(listener: () => void) {
      const list = window.matchMedia(query);
      list.addEventListener('change', listener);
      return () => list.removeEventListener('change', listener);
    },
    get(): boolean {
      return window.matchMedia(query).matches;
    },
  };
}

const coarse = mediaStore('(pointer: coarse)');

/** True on a touch-first device: controls grow to finger size. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(coarse.subscribe, coarse.get, () => false);
}

const narrowTouch = mediaStore('(pointer: coarse) and (max-width: 599px)');

/**
 * True on a touch-first phone-sized screen: the tool bar regroups tools
 * for it (the section moves into the Shapes tray). Larger tablets keep the
 * desktop grouping.
 */
export function useNarrowTouch(): boolean {
  return useSyncExternalStore(narrowTouch.subscribe, narrowTouch.get, () => false);
}

/** True while a media query matches. */
export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => mediaStore(query), [query]);
  return useSyncExternalStore(store.subscribe, store.get, () => false);
}
