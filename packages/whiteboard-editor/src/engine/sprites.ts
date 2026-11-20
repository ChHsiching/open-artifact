/**
 * Element sprites for the canvas engine: text (and whole pictures) painted
 * in TypeScript with the export painters, uploaded as textures under the
 * keys of `sprite-keys.ts`. The engine asks for keys it lacks
 * (`textureNeeded`) only for items in view; they are painted a few
 * milliseconds per frame. Pictures wait for their image (or icon) and are
 * painted again once it arrives; a drawing in a textured look is painted
 * plain until its look is painted, and again when the settled paint scale
 * moves.
 */

import type { CanvasEngine } from '@open-artifact/canvas-engine';
import { iconStickerOf, imageDrawingLook, type BoardElement, type ColorScheme, type ElementId, type ElementMeasures, type ElementsById } from '@open-artifact/whiteboard-core';
import { drawnImagePen, drawnImageSrc } from '../export/drawn-svg.ts';
import { isRasterLook } from '../lib/drawing-looks.ts';
import { lookRequestKey, onLookPainted, paintedLookUrl, requestDrawingLook } from '../services/drawing-looks.ts';
import { useDrawingLooks } from '../state/drawing-looks.ts';
import { emojiArtKey, stickerEmoji } from '../lib/noto-emoji.ts';
import { loadBoardFontsWithTimeout, loadRasterImages, loadStickerIcons } from '../export/images.ts';
import { paintElementSprite, type SectionTitleSpot } from '../export/paint.ts';
import type { SpritePlace } from './items.ts';
import { parseSpriteKey } from './sprite-keys.ts';

/** Longest sprite side, pixels. */
export const MAX_SPRITE_PX = 2048;
/** Time spent painting sprites per frame, ms. */
export const SPRITE_FRAME_BUDGET_MS = 6;

/** What the painter needs to look up for a key. */
export interface SpriteSource {
  /** The element as shown now, its sprite place and current hash; `undefined` when it is gone. */
  current(id: ElementId): { element: BoardElement; place: SpritePlace; hash: string } | undefined;
  byId(): ElementsById;
  measures(): ElementMeasures;
  scheme(): ColorScheme;
  backdrops(): ReadonlyMap<string, string>;
  /** Where a section's title is drawn (see `sectionTitleSpot`). */
  titleSpot(element: BoardElement): SectionTitleSpot | undefined;
  faceName(personId: string): string | undefined;
}

/**
 * Paints sprites the engine asks for, a few per frame, and loads the
 * pictures and icon art they need.
 */
export class SpritePainter {
  readonly #engine: CanvasEngine;
  readonly #source: SpriteSource;
  readonly #queue = new Set<string>();
  readonly #images = new Map<string, HTMLImageElement | null>();
  readonly #icons = new Map<string, HTMLImageElement>();
  readonly #iconMisses = new Set<string>();
  /** Keys waiting for a picture, by source. */
  readonly #waiting = new Map<string, Set<string>>();
  /** Keys waiting for a painted look, by look key. */
  readonly #lookWaiting = new Map<string, Set<string>>();
  /** Keys painted with (or waiting for) a painted look, repainted when the paint scale moves. */
  readonly #looked = new Set<string>();
  readonly #stops: (() => void)[] = [];
  #frame = 0;
  #ready = false;
  #stopped = false;

  constructor(engine: CanvasEngine, source: SpriteSource) {
    this.#engine = engine;
    this.#source = source;
    void loadBoardFontsWithTimeout().then(() => {
      this.#ready = true;
      this.#schedule();
    });
    this.#stops.push(
      onLookPainted((lookKey) => {
        const keys = this.#lookWaiting.get(lookKey);
        this.#lookWaiting.delete(lookKey);
        if (keys) this.want(keys);
      }),
      useDrawingLooks.subscribe((state, previous) => {
        if (state.painted !== previous.painted) {
          const kept = new Set(state.painted.values());
          for (const src of this.#images.keys()) if (src.startsWith('blob:') && !kept.has(src)) this.#images.delete(src);
        }
        if (state.scale === previous.scale) return;
        const keys = [...this.#looked];
        this.#looked.clear();
        this.#lookWaiting.clear();
        this.want(keys);
      }),
    );
  }

  /** Queues keys to paint (the engine's `textureNeeded`). */
  want(keys: Iterable<string>): void {
    for (const key of keys) this.#queue.add(key);
    this.#schedule();
  }

  /** Stops painting. */
  stop(): void {
    this.#stopped = true;
    for (const stop of this.#stops.splice(0)) stop();
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  #schedule(): void {
    if (this.#frame !== 0 || this.#stopped || !this.#ready || this.#queue.size === 0) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#pump();
    });
  }

  #pump(): void {
    const start = performance.now();
    for (const key of this.#queue) {
      this.#queue.delete(key);
      this.#paint(key);
      if (performance.now() - start > SPRITE_FRAME_BUDGET_MS) break;
    }
    this.#schedule();
  }

