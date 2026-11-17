/**
 * The find bar (⌘F): searches the text of every artboard and note, page by
 * page. Enter or F3 goes to the next match, ⇧Enter or ⇧F3 to the previous
 * one, Escape closes. (⌘G is Group in this editor.) There is no replace.
 * The bar itself is `FindBar` of `@open-artifact/editor-kit`.
 */

import { useEffect } from 'react';
import { FindBar as KitFindBar } from '@open-artifact/editor-kit/react';
import { useDocument } from '../state/document.ts';
import { useView } from '../state/view.ts';
import { clearHighlights, highlightMatches, useFind } from '../services/find.ts';

export function FindBar() {
  const open = useView((s) => s.findOpen);
  const query = useFind((s) => s.query);
  const matches = useFind((s) => s.matches);
  const index = useFind((s) => s.index);
  const tick = useView((s) => s.layoutTick);
  const page = useView((s) => s.page);
  const boards = useDocument((s) => s.boards);

  // Redraw the highlights as the match, the page or the artboards change (frames render after a tick).
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => highlightMatches(query, matches[index]));
    return () => cancelAnimationFrame(frame);
  }, [open, query, matches, index, tick, page, boards]);

  useEffect(() => (open ? undefined : clearHighlights()), [open]);

  if (!open) return null;
  const find = useFind.getState();
  return (
    <KitFindBar
      label="Find in design"
      closeLabel="Close find"
      // ⌘F while open focuses the field again (F3 elsewhere is keyboard.ts).
      focusEvent="open-artifact-design:focus-find"
      f3
      stopEscape
      className="h-9 pl-2.5 pr-1"
      query={query}
      count={matches.length}
      index={index}
      onQuery={find.setQuery}
      onStep={find.step}
      onClose={find.close}
    />
  );
}
