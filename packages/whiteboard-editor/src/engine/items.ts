/**
 * Board elements as canvas-engine items: pure geometry and paint, no DOM.
 *
 * Each element maps to a body item with the element's id (what hit tests,
 * selection, moves and resizes act on) plus companions whose ids carry a
 * `#` suffix and are neither hit nor selected:
 *
 * - `#t`, the element's sprite place: its text (notes, shapes, free text,
 *   arrow labels, section titles) or its whole picture (images, stickers,
 *   link cards, tables). It is a textured image while the DOM does not
 *   draw the element, a hole (the DOM view under the canvas shows through)
 *   while it does, and absent when text is too small to read.
 * - `#k`, a shape's ink outline or cylinder cap; `#a`, `#b`, an arrow's circle heads.
 *
 * Live elements have transparent hit boxes; their interactive DOM views draw above the canvas.
 *
 * Draw order follows the DOM: sections on layer 0, everything else on
 * layer 1, each in board order (z = order × 4 + companion slot).
 */

import {
  ARROW_CIRCLE_RADIUS,
  ARROW_STROKE,
  BOARD_THEME_COLORS,
  CONTAINER_TITLE_GAP,
  CONTAINER_TITLE_GAP_SCALED,
  CONTAINER_TITLE_PADDING_X,
  ELEMENT_KIND_AFFORDANCES,
  NOTE_SHADOWS,
  SECTION_LINE_WIDTH,
  arrowCircleCenter,
  arrowHeadFlags,
  arrowHeads,
  arrowTextKnockouts,
  blockColorHex,
  containerTitleBandHeight,
  containerTitleFontPx,
  containerTitleScale,
  containerTitleScaledGap,
  cylinderCapPathData,
  elementLayoutBox,
  elementTurn,
  isElementLocked,
  isSvgBase64DataUrl,
  measuredArrowGeometry,
  measuredArrowLabelBox,
  normalizeArrowLabel,
  roundedPolygonPathData,
  roundedRoutePath,
  sectionFillColor,
  sectionLineColor,
  handDrawnShapeOutline,
  shapeEdgeOverlay,
  shapeFillPaint,
  shapeOutlineColor,
  shapePathData,
  shapeStrokePaint,
  showsTextPlaceholder,
  strokePointsToPath,
  themedInkColor,
  type ArrowElement,
  type ArrowGeometry,
  type BoardElement,
  type Box,
  type ColorScheme,
  type ContainerElement,
  type ElementMeasures,
  type ElementsById,
} from '@open-artifact/whiteboard-core';
import { MAX_CUTS, type CanvasItem, type ItemFlags } from '@open-artifact/canvas-engine';
import { EXPORT_CARD_COLORS, arrowEndNeighbor, stickerOutlinePadding } from '../export/look.ts';
import type { SectionTitleSpot } from '../export/paint.ts';

/** Suffix of an element's sprite item. */
export const SPRITE_SUFFIX = '#t';

/** The element an item belongs to (its id without a companion suffix). */
export function itemOwner(itemId: string): string {
  const cut = itemId.indexOf('#');
  return cut < 0 ? itemId : itemId.slice(0, cut);
}

/** What the mapping reads besides the element. */
export interface ItemScope {
  /** The shown elements (arrow ends). */
  byId: ElementsById;
  measures: ElementMeasures;
  scheme: ColorScheme;
  /** The viewer may edit (elements move and resize on the canvas). */
  editable: boolean;
  /** The zoom section titles are laid out for. */
  zoom: number;
}

/**
 * How an element's sprite place is drawn: `dom` (a hole over the DOM view)
 * or `texture` (the sprite texture under `key`).
 */
export type SpriteShow = { mode: 'dom' } | { mode: 'texture'; key: string };

/** Where an element's sprite sits: a board box and its rotation (radians, clockwise about its centre). */
export interface SpritePlace {
  box: Box;
  rotation: number;
  /** The sprite is the whole element (a picture), not text over a body. */
  picture: boolean;
}

/** Elements that are always interactive DOM. */
export function isAlwaysLive(element: BoardElement): boolean {
  switch (element.type) {
    case 'html':
    case 'timer':
    case 'table':
    case 'link':
      return true;
    case 'image':
      return element.video !== undefined || element.href !== undefined;
    case 'shape':
    case 'note':
    case 'text':
      return element.text.includes('](');
    default:
      return false;
  }
}

/** The rotation the element is drawn at, radians (a note's tilt included). */
export function itemRotation(element: BoardElement): number {
  const degrees = elementTurn(element) + (element.type === 'note' ? element.tilt : 0);
  return (degrees * Math.PI) / 180;
}

