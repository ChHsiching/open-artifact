/**
 * The source marks: while the page shows its sources, a hovered or picked
 * source-backed element gets a mark, and after a short dwell (or keyboard
 * focus on a source stop) a tip names its source. `useLinedMarks` also
 * outlines rule and bulk source elements for edit mode's marks.
 */

import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MARK_SOURCE_ATTRIBUTE } from '../page/sources.ts';
import { createHoverIntent } from './drops.ts';
import { rectOf } from './geometry.ts';
import { EDIT_TIP_DELAY, pickTipSide } from './layer.ts';
import { EditMark, EditTipView, addTrustedWindowListener } from './marks.tsx';
import { LINED_RULE_ATTRIBUTE, getPieceRect, getScrollContainer, getViewportBounds, isTextPiece, type PagePiece } from './pieces.ts';

export const BULK_SOURCE_ATTRIBUTE = 'data-dash-bulk';
export const LINED_ATTRIBUTE = 'data-dash-lined';
export const SOURCE_LIT_ATTRIBUTE = 'data-source-lit';

/** The source-backed element under a pointer target, or null. */
export type SourceMarkAt = (target: Element) => Element | null;
/** A source-backed element's source name, or null when it has none to show. */
export type SourceNameOf = (target: Element) => string | null;

export interface SourceMarksLayerProps {
  root: Element;
  /** Default: the nearest element with a source mark. */
  markAt?: SourceMarkAt;
  sourceOf?: SourceNameOf;
}

interface SourceMarkTip {
  at: Element;
  words: ReactNode;
}

const drawingOf = (element: Element | null): PagePiece | null => (element === null ? null : { el: element, kind: 'drawing' });

const sourceGroundOf = (element: Element): string | undefined =>
  element.getAttribute(LINED_RULE_ATTRIBUTE) ?? element.closest(`[${BULK_SOURCE_ATTRIBUTE}]`)?.getAttribute(BULK_SOURCE_ATTRIBUTE) ?? undefined;

const defaultMarkAt: SourceMarkAt = (target) => target.closest(`[${MARK_SOURCE_ATTRIBUTE}]`);
const noSourceName: SourceNameOf = () => null;

/** Outlines the rule and bulk source elements of the given pieces (and the rules inside a text drawing). */
export function useLinedMarks(root: Element, pieces: readonly (PagePiece | null | undefined)[]): void {
  useLayoutEffect(() => {
    const lined = new Set<Element>();
    for (const piece of pieces) {
      if (piece === null || piece === undefined || piece.kind === 'words') continue;
      if (piece.el.hasAttribute(LINED_RULE_ATTRIBUTE) || piece.el.hasAttribute(BULK_SOURCE_ATTRIBUTE)) lined.add(piece.el);
      if (piece.kind === 'drawing' && isTextPiece(piece)) for (const rule of piece.el.querySelectorAll(`[${LINED_RULE_ATTRIBUTE}]`)) lined.add(rule);
    }
    for (const element of root.querySelectorAll(`[${LINED_ATTRIBUTE}]`)) if (!lined.has(element)) element.removeAttribute(LINED_ATTRIBUTE);
    for (const element of lined) if (!element.hasAttribute(LINED_ATTRIBUTE)) element.setAttribute(LINED_ATTRIBUTE, '');
  });
  useEffect(
    () => () => {
      for (const element of root.querySelectorAll(`[${LINED_ATTRIBUTE}]`)) element.removeAttribute(LINED_ATTRIBUTE);
    },
    [root],
  );
}

