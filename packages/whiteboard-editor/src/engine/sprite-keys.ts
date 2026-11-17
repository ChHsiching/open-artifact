/**
 * Sprite texture keys: what names a sprite's texture (the element, a hash
 * of everything its picture depends on, and its raster scale bucket), so an
 * edit or a new zoom asks for a new texture and an unchanged element reuses
 * its own. Painting them is `sprites.ts`.
 */

import type { BoardElement, ColorScheme, ElementId } from '@open-artifact/whiteboard-core';
import type { SpritePlace } from './items.ts';

/** Smallest and largest raster scale of a sprite (device pixels per board unit). */
export const SPRITE_SCALE_RANGE = { min: 1 / 16, max: 4 } as const;

/** The raster scale bucket for a zoom: the power of two at or above zoom × pixel ratio, within range. */
export function spriteBucket(zoom: number, pixelRatio: number): number {
  const target = Math.min(SPRITE_SCALE_RANGE.max, Math.max(SPRITE_SCALE_RANGE.min, zoom * pixelRatio));
  return 2 ** Math.ceil(Math.log2(target) - 1e-9);
}

/** FNV-1a over a string, as base-36. */
function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** What a sprite's look depends on besides the element itself. */
export interface SpriteDeps {
  scheme: ColorScheme;
  /** Fill behind free text. */
  backdrop: string | undefined;
}

/**
 * A hash of everything an element's sprite looks like: the element (its
 * place left out where the sprite does not depend on it; long sources
 * abbreviated), its sprite box size and the deps.
 */
export function spriteHash(element: BoardElement, place: SpritePlace, deps: SpriteDeps): string {
  const absolute = element.type === 'arrow' || element.type === 'container';
  const text = JSON.stringify(element, (key, value: unknown) => {
    if (!absolute && (key === 'x' || key === 'y')) return undefined;
    if (key === 'points') return undefined;
    if (key === 'src' && typeof value === 'string' && value.length > 256) return `${value.length}:${value.slice(0, 96)}:${value.slice(-96)}`;
    return value;
  });
  const box = absolute ? `${place.box.x},${place.box.y},` : '';
  return hashText(`${deps.scheme}|${deps.backdrop ?? ''}|${box}${place.box.w}x${place.box.h}|${text}`);
}

/** A sprite texture key. */
export function spriteKey(id: ElementId, hash: string, bucket: number): string {
  return `s|${id}|${hash}|${bucket}`;
}

/** The parts of a sprite texture key, or `undefined` for another key. */
export function parseSpriteKey(key: string): { id: ElementId; hash: string; bucket: number } | undefined {
  const parts = key.split('|');
  if (parts.length !== 4 || parts[0] !== 's') return undefined;
  const bucket = Number(parts[3]);
  return Number.isFinite(bucket) ? { id: parts[1]!, hash: parts[2]!, bucket } : undefined;
}
