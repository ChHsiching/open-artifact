import { storedJson } from '@open-artifact/editor-kit';
import { SLIDE_FRAGMENT } from '@open-artifact/protocol';
import { deckOrder, useDeck } from '../state/deck.ts';
import { useView } from '../state/view.ts';
import { session } from './session.ts';

/** The marker distinguishes numeric slide ids from older positional links. */
export function slideHash(id: string): string {
  return `#slide-~${id}`;
}

export function slideFromHash(hash: string = location.hash): string | null {
  if (!SLIDE_FRAGMENT.test(hash)) return null;
  const value = hash.slice('#slide-'.length);
  const order = deckOrder(useDeck.getState());
  if (value.startsWith('~')) return order.includes(value.slice(1)) ? value.slice(1) : null;
  return order[Number(value) - 1] ?? null;
}

function positionStore(storage: () => Storage) {
  return storedJson<string>(`open-artifact-slides:position:${session().artifact.id}`, value => typeof value === 'string' ? value : null, storage);
}

/** Explicit links win over the last slide seen in this tab or artifact. */
export function initialSlide(): string | null {
  const order = deckOrder(useDeck.getState());
  const saved = positionStore(() => sessionStorage).read() ?? positionStore(() => localStorage).read();
  return slideFromHash() ?? (saved && order.includes(saved) ? saved : order[0] ?? null);
}

/** A slide can be on screen in either the editor or the presenter. */
export function reportSlide(id: string): void {
  const hash = slideHash(id);
  if (location.hash !== hash) history.replaceState(history.state, '', hash);
  positionStore(() => sessionStorage).write(id);
  positionStore(() => localStorage).write(id);
  session().shell?.currentSlide(hash);
}

export function startLocationSync(): void {
  const shell = session().shell;
  function report(): void {
    const current = useView.getState().current;
    if (current) reportSlide(current);
  }

  function follow(hash: string): void {
    const id = slideFromHash(hash);
    const view = useView.getState();
    if (!id) return;
    if (view.presenting) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      view.present(null);
    }
    if (view.mode !== 'edit') view.setMode('edit');
    if (id === view.current) { report(); return; }
    view.showSlide(id);
  }

  report();
  useView.subscribe((state, previous) => {
    if (state.current !== previous.current) report();
  });
  shell?.onCommand(command => {
    if (command.cmd === 'goto_slide') follow(command.hash);
  });
  window.addEventListener('hashchange', () => follow(location.hash));
}
