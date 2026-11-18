/** The picture tools over the text: the bar over a selected picture, its side handles, and crop mode. */
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { useDocs } from '../app/store.ts';
import { useEditor } from '../editor/format.ts';
import { schema } from '../editor/schema.ts';
import { selectedTarget } from './actions.ts';
import { CropOverlay } from './CropOverlay.tsx';
import { ImageToolbar } from './ImageToolbar.tsx';
import { ResizeHandles } from './ResizeHandles.tsx';
import type { ImageTarget } from './store.ts';
import { useImages } from './store.ts';
import { useMediaBox } from './useMediaBox.ts';

/** True on a mouse or pen, where side handles can be aimed at. */
function useFinePointer(): boolean {
  const query = typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)') : null;
  const [coarse, setCoarse] = useState(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const change = () => setCoarse(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, [query?.media]);
  return !coarse;
}

/** The picture the pointer is over, in the text. */
function useHoveredMedia(view: EditorView | null): [HTMLElement | null, (element: HTMLElement | null) => void] {
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!view) return;
    const over = (event: PointerEvent) => {
      const at = event.target instanceof Element ? event.target.closest<HTMLElement>('.doc-media') : null;
      setHovered(at && view.dom.contains(at) ? at : null);
    };
    const leave = (event: PointerEvent) => {
      const next = event.relatedTarget instanceof Element ? event.relatedTarget : null;
      if (!next?.closest('.doc-image-handle')) setHovered(null);
    };
    view.dom.addEventListener('pointerover', over);
    view.dom.addEventListener('pointerleave', leave);
    return () => {
      view.dom.removeEventListener('pointerover', over);
      view.dom.removeEventListener('pointerleave', leave);
      setHovered(null);
    };
  }, [view]);
  return [hovered, setHovered];
}

function targetOf(view: EditorView, tab: string, element: HTMLElement): ImageTarget | null {
  if (!element.isConnected) return null;
  let pos: number;
  try {
    pos = view.posAtDOM(element, 0);
  } catch {
    return null;
  }
  for (const at of [pos, pos - 1]) {
    const node = at >= 0 ? view.state.doc.nodeAt(at) : null;
    if (node?.type === schema.nodes.media && view.nodeDOM(at) === element) return { tab, pos: at, blob: node.attrs.blob };
  }
  return null;
}

export function ImageLayer(): ReactNode {
  const view = useEditor(hold => hold.view);
  const state = useEditor(hold => hold.state);
  const tab = useEditor(hold => hold.tab);
  const focused = useEditor(hold => hold.focused);
  const writable = useDocs(docs => docs.writable);
  const crop = useImages(images => images.crop);
  const altOpen = useImages(images => images.alt !== null);
  const [barActive, setBarActive] = useState(false);
  const [hovered, setHovered] = useHoveredMedia(view);
  const fine = useFinePointer();

  const selected = useMemo(() => (state ? selectedTarget() : null), [state]);
  const pointed = useMemo(() => (view && tab && hovered ? targetOf(view, tab, hovered) : null), [view, tab, hovered, state]);
  const target = selected ?? pointed;
  const { box, element } = useMediaBox(view, target?.pos ?? null);

  useEffect(() => {
    if (!selected) setBarActive(false);
  }, [selected]);

  if (crop) return <CropOverlay session={crop} />;
  if (!target || !box || !element) return null;
  // A reader's view never takes focus, so its bar shows while the picture is selected.
  const showBar = !!selected && (focused || barActive || altOpen || !writable);
  return (
    <>
      {writable && fine ? (
        <div onPointerLeave={event => event.relatedTarget instanceof Node && element.contains(event.relatedTarget) ? undefined : setHovered(null)}>
          <ResizeHandles target={target} box={box} element={element} />
        </div>
      ) : null}
      {showBar && selected ? <ImageToolbar target={selected} box={box} writable={writable} onMenu={setBarActive} /> : null}
    </>
  );
}