/** True when the canvas may resize the element itself (lone selection, its own handles). */
export function engineResizes(element: BoardElement, editable: boolean): boolean {
  if (!editable || isElementLocked(element) || !ELEMENT_KIND_AFFORDANCES[element.type].resizes || elementTurn(element) !== 0) return false;
  return element.type === 'note' || element.type === 'shape' || element.type === 'container' || element.type === 'image';
}

function inflate(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, w: box.w + 2 * by, h: box.h + 2 * by };
}

/** How far the DOM title's text starts from its section's left edge, at title scale 1 (`.wb-container-title`). */
const TITLE_INSET = 4;
/** Room above a title's line for its halo, at title scale 1. */
const TITLE_HALO = 2;

/**
 * Where a section's title is drawn at a zoom, as `SectionView` draws it:
 * scaled to a readable screen size (scaled about the section's corner from
 * zoom 1, lifted by the zoomed-out gap below it), and `undefined` when the
 * section shows no title.
 */
export function sectionTitleSpot(element: ContainerElement, measures: ElementMeasures, zoom: number): SectionTitleSpot | undefined {
  const scale = element.text.trim() === '' ? undefined : containerTitleScale(element, measures, zoom);
  if (scale === undefined) return undefined;
  if (zoom >= 1) return { scale, gap: CONTAINER_TITLE_GAP * scale, inset: TITLE_INSET * scale };
  return { scale, gap: containerTitleScaledGap + CONTAINER_TITLE_GAP_SCALED * scale, inset: TITLE_INSET * scale };
}

/** The sprite place of an element, or `undefined` when it has no text or picture to draw. */
export function spritePlace(element: BoardElement, scope: ItemScope): SpritePlace | undefined {
  const rotation = itemRotation(element);
  switch (element.type) {
    case 'note': {
      if (element.text.trim() === '' && !element.author) return undefined;
      const box = elementLayoutBox(element, scope.measures);
      return box && { box, rotation, picture: false };
    }
    case 'shape':
      return element.text.trim() === '' ? undefined : { box: { x: element.x, y: element.y, w: element.w, h: element.h }, rotation, picture: false };
    case 'text': {
      const box = element.text.trim() === '' && !showsTextPlaceholder(element) ? undefined : elementLayoutBox(element, scope.measures);
      return box && { box: inflate(box, 2), rotation, picture: false };
    }
    case 'arrow': {
      if (normalizeArrowLabel(element.label ?? '') === '') return undefined;
      const line = measuredArrowGeometry(element, scope.byId, scope.measures);
      const label = line && measuredArrowLabelBox(element, line, scope.byId, scope.measures);
      return label && { box: inflate(label, 10), rotation: 0, picture: false };
    }
    case 'container': {
      const spot = sectionTitleSpot(element, scope.measures, scope.zoom);
      if (!spot) return undefined;
      const band = spot.gap + (containerTitleBandHeight - CONTAINER_TITLE_GAP + TITLE_HALO) * spot.scale;
      // As wide as the title (a generous guess until the DOM has measured it), so its hole shows little bare paper.
      const text = scope.measures.get(element.id)?.w ?? element.text.length * containerTitleFontPx * 0.7;
      const w = Math.min(element.w, spot.inset + (text + CONTAINER_TITLE_PADDING_X) * spot.scale);
      return { box: { x: element.x, y: element.y - band, w, h: band }, rotation: 0, picture: false };
    }
    case 'image':
      return { box: inflate({ x: element.x, y: element.y, w: element.w, h: element.h }, isSvgBase64DataUrl(element.src) ? 0 : 16), rotation, picture: true };
    case 'sticker':
      return { box: inflate({ x: element.x, y: element.y, w: element.w, h: element.h }, stickerOutlinePadding(Math.min(element.w, element.h))), rotation, picture: true };
    case 'link':
    case 'table': {
      const box = elementLayoutBox(element, scope.measures);
      return box && { box: inflate(box, 2), rotation, picture: true };
    }
    case 'stroke':
    case 'html':
    case 'timer':
      return undefined;
  }
}

const COMPANION: ItemFlags = { hittable: false, selectable: false, movable: false, resizable: false, snap: false };