export function SourceMarksLayer({ root, markAt = defaultMarkAt, sourceOf = noSourceName }: SourceMarksLayerProps): ReactNode {
  const [hovered, setHovered] = useState<Element | null>(null);
  const [tip, setTip] = useState<SourceMarkTip | null>(null);
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const lastHoveredRef = useRef<Element | null>(null);
  const propsRef = useRef({ markAt, sourceOf });
  propsRef.current = { markAt, sourceOf };

  useEffect(() => {
    let frame = 0;
    const schedule = (): void => {
      if (frame === 0)
        frame = requestAnimationFrame(() => {
          frame = 0;
          redraw();
        });
    };
    let pointer: { x: number; y: number } | null = null;
    let tipped: Element | null = null;
    let tipTimer: ReturnType<typeof setTimeout> | undefined;
    const hover = createHoverIntent(setHovered);
    const tipFor = (element: Element | null): void => {
      if (element === tipped) return;
      tipped = element;
      clearTimeout(tipTimer);
      setTip(null);
      const name = element === null ? null : propsRef.current.sourceOf(element);
      if (element !== null && name !== null) tipTimer = setTimeout(() => setTip({ at: element, words: name }), EDIT_TIP_DELAY);
    };
    const leave = (): void => {
      pointer = null;
      hover.leave();
      tipFor(null);
    };
    const unlit = (element: Element | null): Element | null => (element === null || element.hasAttribute(SOURCE_LIT_ATTRIBUTE) ? null : element);
    const markUnder = (target: EventTarget | null): Element | null => (target instanceof Element && root.contains(target) ? propsRef.current.markAt(target) : null);
    const onPointerMove = (event: PointerEvent): void => {
      if (event.buttons !== 0) return;
      if (!(event.target instanceof Node) || !root.contains(event.target)) {
        leave();
        return;
      }
      pointer = { x: event.clientX, y: event.clientY };
      const mark = unlit(markUnder(event.target));
      hover.move(mark, event.clientX, event.clientY, event.timeStamp);
      tipFor(mark);
    };
    const onScroll = (): void => {
      tipFor(null);
      hover.scrolled(() => (pointer === null ? null : unlit(markUnder(document.elementFromPoint(pointer.x, pointer.y)))));
      schedule();
    };
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: [SOURCE_LIT_ATTRIBUTE] });
    const resizes = new ResizeObserver(schedule);
    resizes.observe(root);
    const unlisten = [
      addTrustedWindowListener('focusin', (event) => {
        const stop = event.target instanceof Element && event.target.matches('[data-dash-stop]:focus-visible') ? event.target : null;
        const name = stop === null ? null : propsRef.current.sourceOf(stop);
        clearTimeout(tipTimer);
        tipped = stop;
        setTip(stop !== null && name !== null ? { at: stop, words: name } : null);
      }),
      addTrustedWindowListener('focusout', () => {
        if (tipped?.matches('[data-dash-stop]') === true) tipFor(null);
      }),
      addTrustedWindowListener('pointermove', onPointerMove),
      addTrustedWindowListener('pointerout', (event) => {
        if (event.relatedTarget === null) leave();
      }),
      addTrustedWindowListener('scroll', onScroll),
      addTrustedWindowListener('resize', schedule),
      addTrustedWindowListener('pointerdown', () => {
        hover.press();
        tipFor(null);
      }),
    ];
    return () => {
      for (const stop of unlisten) stop();
      mutations.disconnect();
      resizes.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(tipTimer);
      leave();
    };
  }, [root]);

  const room = getViewportBounds(getScrollContainer(root));
  const picked = drawingOf(root.querySelector(`[${SOURCE_LIT_ATTRIBUTE}]`));
  if (hovered !== null) lastHoveredRef.current = hovered;
  const over = lastHoveredRef.current?.isConnected === true && lastHoveredRef.current !== picked?.el ? drawingOf(lastHoveredRef.current) : null;
  useLinedMarks(root, [drawingOf(hovered), picked]);
  const tipBox = tip?.at.isConnected === true ? rectOf(getPieceRect({ el: tip.at, kind: 'drawing' })) : null;
  const strip = document.querySelector('[data-mc-strip]')?.getBoundingClientRect();
  const tipSide = tipBox === null ? null : pickTipSide(tipBox, room, strip === undefined ? null : rectOf(strip));

  return createPortal(
    <div className="dash-edit-layer" data-sources="" data-uncommentable="" data-mc-chrome="" style={room}>
      {over !== null && <EditMark piece={over} look="over" on={hovered !== null} room={room} ground={sourceGroundOf(over.el)} />}
      {picked !== null && <EditMark piece={picked} look="picked" on room={room} ground={sourceGroundOf(picked.el)} />}
      {tipBox !== null && tipSide !== null && (
        <EditTipView box={tipBox} room={room} side={tipSide}>
          {tip?.words}
        </EditTipView>
      )}
    </div>,
    document.body,
  );
}
