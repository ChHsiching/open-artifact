/** Places a popup of the `layer` slot under a position in the text (above it when there is no room below). */
import { type RefObject, useEffect, useLayoutEffect } from 'react';
import type { EditorView } from 'prosemirror-view';

const GAP = 6;
const EDGE = 4;

interface Box {
  left: number;
  top: number;
  bottom: number;
}

function anchorBox(view: EditorView, pos: number, onNode: boolean): Box | null {
  try {
    if (onNode) {
      const dom = view.nodeDOM(pos);
      if (dom instanceof HTMLElement) return dom.getBoundingClientRect();
    }
    return view.coordsAtPos(Math.min(pos, view.state.doc.content.size));
  } catch {
    return null;
  }
}

function place(view: EditorView, pos: number, el: HTMLElement, onNode: boolean): void {
  const page = view.dom.closest('.doc-page');
  const box = anchorBox(view, pos, onNode);
  if (!page || !box) return;
  const pageBox = page.getBoundingClientRect();
  const scroller = view.dom.closest('[data-doc-scroll]')?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
  const height = el.offsetHeight;
  const width = el.offsetWidth;
  const below = box.bottom + GAP;
  const above = box.top - GAP - height;
  const top = below + height <= scroller.bottom - EDGE || above < scroller.top + EDGE ? below : above;
  const left = Math.max(EDGE, Math.min(box.left - pageBox.left, pageBox.width - width - EDGE));
  el.style.left = `${left}px`;
  el.style.top = `${top - pageBox.top}px`;
  el.style.visibility = 'visible';
}

/** Keeps `ref`'s element at `pos` (under the node there, with `onNode`) on every render and window resize. */
export function usePlaceAt(view: EditorView, pos: number, ref: RefObject<HTMLElement | null>, onNode = false): void {
  useLayoutEffect(() => {
    if (ref.current) place(view, pos, ref.current, onNode);
  });
  useEffect(() => {
    const again = () => {
      if (ref.current) place(view, pos, ref.current, onNode);
    };
    window.addEventListener('resize', again);
    return () => window.removeEventListener('resize', again);
  }, [view, pos, ref, onNode]);
}

/** Class of a popup the hook places: drawn once it is placed. */
export const PLACED = 'invisible absolute z-40';
