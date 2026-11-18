/** Going to where someone is: their tab, then their caret (or the block they selected) brought into view. */
import { showTab } from '../app/start.ts';
import { getDocs } from '../app/store.ts';
import { useEditor } from '../editor/format.ts';
import type { Person } from './people.ts';

/** How long to wait for their tab to open and their caret to be drawn, ms. */
const WAIT_MS = 3000;

function markOf(tab: string, peer: string): HTMLElement | null {
  const text = document.querySelector<HTMLElement>(`.doc-text[data-tab="${CSS.escape(tab)}"]`);
  if (!text) return null;
  const id = CSS.escape(peer);
  return text.querySelector<HTMLElement>(`.doc-peer-caret[data-peer="${id}"]`) ?? text.querySelector<HTMLElement>(`.doc-peer-block[data-peer="${id}"]`);
}

const scrollBehavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

let pending: (() => void) | null = null;

/** Shows the person's tab and scrolls their caret into view; the viewer's own selection stays where it is. */
export function jumpTo(person: Pick<Person, 'id' | 'tab'>): void {
  pending?.();
  const tab = person.tab;
  if (!tab || !getDocs().project?.files.some(file => file.id === tab)) return;
  showTab(tab);
  const until = Date.now() + WAIT_MS;
  let frame = 0;
  const look = (): void => {
    const mark = useEditor.getState().tab === tab ? markOf(tab, person.id) : null;
    if (mark) {
      pending = null;
      mark.scrollIntoView({ block: 'center', inline: 'nearest', behavior: scrollBehavior() });
      return;
    }
    if (Date.now() > until) {
      pending = null;
      return;
    }
    frame = requestAnimationFrame(look);
  };
  pending = () => cancelAnimationFrame(frame);
  look();
}
