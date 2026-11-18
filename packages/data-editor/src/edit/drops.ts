/** Where a dragged card can land, and hover with intent (pure: plain boxes, no DOM). */

import { inflateBox, rectOf, type Box, type Rect } from './geometry.ts';

/** Where a lifted card can land: between cards in a column (`gap`), or on a cell of a grid (`cell`). */
export interface CardDropBoxes {
  kind: 'cell' | 'gap';
  boxes: Rect[];
}

export interface CardDropMark {
  kind: 'cell' | 'gap' | 'extent' | 'copy';
  land: boolean;
  box: Rect;
}

export const CARD_LIFT_ATTRIBUTE = 'data-dash-lift';
export const CARD_DRAG_THRESHOLD = 8;
export const CARD_DROP_SLACK = 28;
export const CARD_SCROLL_EDGE = 56;
export const CARD_SHIFT_MS = 200;

/** The Context Menu key, or Shift+F10. */
export const isContextMenuKey = (event: Pick<KeyboardEvent, 'key' | 'shiftKey'>): boolean => event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);

/** A start kept 8px inside the view. */
export const clampToViewport = (start: number, size: number, viewStart: number, viewSize: number): number =>
  Math.max(viewStart + 8, Math.min(start, viewStart + viewSize - 8 - size));

/** Cells when the cards sit side by side (a grid), else the gaps of a column with the dragged card (`from`) taken out. */
export function findCardDrops(boxes: readonly Rect[], from: number, gap: number): CardDropBoxes {
  if (boxes.some((box, index) => box.top < (boxes[index - 1]?.bottom ?? -Infinity) - 4)) return { kind: 'cell', boxes: [...boxes] };
  const others = boxes.filter((_box, index) => index !== from);
  return {
    kind: 'gap',
    boxes: boxes.flatMap((_box, index) => {
      const above = others[index - 1];
      const below = others[index];
      const near = below ?? above;
      if (near === undefined) return [];
      return [rectOf({ left: near.left, top: ((above?.bottom ?? near.top - gap) + (below?.top ?? near.bottom + gap)) / 2 - 1, width: near.width, height: 2 })];
    }),
  };
}

/** The drop nearest the pointer: along the row the pointer is in when there is one, else straight-line. */
export function findNearestDrop(boxes: readonly Rect[], x: number, y: number, rowSlack: number): number | null {
  if (boxes.length === 0) return null;
  const distances = boxes.map((box) => ({ x: Math.max(box.left - x, 0, x - box.right), y: Math.max(box.top - y, 0, y - box.bottom) }));
  const inRow = distances.some((distance) => distance.y <= rowSlack);
  const scores = distances.map((distance) => (!inRow ? Math.hypot(distance.x, distance.y) : distance.y <= rowSlack ? distance.x : Infinity));
  return scores.indexOf(Math.min(...scores));
}

/** The marks a drag shows: every drop (the landing one lit) and the parent's extent unless it fills the view. */
export function collectDropMarks(parentBox: Rect, view: Pick<Box, 'top' | 'height'>, { kind, boxes }: CardDropBoxes, from: number, land: number | null): CardDropMark[] {
  const marks = boxes.map((box, index): CardDropMark => ({ kind, land: index === land, box })).filter((_mark, index) => kind === 'cell' || index !== from);
  if (parentBox.top - 8 < view.top && parentBox.bottom + 8 > view.top + view.height) return marks;
  return [{ kind: 'extent', land: false, box: inflateBox(parentBox, 8) }, ...marks];
}

/** Hover with intent: the target settles after a short dwell, sooner when the pointer slows down. */
export interface HoverIntent<T extends Element> {
  move(target: T | null, x: number, y: number, time: number): void;
  leave(): void;
  press(): void;
  scrolled(read: () => T | null): void;
}

interface HoverSample {
  x: number;
  y: number;
  t: number;
}

/** How long to dwell before a target settles: longer when moving out of a piece into the one holding it. */
export const hoverDwell = (enteringParent: boolean): number => (enteringParent ? 220 : 80);

export function createHoverIntent<T extends Element = Element>(onSettle: (target: T | null) => void): HoverIntent<T> {
  let samples: HoverSample[] = [];
  let current: T | null = null;
  let enteredAt = 0;
  let previous: T | null = null;
  let settled: T | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = (target: T | null): void => {
    clearTimeout(timer);
    if (target === settled) return;
    settled = target;
    onSettle(target);
  };
  return {
    move(target, x, y, time) {
      samples.push({ x, y, t: time });
      samples = samples.filter((sample, index) => index >= samples.length - 2 || sample.t >= time - 50);
      const first = samples[0];
      const from = first !== undefined && first.t >= time - 100 ? first : { x, y, t: time };
      if (target !== current) {
        previous = current ?? previous;
        current = target;
        enteredAt = time;
      }
      settle(target === settled ? target : null);
      if (target === null || target === settled) return;
      const slow = from.t < time && Math.hypot(x - from.x, y - from.y) <= 0.4 * (time - from.t);
      const wait = enteredAt + hoverDwell(previous !== null && previous !== target && target.contains(previous)) - time;
      timer = setTimeout(() => settle(target.isConnected ? target : null), Math.max(wait, slow ? 0 : 100));
    },
    leave() {
      samples = [];
      current = null;
      previous = null;
      settle(null);
    },
    press: () => clearTimeout(timer),
    scrolled(read) {
      settle(null);
      if (samples.length > 0) timer = setTimeout(() => settle(read()), 100);
    },
  };
}
