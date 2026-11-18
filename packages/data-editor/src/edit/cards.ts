/**
 * The card mover: a card (a stored child of its parent) can be dragged (a
 * scaled copy follows the pointer and drop marks show where it lands),
 * stepped earlier or later, or deleted. Every move goes through the draft,
 * with a FLIP animation of the cards that shifted.
 */

import { announce } from '@open-artifact/editor-kit';
import { DRAW_ATTRIBUTE } from '../page/draw.ts';
import { MARK_SOURCE_ATTRIBUTE } from '../page/sources.ts';
import type { PageDraft } from './draft.ts';
import {
  CARD_DRAG_THRESHOLD,
  CARD_DROP_SLACK,
  CARD_LIFT_ATTRIBUTE,
  CARD_SCROLL_EDGE,
  CARD_SHIFT_MS,
  clampToViewport,
  collectDropMarks,
  findCardDrops,
  findNearestDrop,
  type CardDropMark,
} from './drops.ts';
import { isPointInBox, rectOf } from './geometry.ts';
import { cardMovedMessage } from './labels.ts';
import { asDrawingPiece, describePiece, getScrollContainer, getViewportRoom } from './pieces.ts';

/** The pointer-down a card drag starts from (a DOM or a React pointer event). */
export type CardPressEvent = Pick<PointerEvent, 'isTrusted' | 'button' | 'pointerId' | 'clientX' | 'clientY' | 'preventDefault'>;

export interface CardMoverInput {
  draft: PageDraft;
  root: Element;
  select(element: Element | null): void;
  marks(marks: CardDropMark[]): void;
}

export interface CardMover {
  press(event: CardPressEvent, target: EventTarget | null, selectOnClick: boolean): void;
  canStep(element: Element, step: number): boolean;
  step(element: Element, step: number): void;
  remove(element: Element): void;
  dragging(): boolean;
  stop(): void;
}

interface CardLift {
  follow(x: number, y: number): void;
  drop(land: boolean): void;
}

const px = (value: number): string => `${value}px`;

/** A copy of a card to follow the pointer: no ids, drawings or marks, its canvases painted. */
function cloneForLift(card: Element): HTMLElement | null {
  const copy = card.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return null;
  const dropped = (name: string): boolean => ['id', 'name', 'for', 'autoplay', DRAW_ATTRIBUTE].includes(name) || name.startsWith(MARK_SOURCE_ATTRIBUTE);
  for (const element of [copy, ...copy.querySelectorAll('*')]) for (const name of element.getAttributeNames().filter(dropped)) element.removeAttribute(name);
  for (const style of copy.querySelectorAll('style')) style.remove();
  copy.setAttribute(CARD_LIFT_ATTRIBUTE, 'copy');
  copy.setAttribute('inert', '');
  copy.setAttribute('aria-hidden', 'true');
  const canvases = card.querySelectorAll('canvas');
  copy.querySelectorAll('canvas').forEach((canvas, index) => {
    const source = canvases[index];
    if (source !== undefined && source.width > 0 && source.height > 0) canvas.getContext('2d')?.drawImage(source, 0, 0);
  });
  return copy;
}

