/**
 * The address follows the slide on stage (`#slide-N`, 1-based), and the
 * browser's back and forward buttons step between the slides visited.
 */

import { deckOrder, useDeck } from '../state/deck.ts';
import { useView } from '../state/view.ts';

const HASH = /^#slide-(\d{1,4})$/;

/** The slide a `#slide-N` hash names, or null. */
export function slideFromHash(hash: string = location.hash): string | null {
  const match = HASH.exec(hash);
  if (!match) return null;
  const order = deckOrder(useDeck.getState());
  return order[Number(match[1]) - 1] ?? null;
}

/** Keeps the address and the slide on stage in step. */
export function startLocationSync(): void {
  let applying = false;
  useView.subscribe((state, previous) => {
    if (applying || state.current === previous.current || !state.current) return;
    const n = deckOrder(useDeck.getState()).indexOf(state.current) + 1;
    if (n <= 0) return;
    const hash = `#slide-${n}`;
    if (location.hash === hash) return;
    // The first slide shown replaces the entry; later ones add history steps.
    if (previous.current) history.pushState(null, '', hash);
    else history.replaceState(null, '', hash);
  });
  const follow = (): void => {
    const id = slideFromHash();
    const view = useView.getState();
    if (!id || id === view.current) return;
    applying = true;
    try {
      if (view.mode !== 'edit' && !view.presenting) view.setMode('edit');
      view.showSlide(id);
    } finally {
      applying = false;
    }
  };
  window.addEventListener('popstate', follow);
  window.addEventListener('hashchange', follow);
}
