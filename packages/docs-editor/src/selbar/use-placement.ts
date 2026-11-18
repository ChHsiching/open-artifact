/** Keeps a floating element of the page's layer beside a range of the text, through scrolling and resizing. */
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { type Box, type Placement, intersect, placeBeside } from './placement.ts';
import type { TextRange } from './watch.ts';

/** The range's box on screen: one line's span, or the text's full width when it wraps. */
export function rangeBox(view: EditorView, range: TextRange): Box | null {
  try {
    const start = view.coordsAtPos(range.from, 1);
    const end = view.coordsAtPos(range.to, -1);
    if (Math.abs(start.top - end.top) < 3 || range.from === range.to)
      return { left: Math.min(start.left, end.left), right: Math.max(start.right, end.right), top: Math.min(start.top, end.top), bottom: Math.max(start.bottom, end.bottom) };
    const text = view.dom.getBoundingClientRect();
    return { left: text.left, right: text.right, top: start.top, bottom: end.bottom };
  } catch {
    return null;
  }
}

const sameSpot = (a: Placement | null, b: Placement | null) =>
  a === b || (!!a && !!b && Math.round(a.left) === Math.round(b.left) && Math.round(a.top) === Math.round(b.top) && a.below === b.below);

/**
 * Where `element` goes in `.doc-page` (its offset parent) to sit over the range, or below it when there's no room in
 * the visible part of the scroll area; null while it can't be placed (the range is out of sight).
 */
export function useLayerPlacement(view: EditorView | null, range: TextRange | null, element: RefObject<HTMLElement | null>, key: unknown): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const from = range?.from ?? -1;
  const to = range?.to ?? -1;

  const measure = useCallback(() => {
    const node = element.current;
    const page = view?.dom.closest('.doc-page');
    const scroller = view?.dom.closest('[data-doc-scroll]');
    if (!view || from < 0 || !node || !page || !scroller) {
      setPlacement(null);
      return;
    }
    const target = rangeBox(view, { from, to });
    if (!target) {
      setPlacement(null);
      return;
    }
    const pageBox = page.getBoundingClientRect();
    const viewport: Box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const across = intersect(pageBox, viewport, 8);
    const down = intersect(scroller.getBoundingClientRect(), viewport, 8);
    const placed = placeBeside(target, { width: node.offsetWidth, height: node.offsetHeight }, { left: across.left, right: across.right, top: down.top, bottom: down.bottom });
    const next = placed ? { left: placed.left - pageBox.left, top: placed.top - pageBox.top, below: placed.below } : null;
    setPlacement(before => (sameSpot(before, next) ? before : next));
  }, [view, from, to, element]);

  useLayoutEffect(measure, [measure, key]);

  useEffect(() => {
    const scroller = view?.dom.closest('[data-doc-scroll]');
    if (!scroller) return undefined;
    let frame = 0;
    const later = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
    };
    scroller.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
    if (element.current) observer?.observe(element.current);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', later);
      window.removeEventListener('resize', later);
      observer?.disconnect();
    };
  }, [view, measure, element]);

  return placement;
}
