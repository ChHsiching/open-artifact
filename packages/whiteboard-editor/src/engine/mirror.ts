/**
 * Keeps the canvas engine's scene equal to the shown board, incrementally.
 *
 * Each sync walks the elements in draw order and rebuilds only what
 * changed: an element's body items when the element, its measure, its draw
 * position, its liveness or (for arrows) an end changed; its sprite item
 * when its sprite place, look or show changed. A walk compares references,
 * so syncing an unchanged 5,000-element board costs well under a
 * millisecond; a drag preview rebuilds the moved elements and their arrows.
 */

import type { CanvasEngine, CanvasItem } from '@open-artifact/canvas-engine';
import { arrowEndIds, boardTextBoxes, type BoardElement, type Box, type ColorScheme, type ElementId, type ElementMeasure, type ElementMeasures, type ElementsById } from '@open-artifact/whiteboard-core';
import { elementBodyItems, elementSpriteItem, spritePlace, type ItemScope, type SpritePlace, type SpriteShow } from './items.ts';
import { spriteHash, spriteKey } from './sprite-keys.ts';

/** Text sprites are left out below this zoom (lines under ~3 px tall); pictures still draw. */
export const TEXT_SPRITE_MIN_ZOOM = 0.2;

/** What one sync draws. */
export interface MirrorFrame {
  /** The shown elements in draw order (sections first). */
  elements: readonly BoardElement[];
  byId: ElementsById;
  measures: ElementMeasures;
  scheme: ColorScheme;
  editable: boolean;
  /** The current layout zoom (section titles, the text cut-off). */
  zoom: number;
  /** The raster bucket sprites in `view` take. */
  bucket: number;
  /** The settled visible board area (sprites there take `bucket`). */
  view: Box;
  /** Elements whose DOM view shows through holes. */
  dom: ReadonlySet<ElementId>;
  /** Elements drawn as live DOM above the canvas. */
  live: ReadonlySet<ElementId>;
  /** Fills behind free text. */
  backdrops: ReadonlyMap<string, string>;
}

interface Entry {
  element: BoardElement;
  order: number;
  measure: ElementMeasure | undefined;
  /** Arrow ends and their measures, by reference. */
  ends: readonly unknown[];
  live: boolean;
  bodyIds: readonly string[];
  place: SpritePlace | undefined;
  hash: string | undefined;
  backdrop: string | undefined;
  bucket: number;
  /** The sprite item's signature (show and place), `''` for none. */
  sprite: string;
}

const NO_ENDS: readonly unknown[] = [];

function sameRefs(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
}

