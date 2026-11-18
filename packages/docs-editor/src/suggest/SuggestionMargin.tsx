/**
 * The suggestion cards right of the text, each level with its words and pushed down so none overlap; the looked-at
 * one (caret, pointer or card) sits level with its words. With a margin column drawn, the cards join it instead
 * (SuggestionColumnFeed); where there is neither, the looked-at card floats over the page (SuggestionFloat).
 */
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDocs } from '../app/store.ts';
import { useEditor } from '../editor/format.ts';
import { useMarginColumn } from '../margin/column.ts';
import { stackCards } from '../margin/stack.ts';
import { CARD_OFFSET, CARD_WIDTH, marginFits } from './layout.ts';
import { useOpenSuggestions } from './model.ts';
import { setSuggest, useSuggest } from './store.ts';
import { SuggestionCardView } from './SuggestionCard.tsx';

interface Measured {
  left: number;
  anchors: Map<string, number>;
}

const sameAnchors = (a: Map<string, number>, b: Map<string, number>) => a.size === b.size && [...a].every(([id, top]) => Math.round(b.get(id) ?? NaN) === Math.round(top));

/** The tallest a card is taken to be before it has been measured. */
const GUESS_HEIGHT = 84;

/**
 * The suggestion the stack is laid out around: the words under the pointer, else the looked-at one. While the pointer
 * is on a card it holds still, so the card stays under the pointer.
 */
export function useStackFocus(): string | null {
  const focused = useDocs(state => state.focusedSuggestion);
  const hoveredText = useSuggest(state => state.hoveredText);
  const hoveredCard = useSuggest(state => state.hoveredCard);
  const held = useRef<{ active: string | null; focused: string | null }>({ active: null, focused: null });
  if (!hoveredCard || focused !== held.current.focused) held.current = { active: hoveredCard ? focused : (hoveredText ?? focused), focused };
  return held.current.active;
}

export function SuggestionMargin(): ReactNode {
  const column = useMarginColumn(state => state.mode !== 'off');
  return column ? null : <BesideText />;
}

function BesideText(): ReactNode {
  const view = useEditor(state => state.view);
  const doc = useEditor(state => state.state?.doc);
  const tab = useOpenSuggestions(state => state.tab);
  const cards = useOpenSuggestions(state => state.cards);
  const fits = useSuggest(state => state.margin);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const observed = useRef(new Map<string, HTMLElement>());

  const measure = useCallback(() => {
    const page = view?.dom.closest('.doc-page');
    const scroller = view?.dom.closest('[data-doc-scroll]');
    if (!view || !page || !scroller) return;
    const pageBox = page.getBoundingClientRect();
    const textBox = view.dom.getBoundingClientRect();
    const room = marginFits(textBox.right, scroller.getBoundingClientRect().right);
    if (room !== useSuggest.getState().margin) setSuggest({ margin: room });
    const anchors = new Map<string, number>();
    for (const card of useOpenSuggestions.getState().cards) {
      const element = view.dom.querySelector(`[data-suggest-id="${card.id}"]`);
      if (element) anchors.set(card.id, element.getBoundingClientRect().top - pageBox.top);
    }
    const left = textBox.right - pageBox.left + CARD_OFFSET;
    setMeasured(before => (before && Math.round(before.left) === Math.round(left) && sameAnchors(before.anchors, anchors) ? before : { left, anchors }));
  }, [view]);

  useLayoutEffect(measure, [measure, doc, cards]);

  useEffect(() => {
    if (!view) return undefined;
    let frame = 0;
    const later = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
    };
    window.addEventListener('resize', later);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
    observer?.observe(view.dom);
    const scroller = view.dom.closest('[data-doc-scroll]');
    if (scroller) observer?.observe(scroller);
    // Pictures and fonts load late and move the words.
    const loaded = (event: Event) => {
      if (event.target instanceof HTMLImageElement) later();
    };
    view.dom.addEventListener('load', loaded, true);
    void document.fonts?.ready.then(later);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', later);
      view.dom.removeEventListener('load', loaded, true);
      observer?.disconnect();
    };
  }, [view, measure]);

  // Each card's height, for the stacking.
  const sizes = useMemo(
    () =>
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(entries => {
            setHeights(before => {
              let next: Map<string, number> | null = null;
              for (const entry of entries) {
                const id = (entry.target as HTMLElement).dataset.suggestCard;
                const height = (entry.target as HTMLElement).offsetHeight;
                if (!id || before.get(id) === height) continue;
                next ??= new Map(before);
                next.set(id, height);
              }
              return next ?? before;
            });
          }),
    [],
  );
  useEffect(() => () => sizes?.disconnect(), [sizes]);
  const refs = useRef(new Map<string, (element: HTMLDivElement | null) => void>());
  const track = (id: string) => {
    let ref = refs.current.get(id);
    if (!ref) {
      ref = (element: HTMLDivElement | null) => {
        const before = observed.current.get(id);
        if (before === element) return;
        if (before) sizes?.unobserve(before);
        if (element) {
          observed.current.set(id, element);
          sizes?.observe(element);
        } else {
          observed.current.delete(id);
          refs.current.delete(id);
        }
      };
      refs.current.set(id, ref);
    }
    return ref;
  };

  const active = useStackFocus();
  const placed = useMemo(() => {
    if (!measured) return [];
    const items = cards.flatMap(card => {
      const top = measured.anchors.get(card.id);
      return top === undefined ? [] : [{ id: card.id, top, height: heights.get(card.id) ?? GUESS_HEIGHT }];
    });
    const tops = stackCards(items, active && measured.anchors.has(active) ? active : null);
    return cards.flatMap((card, index) => {
      const top = tops.get(card.id);
      return top === undefined ? [] : [{ card, index, top }];
    });
  }, [cards, measured, heights, active]);

  if (!tab || !fits || !measured || !placed.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-suggest-margin="">
      {placed.map(({ card, index, top }) => (
        <SuggestionCardView
          key={card.id}
          ref={track(card.id)}
          card={card}
          tab={tab}
          index={index}
          total={cards.length}
          selected={card.id === active}
          className="absolute"
          style={{ left: measured.left, top, width: CARD_WIDTH, transition: 'top 150ms ease-out' }}
        />
      ))}
    </div>
  );
}