export function createCardMover(input: CardMoverInput): CardMover {
  const { draft, root } = input;
  let pressing: AbortController | null = null;
  let lift: CardLift | null = null;
  let shiftRun = 0;
  const siblingsOf = (card: Element): Element[] =>
    [...(card.parentElement?.children ?? [])].filter((sibling) => draft.storedOf(sibling) !== null && getComputedStyle(sibling).display !== 'none');
  const measure = (cards: Element[]): Map<Element, DOMRect> => new Map(cards.map((card) => [card, card.getBoundingClientRect()]));
  const describe = (card: Element): string => describePiece(asDrawingPiece(card), root);

  const animateShift = (before: Map<Element, DOMRect>, reveal: Element | null): void => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const running: Promise<Animation>[] = [];
    const run = ++shiftRun;
    draft.hold(true);
    for (const [card, was] of reduced ? [] : before) {
      const now = card.getBoundingClientRect();
      if (now.width === 0 || (Math.abs(was.left - now.left) < 1 && Math.abs(was.top - now.top) < 1 && Math.abs(was.width - now.width) < 1)) continue;
      const from = `translate(${px(was.left - now.left)}, ${px(was.top - now.top)}) scale(${was.width / now.width}, ${was.height / now.height})`;
      running.push(card.animate({ transformOrigin: ['0 0', '0 0'], transform: [from, 'none'] }, { duration: CARD_SHIFT_MS, easing: 'cubic-bezier(.2, 0, 0, 1)' }).finished);
    }
    const finish = (): void => {
      if (run !== shiftRun || lift !== null) return;
      draft.hold(false);
      reveal?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    };
    void Promise.allSettled(running).then(() => setTimeout(finish));
  };

  const moveCard = (card: Element, siblings: Element[], index: number, before: Map<Element, DOMRect>, how: 'moved' | 'earlier' | 'later'): void => {
    const stored = draft.storedOf(card);
    const next = siblings.filter((sibling) => sibling !== card)[index];
    try {
      if (stored === null) return;
      draft.do({ place: stored, in: stored.parentNode, before: next === undefined ? null : draft.storedOf(next) }, 'moving');
      input.select(card);
      announce(cardMovedMessage(describe(card), how));
    } finally {
      animateShift(before, card);
    }
  };

  const endPress = (landing: boolean): void => {
    pressing?.abort();
    pressing = null;
    const lifted = lift;
    lift = null;
    lifted?.drop(landing);
  };

  const liftCard = (card: Element, x: number, y: number): CardLift | null => {
    const parent = card.parentElement;
    const copy = parent === null ? null : cloneForLift(card);
    if (parent === null || copy === null) return null;
    const siblings = siblingsOf(card);
    const from = siblings.indexOf(card);
    const box = card.getBoundingClientRect();
    const scale = Math.max(0.3, Math.min(0.8, 260 / box.width, 180 / box.height));
    const grip = { x: x - box.left, y: y - box.top };
    const scroller = getScrollContainer(root);
    const scrollTop = scroller?.scrollTop ?? 0;
    let pointerX = x;
    let pointerY = y;
    let land: number | null = null;
    Object.assign(copy.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      margin: '0',
      boxSizing: 'border-box',
      width: px(box.width),
      height: px(box.height),
      transformOrigin: `${px(grip.x)} ${px(grip.y)}`,
    });
    parent.append(copy);
    card.setAttribute(CARD_LIFT_ATTRIBUTE, 'home');
    const veil = document.body.appendChild(document.createElement('div'));
    veil.className = 'dash-edit-veil';
    const frame = copy.offsetParent ?? root;
    copy.style.scale = String(scale);
    input.select(card);
    draft.hold(true);
    getSelection()?.removeAllRanges();
    const place = (): void => {
      const view = getViewportRoom(scroller);
      const parentBox = parent.getBoundingClientRect();
      const frameBox = frame.getBoundingClientRect();
      const left = clampToViewport(pointerX - grip.x * scale, box.width * scale, view.left, view.width) - grip.x * (1 - scale);
      const top = clampToViewport(pointerY - grip.y * scale, box.height * scale, view.top, view.height) - grip.y * (1 - scale);
      copy.style.translate = `${px(left - frameBox.left - frame.clientLeft + frame.scrollLeft)} ${px(top - frameBox.top - frame.clientTop + frame.scrollTop)}`;
      const out = !isPointInBox(view, pointerX, pointerY, 12, 48) || !isPointInBox(parentBox, pointerX, pointerY, CARD_DROP_SLACK);
      veil.toggleAttribute('data-out', out);
      copy.style.opacity = out ? '0.55' : '';
      land = null;
      if (out) {
        input.marks([]);
        return;
      }
      const gap = parseFloat(getComputedStyle(parent).rowGap) || 12;
      const drops = findCardDrops(
        siblings.map((sibling) => rectOf(sibling.getBoundingClientRect())),
        from,
        gap,
      );
      const nearest = isPointInBox(card.getBoundingClientRect(), pointerX, pointerY, 8) ? from : findNearestDrop(drops.boxes, pointerX, pointerY, gap / 2 + 1);
      if (nearest !== from) land = nearest;
      input.marks([...collectDropMarks(rectOf(parentBox), view, drops, from, land), { kind: 'copy', land: false, box: rectOf(copy.getBoundingClientRect()) }]);
    };
    let frameRequest = 0;
    const autoScroll = (): void => {
      const view = getViewportRoom(scroller);
      const push = Math.max(pointerY - (view.top + view.height - CARD_SCROLL_EDGE), 0) - Math.max(view.top + CARD_SCROLL_EDGE - pointerY, 0);
      if (push !== 0 && scroller !== null) {
        scroller.scrollTop += Math.max(-14, Math.min(14, push / 4));
        place();
      }
      frameRequest = requestAnimationFrame(autoScroll);
    };
    frameRequest = requestAnimationFrame(autoScroll);
    const unsubscribe = draft.subscribe(() => endPress(false));
    return {
      follow(nextX, nextY) {
        pointerX = nextX;
        pointerY = nextY;
        place();
      },
      drop(landing) {
        const target = landing ? land : null;
        const before = measure(target === null ? [] : siblings).set(card, copy.getBoundingClientRect());
        unsubscribe();
        cancelAnimationFrame(frameRequest);
        copy.remove();
        card.removeAttribute(CARD_LIFT_ATTRIBUTE);
        veil.remove();
        input.marks([]);
        if (target !== null) {
          moveCard(card, siblings, target, before, 'moved');
          return;
        }
        if (scroller !== null) scroller.scrollTop = scrollTop;
        animateShift(before, null);
      },
    };
  };

  const canStep = (card: Element, step: number): boolean => {
    const siblings = siblingsOf(card);
    const index = siblings.indexOf(card);
    return index >= 0 && siblings[index + step] !== undefined;
  };

  return {
    press(event, target, selectOnClick) {
      if (!event.isTrusted || event.button !== 0 || !(target instanceof HTMLElement) || draft.storedOf(target) === null) return;
      endPress(false);
      event.preventDefault();
      window.focus();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      pressing = new AbortController();
      const { signal } = pressing;
      const listen = <K extends 'pointermove' | 'pointerup' | 'pointercancel' | 'keydown'>(type: K, handler: (windowEvent: WindowEventMap[K]) => void): void =>
        window.addEventListener(
          type,
          (windowEvent) => {
            if (windowEvent.isTrusted && (!(windowEvent instanceof PointerEvent) || windowEvent.pointerId === event.pointerId)) handler(windowEvent);
          },
          { signal, capture: true },
        );
      listen('pointermove', (move) => {
        if (move.buttons === 0) {
          endPress(false);
          return;
        }
        if (lift === null && Math.hypot(move.clientX - event.clientX, move.clientY - event.clientY) > CARD_DRAG_THRESHOLD) lift = liftCard(target, event.clientX, event.clientY);
        lift?.follow(move.clientX, move.clientY);
      });
      listen('pointerup', () => {
        if (lift === null && selectOnClick) input.select(target);
        endPress(true);
      });
      listen('pointercancel', () => endPress(false));
      listen('keydown', (key) => {
        if (key.key !== 'Escape' || lift === null) return;
        key.preventDefault();
        key.stopPropagation();
        endPress(false);
      });
    },
    canStep,
    step(card, step) {
      if (!canStep(card, step)) return;
      const siblings = siblingsOf(card);
      moveCard(card, siblings, siblings.indexOf(card) + step, measure(siblings), step < 0 ? 'earlier' : 'later');
    },
    remove(card) {
      const stored = draft.storedOf(card);
      if (stored === null) return;
      const before = measure(siblingsOf(card));
      announce(cardMovedMessage(describe(card), 'deleted'));
      input.select(null);
      draft.do({ place: stored, in: null, before: null }, 'deleting');
      animateShift(before, null);
    },
    dragging: () => lift !== null,
    stop() {
      endPress(false);
      shiftRun++;
      draft.hold(false);
    },
  };
}
