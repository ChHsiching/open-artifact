/**
 * Pure geometry of element gestures: which elements a marquee selects and
 * where dragged flow elements land. Rects are world coordinates.
 */

import { intersects, type Rect } from '@open-artifact/design-core';
import type { ElementSelection } from '../state/view.ts';
import type { Address } from './ops.ts';

/** An element a marquee can select, with the world rect of each rendered instance. */
export interface MarqueeCandidate {
  tid: number;
  path: number[];
  rects: Rect[];
}

/** Where dragged flow elements would land. */
export interface FlowDrop {
  target: Address;
  position: 'before' | 'after' | 'last-child';
  /** The insertion line, in world coordinates (`null` when dropping into an empty container). */
  line: { x1: number; y1: number; x2: number; y2: number } | null;
  /** The container the elements move into, when it is not their parent (world coordinates). */
  outline?: Rect;
}

/** Siblings a flow drag can land next to, with how their parent lays them out. */
export interface FlowContext {
  board: string;
  siblings: { address: Address; rect: Rect }[];
  layout: 'row' | 'column' | 'grid';
  /** Where the dragged elements are now: dropping there changes nothing. */
  origin?: Rect[];
}

const contains = (outer: Rect, inner: Rect) => outer.x <= inner.x && outer.y <= inner.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

/**
 * Elements a marquee rect selects: touching it, or (deep) fully inside it
 * with their selected ancestors dropped.
 */
export function marqueeHits(candidates: readonly MarqueeCandidate[], rect: Rect, deep: boolean): ElementSelection[] {
  const hits: ElementSelection[] = [];
  for (const c of candidates) {
    const instance = c.rects.findIndex((r) => (deep ? contains(rect, r) : intersects(rect, r)));
    if (instance >= 0) hits.push({ tid: c.tid, path: c.path, instance });
  }
  if (!deep) return hits;
  const isPrefix = (a: number[], b: number[]) => a.length < b.length && a.every((v, i) => b[i] === v);
  return hits.filter((hit) => !hits.some((other) => isPrefix(hit.path, other.path)));
}

/** Toggles (Shift) or merges marquee hits into an earlier selection. */
export function combineSelection(initial: readonly ElementSelection[], hits: readonly ElementSelection[], toggle: boolean): ElementSelection[] {
  if (!toggle) return [...hits];
  const out = [...initial];
  for (const hit of hits) {
    const index = out.findIndex((item) => item.tid === hit.tid);
    if (index >= 0) out.splice(index, 1);
    else out.push(hit);
  }
  return out;
}

/** The landing place nearest a world point. */
export function flowDrop(context: FlowContext, point: { x: number; y: number }): FlowDrop | null {
  const inside = (r: Rect) => point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h;
  if (context.origin?.some(inside)) return null;
  let best: FlowContext['siblings'][number] | null = null;
  let distance = Infinity;
  for (const sibling of context.siblings) {
    const r = sibling.rect;
    const dx = Math.max(r.x - point.x, 0, point.x - (r.x + r.w));
    const dy = Math.max(r.y - point.y, 0, point.y - (r.y + r.h));
    const d = Math.hypot(dx, dy);
    if (d < distance) {
      distance = d;
      best = sibling;
    }
  }
  if (!best) return null;
  const r = best.rect;
  const horizontal = context.layout === 'row' || (context.layout === 'grid' && point.y >= r.y && point.y <= r.y + r.h);
  if (horizontal) {
    const before = point.x < r.x + r.w / 2;
    const x = before ? r.x : r.x + r.w;
    return { target: best.address, position: before ? 'before' : 'after', line: { x1: x, y1: r.y, x2: x, y2: r.y + r.h } };
  }
  const before = point.y < r.y + r.h / 2;
  const y = before ? r.y : r.y + r.h;
  return { target: best.address, position: before ? 'before' : 'after', line: { x1: r.x, y1: y, x2: r.x + r.w, y2: y } };
}