  /**
   * The source an image element draws in the current scheme: its painted
   * look when it has a textured one that is ready (asked for otherwise, and
   * `key` painted again once it is), else the drawing as written.
   */
  #imageSource(element: BoardElement, key: string): string | undefined {
    if (element.type !== 'image') return undefined;
    const scheme = this.#source.scheme();
    const written = drawnImageSrc(element, drawnImagePen(scheme));
    const look = imageDrawingLook(element);
    if (look === undefined || !isRasterLook(look)) return written;
    const request = { src: element.src, look, scheme, w: element.w, h: element.h, scale: useDrawingLooks.getState().scale };
    const lookKey = lookRequestKey(request).key;
    this.#looked.add(key);
    const painted = paintedLookUrl(lookKey);
    if (painted !== undefined) return painted;
    let waiting = this.#lookWaiting.get(lookKey);
    if (!waiting) this.#lookWaiting.set(lookKey, (waiting = new Set()));
    waiting.add(key);
    void requestDrawingLook(request);
    return written;
  }

  /** True when the element's picture assets are loaded; starts loading them otherwise. */
  #assetsReady(element: BoardElement, key: string, src: string | undefined): boolean {
    if (src !== undefined && !this.#images.has(src)) {
      let waiting = this.#waiting.get(src);
      if (!waiting) {
        this.#waiting.set(src, (waiting = new Set()));
        const objectUrls: string[] = [];
        void loadRasterImages([src], undefined, objectUrls).then(({ loaded }) => {
          this.#images.set(src, loaded.get(src) ?? null);
          for (const url of objectUrls) URL.revokeObjectURL(url);
          const keys = this.#waiting.get(src) ?? new Set<string>();
          this.#waiting.delete(src);
          this.want(keys);
        });
      }
      waiting.add(key);
      return false;
    }
    // A sticker's art: its lucide icon, or its emoji's Noto art.
    const emoji = element.type === 'sticker' ? stickerEmoji(element) : undefined;
    const icon = element.type === 'sticker' ? (iconStickerOf(element.art)?.icon ?? (emoji !== undefined ? emojiArtKey(emoji) : undefined)) : undefined;
    if (icon !== undefined && !this.#icons.has(icon) && !this.#iconMisses.has(icon)) {
      void loadStickerIcons([element]).then((icons) => {
        for (const [name, image] of icons) this.#icons.set(name, image);
        // A sticker without its art paints its fallback (an icon's disc, an emoji's font glyph).
        if (!this.#icons.has(icon)) this.#iconMisses.add(icon);
        this.want([key]);
      });
      return false;
    }
    return true;
  }

  #paint(key: string): void {
    const parsed = parseSpriteKey(key);
    const current = parsed && this.#source.current(parsed.id);
    // Stale keys (the element changed since) are skipped: the new key is asked for.
    if (!parsed || !current || current.hash !== parsed.hash) return;
    const { element, place } = current;
    const src = this.#imageSource(element, key);
    if (!this.#assetsReady(element, key, src)) return;
    const { box } = place;
    const scale = Math.min(parsed.bucket, MAX_SPRITE_PX / Math.max(box.w, box.h, 1));
    const width = Math.max(1, Math.ceil(box.w * scale));
    const height = Math.max(1, Math.ceil(box.h * scale));
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Exactly `scale`, not `width / box.w`: sticker rims are shadows cast from tens of thousands of
    // units away with offsets in pixels at `scale`, so the rounding of the canvas size would shift
    // them off the art. The texture overshoots the box by under a pixel.
    ctx.scale(scale, scale);
    ctx.translate(-box.x, -box.y);
    const image = src !== undefined ? this.#images.get(src) : undefined;
    paintElementSprite(ctx, element, {
      scheme: this.#source.scheme(),
      measures: this.#source.measures(),
      byId: this.#source.byId(),
      backdrops: this.#source.backdrops(),
      images: src !== undefined && image ? new Map([[src, image]]) : new Map(),
      imageSources: src !== undefined ? new Map([[element.id, src]]) : new Map(),
      icons: this.#icons,
      showAuthors: true,
      faceName: (id) => this.#source.faceName(id),
      scale,
      title: this.#source.titleSpot(element),
    });
    try {
      this.#engine.setTexture(key, canvas);
    } catch {
      // An unreadable (tainted) picture: the item keeps its placeholder.
    }
  }
}
