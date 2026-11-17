/**
 * Find in the design (⌘F; Enter or F3 next, ⇧Enter or ⇧F3 previous; ⌘G
 * stays Group): the pure matching is lib/find.ts, the store and the
 * highlighting are `@open-artifact/editor-kit`. Each match shows its page,
 * selects its element or note and brings it into view; the matched words
 * are highlighted in live artboards and in note text with the CSS Custom
 * Highlight API where the browser has it. There is no replace.
 */

import { clearFindHighlights, createFind, highlightText } from '@open-artifact/editor-kit';
import { useDocument } from '../state/document.ts';
import { useView } from '../state/view.ts';
import { findMatches, firstMatchFrom, type FindMatch } from '../lib/find.ts';
import { templateOf } from './agent.ts';
import { frameOf } from './frames.ts';
import { fitRect, visibleRect, zoomToBoards } from './viewport.ts';
import { noteBounds } from '../lib/notes.ts';
import { intersects } from '@open-artifact/design-core';
import { announce } from './announce.ts';

export type { FindMatch } from '../lib/find.ts';

const pageIds = (): (string | null)[] => {
  const pages = useDocument.getState().canvas.pages;
  return pages.length ? pages.map((p) => p.id) : [null];
};

/** Every match in the design as it is now. */
function search(query: string): FindMatch[] {
  const doc = useDocument.getState();
  return findMatches(doc.canvas, (path) => {
    const source = doc.boards[path]?.source;
    return source == null ? null : templateOf(source);
  }, query);
}

/** Shows a match: its page, its element or note selected and in view. */
function reveal(match: FindMatch, index: number, count: number): void {
  const view = useView.getState();
  if (view.mode !== 'canvas') view.focus(null);
  if (match.page !== null && view.page !== match.page) view.setPage(match.page);
  const canvas = useDocument.getState().canvas;
  const seen = visibleRect(useView.getState().camera);
  if (match.kind === 'element') {
    useView.getState().select({ kind: 'elements', board: match.board, items: [{ tid: match.tid, path: match.path, instance: 0 }] });
    const entry = canvas.boards[match.board];
    if (entry && !intersects(seen, entry)) zoomToBoards([match.board]);
  } else {
    useView.getState().select({ kind: 'objects', boards: [], notes: [match.note] });
    const note = canvas.notes[match.note];
    if (note) {
      const rect = noteBounds(note);
      if (!intersects(seen, rect)) useView.getState().setCamera(fitRect(rect, 160, useView.getState().camera.zoom));
    }
  }
  announce(`${index + 1} of ${count}: ${match.text}`);
}

/** The find bar's state (`createFind`, `@open-artifact/editor-kit`). */
export const useFind = createFind<FindMatch>({
  search,
  start: (matches) => firstMatchFrom(matches, pageIds(), useView.getState().page),
  reveal,
  noResults: () => announce('No results'),
  onClose() {
    useView.getState().setFindOpen(false);
    clearHighlights();
  },
});

/* -------------------------------------------------------------------------- */
/* Highlights                                                                  */
/* -------------------------------------------------------------------------- */

/** Same as the runtime's TID attribute (dc render.ts). */
const TID_ATTRIBUTE = 'data-dc-tpl';

/** Documents highlights are drawn in: this window (note text) and each live artboard. */
function documents(): { doc: Document; board: string | null }[] {
  const out: { doc: Document; board: string | null }[] = [{ doc: document, board: null }];
  for (const path of Object.keys(useDocument.getState().canvas.boards)) {
    try {
      const doc = frameOf(path)?.contentDocument;
      if (doc) out.push({ doc, board: path });
    } catch {
      // A frame of another origin cannot be read.
    }
  }
  return out;
}

/** Removes the find highlights everywhere. */
export function clearHighlights(): void {
  for (const { doc } of documents()) clearFindHighlights(doc);
}

/** Highlights the query in live artboards and note text; the current match gets the stronger color. */
export function highlightMatches(query: string, current: FindMatch | undefined): void {
  for (const { doc, board } of documents()) {
    const root = board ? doc.body : doc.querySelector('[data-canvas-surface]');
    highlightText(
      doc,
      root,
      query,
      (parent) => {
        if (parent.closest('script,style')) return null;
        if (board) {
          const tid = parent.closest(`[${TID_ATTRIBUTE}]`)?.getAttribute(TID_ATTRIBUTE) ?? '';
          return { key: tid, current: current?.kind === 'element' && current.board === board && String(current.tid) === tid };
        }
        const note = parent.closest('[data-note]')?.getAttribute('data-note');
        return note ? { key: note, current: current?.kind === 'note' && current.note === note } : null;
      },
      current?.occurrence,
    );
  }
}

/** Opens the find bar, or focuses it again. */
export function openFind(): void {
  useView.getState().setFindOpen(true);
  window.dispatchEvent(new Event('open-artifact-design:focus-find'));
}
