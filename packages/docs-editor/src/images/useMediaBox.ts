/** Where a picture is drawn, against the page the layer is positioned on, kept up as it loads, moves or resizes. */
import { useLayoutEffect, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { useEditor } from '../editor/format.ts';
import { mediaElement } from './actions.ts';

export interface MediaBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Room the picture has: its column, or its table cell. */
  room: number;
}

const sameBox = (a: MediaBox | null, b: MediaBox | null) =>
  a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height && a.room === b.room);

function measure(view: EditorView, element: HTMLElement): MediaBox | null {
  const page = view.dom.closest('.doc-page');
  if (!page || !element.isConnected) return null;
  const box = element.getBoundingClientRect();
  const origin = page.getBoundingClientRect();
  if (!box.width) return null;
  const column = element.closest('td,th') ?? view.dom;
  const style = getComputedStyle(column);
  const room = column.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  return { left: box.left - origin.left, top: box.top - origin.top, width: box.width, height: box.height, room };
}

/** The box of the picture at `pos` (null: none), measured again after every edit. */
export function useMediaBox(view: EditorView | null, pos: number | null): { box: MediaBox | null; element: HTMLElement | null } {
  const state = useEditor(hold => hold.state);
  const [box, setBox] = useState<MediaBox | null>(null);
  const element = view && pos !== null && !view.isDestroyed ? mediaElement(view, pos) : null;

  useLayoutEffect(() => {
    if (!view || !element) {
      setBox(null);
      return;
    }
    const update = () => {
      const next = measure(view, element);
      setBox(before => (sameBox(before, next) ? before : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(view.dom);
    const img = element.querySelector('img');
    img?.addEventListener('load', update);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      img?.removeEventListener('load', update);
      window.removeEventListener('resize', update);
    };
  }, [view, element, state]);

  return { box: element ? box : null, element };
}