/** The arrow's line with its chevron heads, relative to `origin`. */
function arrowPath(arrow: ArrowElement, line: ArrowGeometry, origin: { x: number; y: number }): string {
  const heads = arrowHeads(arrow);
  const shift = (x: number, y: number): string => `${x - origin.x} ${y - origin.y}`;
  let d = line.elbow
    ? roundedRoutePath(
        line.elbow.map(([x, y]) => [x - origin.x, y - origin.y] as [number, number]),
        arrowHeadFlags(heads),
      )
    : `M ${shift(line.x1, line.y1)} L ${shift(line.x2, line.y2)}`;
  const chevron = (tipX: number, tipY: number, from: { x: number; y: number }): string => {
    const dx = tipX - from.x;
    const dy = tipY - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [dx / dist, dy / dist];
    const [length, wing] = [ARROW_STROKE.head, ARROW_STROKE.head * ARROW_STROKE.wing];
    return ` M ${shift(tipX - ux * length - uy * wing, tipY - uy * length + ux * wing)} L ${shift(tipX, tipY)} L ${shift(tipX - ux * length + uy * wing, tipY - uy * length - ux * wing)}`;
  };
  if (heads[1] !== 'none' && heads[1] !== 'circle') d += chevron(line.x2, line.y2, arrowEndNeighbor(line, 'to'));
  if (heads[0] !== 'none' && heads[0] !== 'circle') d += chevron(line.x1, line.y1, arrowEndNeighbor(line, 'from'));
  return d;
}

/**
 * An arrow: its line (with chevrons) and circle heads. Not hit or selected on
 * the canvas. As in the DOM, the line is cut where it passes under text.
 */
function arrowItems(arrow: ArrowElement, layer: number, z: number, scope: ItemScope): CanvasItem[] {
  const line = measuredArrowGeometry(arrow, scope.byId, scope.measures);
  if (!line) return [];
  const coords = line.elbow ? line.elbow.flat() : [line.x1, line.y1, line.x2, line.y2];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let index = 0; index + 1 < coords.length; index += 2) {
    x0 = Math.min(x0, coords[index]!);
    x1 = Math.max(x1, coords[index]!);
    y0 = Math.min(y0, coords[index + 1]!);
    y1 = Math.max(y1, coords[index + 1]!);
  }
  const pad = ARROW_STROKE.head + ARROW_CIRCLE_RADIUS + 2;
  const box = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  const color = themedInkColor(arrow.color, scope.scheme);
  const items: CanvasItem[] = [
    {
      kind: 'path',
      id: arrow.id,
      ...box,
      layer,
      z,
      d: arrowPath(arrow, line, box),
      cuts: arrowTextKnockouts(arrow, line, scope.byId, scope.measures)
        .slice(0, MAX_CUTS)
        .map((cut) => ({ x: cut.x - box.x, y: cut.y - box.y, w: cut.w, h: cut.h })),
      fill: 'transparent',
      stroke: color,
      strokeWidth: ARROW_STROKE.width,
      cap: 'round',
      join: 'round',
      ...(arrow.dash ? { dash: [ARROW_STROKE.dash[0]!, ARROW_STROKE.dash[1]!] as [number, number] } : {}),
      ...COMPANION,
    },
  ];
  const heads = arrowHeads(arrow);
  const ends = [
    { kind: heads[0], tip: { x: line.x1, y: line.y1 }, from: arrowEndNeighbor(line, 'from'), id: `${arrow.id}#a` },
    { kind: heads[1], tip: { x: line.x2, y: line.y2 }, from: arrowEndNeighbor(line, 'to'), id: `${arrow.id}#b` },
  ];
  for (const end of ends) {
    if (end.kind !== 'circle') continue;
    const dot = arrowCircleCenter(end.tip.x, end.tip.y, end.from.x, end.from.y);
    const r = ARROW_CIRCLE_RADIUS;
    items.push({
      kind: 'path',
      id: end.id,
      x: dot.x - r - 1,
      y: dot.y - r - 1,
      w: 2 * r + 2,
      h: 2 * r + 2,
      layer,
      z: z + 1,
      d: `M 1 ${r + 1} A ${r} ${r} 0 1 1 ${2 * r + 1} ${r + 1} A ${r} ${r} 0 1 1 1 ${r + 1} Z`,
      fill: BOARD_THEME_COLORS[scope.scheme].paper,
      stroke: color,
      strokeWidth: ARROW_STROKE.width,
      ...COMPANION,
    });
  }
  return items;
}

/** A canvas item without its id and draw slot. */
type ItemLook = CanvasItem extends infer Item ? (Item extends CanvasItem ? Omit<Item, 'id' | 'layer' | 'z'> : never) : never;

