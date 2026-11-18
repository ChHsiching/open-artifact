/** While a margin is drawn, the suggestion cards are in it, stacked with the others there or behind its markers. */
import { type ReactNode, useEffect, useMemo } from 'react';
import { setDocs, useDocs } from '../app/store.ts';
import { type ColumnCard, feedColumn, unfeedColumn, useMarginColumn } from '../margin/column.ts';
import { useOpenSuggestions } from './model.ts';
import { SuggestionCardView } from './SuggestionCard.tsx';
import { useStackFocus } from './SuggestionMargin.tsx';

const FEED = 'suggestions';

export function SuggestionColumnFeed(): ReactNode {
  const drawn = useMarginColumn(state => state.mode !== 'off');
  return drawn ? <Feed /> : null;
}

function Feed(): null {
  const tab = useOpenSuggestions(state => state.tab);
  const cards = useOpenSuggestions(state => state.cards);
  const icons = useMarginColumn(state => state.mode === 'icons');
  const stacked = useStackFocus();
  const focused = useDocs(state => state.focusedSuggestion);
  // Behind markers a card opens when it is chosen, not while its words are under the pointer.
  const focus = icons ? focused : stacked;

  const fed = useMemo<ColumnCard[]>(() => {
    if (!tab) return [];
    return cards.map((card, index) => ({
      id: card.id,
      anchor(page) {
        const words = page.querySelector(`.ProseMirror [data-suggest-id="${card.id}"]`);
        return words ? words.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop : null;
      },
      render: open => <SuggestionCardView card={card} tab={tab} index={index} total={cards.length} selected={open} />,
      select: open => setDocs({ focusedSuggestion: open ? card.id : null }),
    }));
  }, [tab, cards]);

  useEffect(() => feedColumn(FEED, fed, focus && fed.some(card => card.id === focus) ? focus : null), [fed, focus]);
  useEffect(() => () => unfeedColumn(FEED), []);
  return null;
}
