/** Plain boxes and points for edit mode's placement maths (pure: no DOM). */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type Rect = Box & Edges;

export const rectOf = ({ left, top, width, height }: Box): Rect => ({ left, top, width, height, right: left + width, bottom: top + height });

export const boxOf = ({ left, top, width, height }: Box): Box => ({ left, top, width, height });

export const inflateBox = (box: Box, by: number): Rect => rectOf({ left: box.left - by, top: box.top - by, width: box.width + 2 * by, height: box.height + 2 * by });

export const isPointInBox = (box: Box, x: number, y: number, slackX: number, slackY: number = slackX): boolean =>
  x >= box.left - slackX && x <= box.left + box.width + slackX && y >= box.top - slackY && y <= box.top + box.height + slackY;

export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

export const intersectsVertically = (rect: Pick<Edges, 'top' | 'bottom'>, room: Box): boolean => rect.bottom >= room.top && rect.top <= room.top + room.height;

export const boxesOverlap = (a: Edges, b: Edges): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

export const boxContains = (outer: Edges, inner: Edges): boolean => inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;