/** Where the board's text is: arrows are cut where they cross it, so they redraw when it changes. */
function textBoxesKey(byId: ElementsById, measures: ElementMeasures): string {
  let key = '';
  for (const { id, box } of boardTextBoxes(byId, measures)) key += `${id}:${box.x},${box.y},${box.w},${box.h};`;
  return key;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The engine-side copy of the board. */
export class BoardMirror {
  readonly #engine: CanvasEngine;
  readonly #entries = new Map<ElementId, Entry>();
  #global = '';
  #zoom = NaN;
  #texts = '';
  #frame: MirrorFrame | null = null;

  constructor(engine: CanvasEngine) {
    this.#engine = engine;
  }

  /** The last synced frame. */
  get frame(): MirrorFrame | null {
    return this.#frame;
  }

  /** An element as last synced with its sprite place and hash (for the sprite painter). */
  sprite(id: ElementId): { element: BoardElement; place: SpritePlace; hash: string } | undefined {
    const entry = this.#entries.get(id);
    return entry?.place && entry.hash !== undefined ? { element: entry.element, place: entry.place, hash: entry.hash } : undefined;
  }

  /** The sprite texture key an element would take at `bucket`, if it has a sprite. */
  spriteKeyAt(id: ElementId, bucket: number): string | undefined {
    const entry = this.#entries.get(id);
    return entry?.hash !== undefined ? spriteKey(id, entry.hash, bucket) : undefined;
  }

  /** Brings the engine scene up to `frame`. */
  sync(frame: MirrorFrame): void {
    this.#frame = frame;
    const global = `${frame.scheme}|${frame.editable}`;
    const rebuild = global !== this.#global;
    const zoomChanged = frame.zoom !== this.#zoom;
    this.#global = global;
    this.#zoom = frame.zoom;
    const texts = textBoxesKey(frame.byId, frame.measures);
    const textsMoved = texts !== this.#texts;
    this.#texts = texts;
    const scope: ItemScope = { byId: frame.byId, measures: frame.measures, scheme: frame.scheme, editable: frame.editable, zoom: frame.zoom };
    const upsert: CanvasItem[] = [];
    const remove: string[] = [];
    const seen = new Set<ElementId>();
    frame.elements.forEach((element, order) => {
      const id = element.id;
      seen.add(id);
      const previous = this.#entries.get(id);
      const measure = frame.measures.get(id);
      const ends = element.type === 'arrow' ? arrowEndIds(element).flatMap((end) => [frame.byId.get(end), frame.measures.get(end)]) : NO_ENDS;
      const live = frame.live.has(id);
      const backdrop = element.type === 'text' ? frame.backdrops.get(id) : undefined;
      const bodyDirty =
        rebuild ||
        !previous ||
        previous.element !== element ||
        previous.order !== order ||
        previous.measure !== measure ||
        previous.live !== live ||
        (textsMoved && element.type === 'arrow') ||
        !sameRefs(previous.ends, ends);
      const entry: Entry = previous ?? { element, order, measure, ends, live, bodyIds: [], place: undefined, hash: undefined, backdrop, bucket: frame.bucket, sprite: '' };
      if (bodyDirty) {
        const items = elementBodyItems(element, order, scope, live);
        const ids = items.map((item) => item.id);
        for (const old of entry.bodyIds) if (!ids.includes(old)) remove.push(old);
        upsert.push(...items);
        entry.bodyIds = ids;
      }
      const placeDirty = bodyDirty || backdrop !== entry.backdrop || (zoomChanged && element.type === 'container');
      if (placeDirty) {
        entry.place = live || entry.bodyIds.length === 0 ? undefined : spritePlace(element, scope);
        entry.hash = entry.place ? spriteHash(element, entry.place, { scheme: frame.scheme, backdrop }) : undefined;
      }
      Object.assign(entry, { element, order, measure, ends, live, backdrop });
      if (entry.place && overlaps(entry.place.box, frame.view)) entry.bucket = frame.bucket;
      const show = this.#show(entry, frame);
      const signature = show === null ? '' : `${show.mode}|${show.mode === 'texture' ? show.key : ''}`;
      if (placeDirty || signature !== entry.sprite) {
        const item = show && entry.place ? elementSpriteItem(element, order, entry.place, show) : null;
        if (item) upsert.push(item);
        else if (entry.sprite !== '') remove.push(id + '#t');
        entry.sprite = item ? signature : '';
      }
      this.#entries.set(id, entry);
    });
    for (const [id, entry] of this.#entries) {
      if (seen.has(id)) continue;
      remove.push(...entry.bodyIds);
      if (entry.sprite !== '') remove.push(id + '#t');
      this.#entries.delete(id);
    }
    if (upsert.length > 0 || remove.length > 0) this.#engine.applyPatch({ ...(remove.length > 0 ? { remove } : {}), upsert });
  }

  /** How an element's sprite place draws now, or `null` for not at all. */
  #show(entry: Entry, frame: MirrorFrame): SpriteShow | null {
    const id = entry.element.id;
    if (!entry.place || entry.hash === undefined || entry.live) return null;
    if (frame.dom.has(id)) return { mode: 'dom' };
    if (!entry.place.picture && frame.zoom < TEXT_SPRITE_MIN_ZOOM) return null;
    return { mode: 'texture', key: spriteKey(id, entry.hash, entry.bucket) };
  }
}