/** The body item of a box element (everything but arrows), without its id-level flags. */
function bodyItem(element: Exclude<BoardElement, ArrowElement>, box: Box, scope: ItemScope): ItemLook {
  const base = { x: box.x, y: box.y, w: box.w, h: box.h, rotation: itemRotation(element) };
  switch (element.type) {
    case 'note': {
      const shadow = NOTE_SHADOWS[scope.scheme][1]!;
      return { kind: 'rect', ...base, fill: blockColorHex(element.color), shadow: { color: shadow.ink, blur: shadow.blur, dx: shadow.x, dy: shadow.y } };
    }
    case 'shape': {
      const fill = shapeFillPaint(element);
      const stroke = shapeStrokePaint(element, scope.scheme);
      const edge = stroke === 'none' && fill !== 'none';
      return {
        kind: 'path',
        ...base,
        d: roundedPolygonPathData(element.kind, box.w, box.h, true),
        fill: fill === 'none' ? 'transparent' : fill,
        stroke: edge ? shapeEdgeOverlay(fill) : 'transparent',
        strokeWidth: edge ? 1 : 0,
        join: 'round',
      };
    }
    case 'container':
      return {
        kind: 'path',
        ...base,
        d: shapePathData('frame', box.w, box.h),
        fill: sectionFillColor(element.color, scope.scheme),
        stroke: sectionLineColor(element.color, scope.scheme),
        strokeWidth: SECTION_LINE_WIDTH,
      };
    case 'stroke': {
      const dx = element.x - box.x;
      const dy = element.y - box.y;
      const points = element.points.map((value, index) => value + (index % 2 === 0 ? dx : dy));
      return {
        kind: 'path',
        ...base,
        d: strokePointsToPath(points),
        fill: 'transparent',
        stroke: themedInkColor(element.color, scope.scheme),
        strokeWidth: element.width,
        cap: 'round',
        join: 'round',
        opacity: scope.scheme === 'dark' ? 0.95 : 0.92,
        // Ink on paper, as `.wb-stroke` (mix-blend-mode: multiply) in light mode.
        blend: scope.scheme === 'dark' ? 'normal' : 'multiply',
        hitStrokeOnly: true,
      };
    }
    case 'image':
      return isSvgBase64DataUrl(element.src)
        ? { kind: 'rect', ...base, fill: 'transparent' }
        : { kind: 'rect', ...base, fill: '#ffffff', shadow: { color: 'rgba(0,0,0,.2)', blur: 10, dx: 0, dy: 4 } };
    case 'link': {
      const [fill, stroke] = EXPORT_CARD_COLORS[scope.scheme];
      return { kind: 'rect', ...base, fill, stroke, strokeWidth: 1.5, radius: 12 };
    }
    default:
      return { kind: 'rect', ...base, fill: 'transparent' };
  }
}

/** The layer and base z of the element at draw position `order`. */
function drawSlot(element: BoardElement, order: number): { layer: number; z: number } {
  return { layer: element.type === 'container' ? 0 : 1, z: order * 4 };
}

/**
 * The body items of one element at draw position `order` (everything but
 * its sprite): a transparent hit box while its DOM view is live. Arrows whose ends are missing draw
 * nothing.
 */
export function elementBodyItems(element: BoardElement, order: number, scope: ItemScope, live: boolean): CanvasItem[] {
  const { layer, z } = drawSlot(element, order);
  if (element.type === 'arrow') return live ? [] : arrowItems(element, layer, z, scope);
  const box = elementLayoutBox(element, scope.measures);
  if (!box) return [];
  if (live) {
    return [{ kind: 'rect', fill: 'transparent', id: element.id, x: box.x, y: box.y, w: box.w, h: box.h, rotation: itemRotation(element), layer, z, movable: false, resizable: false, hover: false }];
  }
  const locked = isElementLocked(element);
  const body = {
    ...bodyItem(element, box, scope),
    id: element.id,
    layer,
    z,
    movable: scope.editable && !locked,
    resizable: engineResizes(element, scope.editable),
    lockAspect: element.type === 'image',
    // Pictures resize from their corners only, as the selection overlay offers.
    handles: element.type === 'image' ? 'corners' : 'all',
    // The selection overlay draws hover (its outline follows groups and sections).
    hover: false,
  } as CanvasItem;
  const items: CanvasItem[] = [body];
  if (element.type === 'shape') {
    const stroke = shapeStrokePaint(element, scope.scheme);
    const ink = stroke !== 'none';
    const d = ink ? handDrawnShapeOutline(element.kind, box.w, box.h, element.id)
      : !element.hollow ? cylinderCapPathData(element.kind, box.w, box.h) : undefined;
    if (d) items.push({
      kind: 'path', id: element.id + '#k', ...box, rotation: body.rotation, layer, z: z + 1,
      d, fill: ink ? stroke : shapeOutlineColor(element), ...COMPANION,
    });
  }
  return items;
}

/** The sprite item of an element over its place. */
export function elementSpriteItem(element: BoardElement, order: number, place: SpritePlace, show: SpriteShow): CanvasItem {
  const { layer, z } = drawSlot(element, order);
  const base = { id: element.id + SPRITE_SUFFIX, ...place.box, rotation: place.rotation, layer, z: z + 2, ...COMPANION };
  switch (show.mode) {
    case 'dom':
      return { kind: 'hole', ...base };
    case 'texture':
      return { kind: 'image', ...base, fill: 'transparent', texture: show.key };
  }
}
