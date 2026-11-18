/** Where a floating bar goes beside a range on screen: above it, below it when there's no room, inside the bounds. */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Placed under the range rather than over it. */
  below: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));

/**
 * Centres `size` over `target`, `gap` away, kept inside `bounds` (all in one coordinate space). Null when the target
 * is out of the bounds altogether.
 */
export function placeBeside(target: Box, size: Size, bounds: Box, gap = 8): Placement | null {
  if (target.bottom < bounds.top || target.top > bounds.bottom) return null;
  const centre = (target.left + target.right) / 2;
  const left = clamp(centre - size.width / 2, bounds.left, bounds.right - size.width);
  const above = target.top - gap - size.height;
  const below = target.bottom + gap;
  if (above >= bounds.top) return { left, top: above, below: false };
  if (below + size.height <= bounds.bottom) return { left, top: below, below: true };
  // Neither fits (the range fills the view): stay in sight at the top.
  return { left, top: clamp(above, bounds.top, bounds.bottom - size.height), below: false };
}

/** The overlap of two boxes, shrunk by `inset` on every side. */
export function intersect(a: Box, b: Box, inset = 0): Box {
  return {
    left: Math.max(a.left, b.left) + inset,
    top: Math.max(a.top, b.top) + inset,
    right: Math.min(a.right, b.right) - inset,
    bottom: Math.min(a.bottom, b.bottom) - inset,
  };
}
