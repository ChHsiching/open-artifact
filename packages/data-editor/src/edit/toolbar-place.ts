/** Where the floating piece toolbar sits around the picked piece (pure: plain boxes). */

import type { Box, Edges, Rect } from './geometry.ts';

export type PieceToolbarSide = 'above' | 'above-end' | 'beside' | 'under' | 'under-end';
/** What a candidate place would cover: the pointer, other words, or nothing (null). */
export type PieceToolbarHit = 'pointer' | 'words' | null;

export interface PieceToolbarLayout {
  box: Rect;
  room: Box;
  width: number;
  height: number;
  /** The piece's line height, to center the toolbar on the first line when it sits beside. */
  line: number;
  /** How far from the box's left edge the toolbar starts. */
  inset: number;
}

export interface PieceToolbarPoint {
  left: number;
  top: number;
}

export const PIECE_TOOLBAR_GAP = 8;
export const PIECE_TOOLBAR_MARGIN = 6;
export const PIECE_TOOLBAR_POINTER_INSET = 24;
export const PIECE_TOOLBAR_SIDES: readonly PieceToolbarSide[] = ['above', 'above-end', 'beside', 'under', 'under-end'];

export function placePieceToolbar(side: PieceToolbarSide, { box, room, width, height, line, inset }: PieceToolbarLayout): PieceToolbarPoint {
  if (side === 'beside') return { left: box.right + PIECE_TOOLBAR_GAP, top: box.top + (Math.min(line, box.height) - height) / 2 };
  return {
    left: Math.max(room.left + PIECE_TOOLBAR_MARGIN, Math.min(room.left + room.width - PIECE_TOOLBAR_MARGIN - width, side.endsWith('-end') ? box.right - width : box.left + inset)),
    top: side.startsWith('above') ? box.top - PIECE_TOOLBAR_GAP - height : Math.min(box.bottom + PIECE_TOOLBAR_GAP, room.top + room.height - height - PIECE_TOOLBAR_MARGIN),
  };
}

/** Above fits under the room's top; beside fits before its right edge; under always fits (it is pushed up). */
export function pieceToolbarFits(side: PieceToolbarSide, layout: PieceToolbarLayout): boolean {
  if (side.startsWith('above')) return placePieceToolbar(side, layout).top >= layout.room.top + PIECE_TOOLBAR_MARGIN;
  return side !== 'beside' || placePieceToolbar(side, layout).left + layout.width <= layout.room.left + layout.room.width - PIECE_TOOLBAR_MARGIN;
}

/** The first side that fits and covers nothing; else the first that fits without covering the pointer; else under. */
export function pickPieceToolbarSide(sides: readonly PieceToolbarSide[], layout: PieceToolbarLayout, hit: (left: number, top: number) => PieceToolbarHit): PieceToolbarSide {
  const hitAt = (side: PieceToolbarSide): PieceToolbarHit => {
    const point = placePieceToolbar(side, layout);
    return hit(point.left, point.top);
  };
  const fitting = sides.filter((side) => pieceToolbarFits(side, layout) && hitAt(side) !== 'pointer');
  return fitting.find((side) => hitAt(side) === null) ?? fitting[0] ?? 'under';
}

/** Whether a toolbar at `left`/`top` covers `rect` (3px of slack top and bottom). */
export const toolbarCovers = (rect: Edges, left: number, top: number, width: number, height: number): boolean =>
  rect.bottom > top + 3 && rect.top < top + height - 3 && rect.right > left && rect.left < left + width;

/** The side for a piece: kept while it still fits; words go above or under; others avoid the pointer and nearby words. */
export function choosePieceToolbarSide(
  layout: PieceToolbarLayout,
  kept: PieceToolbarSide | null,
  words: boolean,
  pressed: { x: number; y: number } | null,
  nearby: () => readonly Edges[],
): PieceToolbarSide {
  if (kept !== null && pieceToolbarFits(kept, layout)) return kept;
  if (words) return pickPieceToolbarSide(['above', 'under'], layout, () => null);
  const rects = nearby();
  return pickPieceToolbarSide(PIECE_TOOLBAR_SIDES, layout, (left, top) =>
    pressed !== null && toolbarCovers({ left: pressed.x - 4, right: pressed.x + 4, top: pressed.y - 4, bottom: pressed.y + 4 }, left, top, layout.width, layout.height)
      ? 'pointer'
      : rects.some((rect) => toolbarCovers(rect, left, top, layout.width, layout.height))
        ? 'words'
        : null,
  );
}

/** How far into the words the toolbar starts: under the click, kept inside the box. */
export const pieceToolbarInset = (pressedX: number | null, box: Box, width: number): number =>
  pressedX === null ? 0 : Math.max(0, Math.min(pressedX - PIECE_TOOLBAR_POINTER_INSET - box.left, box.width - width));
