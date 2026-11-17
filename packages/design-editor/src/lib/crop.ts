/**
 * Image crop geometry. A crop is written as the element's
 * `clip-path: inset(top right bottom left)` in px: the element keeps its
 * layout box, and the parts outside the crop frame are cut away. The crop
 * editor drags one of eight handles (edges and corners) or the frame itself.
 */

/** Crop insets from each edge, element px. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A crop handle, or the whole frame. */
export type CropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'move';

export const CROP_HANDLES: readonly Exclude<CropHandle, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Smallest crop frame kept, px. */
export const MIN_CROP = 8;

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** One length of an `inset()`, in px of `size`; NaN when not a length. */
function length(text: string, size: number): number {
  const match = /^(-?\d*\.?\d+)(px|%)?$/.exec(text.trim());
  if (!match) return Number.NaN;
  const n = Number(match[1]);
  if (match[2] === '%') return (n / 100) * size;
  if (!match[2] && n !== 0) return Number.NaN;
  return n;
}

/**
 * Reads `clip-path: inset(…)` (one to four lengths, px or %, a `round`
 * part ignored) into insets of a `width` × `height` element. Anything else
 * reads as no crop.
 */
export function parseInset(clipPath: string | undefined, width: number, height: number): Insets {
  const match = /^\s*inset\(([^)]*)\)\s*$/i.exec(clipPath ?? '');
  if (!match) return NO_INSETS;
  const parts = match[1]!.split(/\s+round\s+/i)[0]!.trim().split(/\s+/);
  if (parts.length < 1 || parts.length > 4) return NO_INSETS;
  const [t, r = t, b = t, l = r] = parts as [string, string?, string?, string?];
  const out = { top: length(t, height), right: length(r!, width), bottom: length(b!, height), left: length(l!, width) };
  if (Object.values(out).some((n) => !Number.isFinite(n))) return NO_INSETS;
  return clampInsets(out, width, height);
}

/** Keeps insets inside the element, with at least {@link MIN_CROP} px of frame. */
export function clampInsets(insets: Insets, width: number, height: number, min = MIN_CROP): Insets {
  const clamp = (n: number, max: number) => Math.max(0, Math.min(Math.max(0, max), n));
  const left = clamp(insets.left, width - min);
  const right = clamp(insets.right, width - min - left);
  const top = clamp(insets.top, height - min);
  const bottom = clamp(insets.bottom, height - min - top);
  return { top, right, bottom, left };
}

/** The `clip-path` value of insets (`null`: no crop). */
export function formatInset(insets: Insets): string | null {
  const r = (n: number) => `${Math.round(n)}px`;
  const rounded = [insets.top, insets.right, insets.bottom, insets.left].map(Math.round);
  if (rounded.every((n) => n === 0)) return null;
  return `inset(${[insets.top, insets.right, insets.bottom, insets.left].map(r).join(' ')})`;
}

/**
 * Drags a handle by `dx`,`dy` (element px) from the insets the drag started
 * with. Edges move their side; corners two sides; `move` slides the frame,
 * keeping its size. `shift` on a corner keeps the frame's aspect ratio.
 */
export function dragCrop(start: Insets, handle: CropHandle, dx: number, dy: number, width: number, height: number, shift = false): Insets {
  if (handle === 'move') {
    const frameW = width - start.left - start.right;
    const frameH = height - start.top - start.bottom;
    const left = Math.max(0, Math.min(width - frameW, start.left + dx));
    const top = Math.max(0, Math.min(height - frameH, start.top + dy));
    return { left, top, right: width - frameW - left, bottom: height - frameH - top };
  }
  let { top, right, bottom, left } = start;
  if (shift && handle.length === 2) {
    // Keep the aspect: follow the larger relative change.
    const frameW = width - left - right;
    const frameH = height - top - bottom;
    const sx = handle.includes('e') ? dx : -dx;
    const sy = handle.includes('s') ? dy : -dy;
    const scale = Math.abs(sx / frameW) > Math.abs(sy / frameH) ? sx / frameW : sy / frameH;
    dx = (handle.includes('e') ? 1 : -1) * frameW * scale;
    dy = (handle.includes('s') ? 1 : -1) * frameH * scale;
  }
  if (handle.includes('n')) top = start.top + dy;
  if (handle.includes('s')) bottom = start.bottom - dy;
  if (handle.includes('w')) left = start.left + dx;
  if (handle.includes('e')) right = start.right - dx;
  // Keep the opposite side where it was when a side runs into the minimum.
  if (handle.includes('n')) top = Math.min(top, height - bottom - MIN_CROP);
  if (handle.includes('w')) left = Math.min(left, width - right - MIN_CROP);
  return clampInsets({ top, right, bottom, left }, width, height);
}
