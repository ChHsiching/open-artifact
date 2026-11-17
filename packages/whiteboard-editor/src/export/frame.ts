/**
 * The frame of a board picture: which part of the board it shows, how far
 * it is scaled, and the picture's size in pixels, plus the download name.
 *
 * The picture shows every element with a margin, scaled up to 2× for
 * crisp text but never past the longest-edge limit, under a title bar.
 */

import { elementsBounds, type BoardElement, type Box, type ElementMeasures } from '@open-artifact/whiteboard-core';
import { stickerOutlinePadding } from './look.ts';

/** Margin around the board's content, board units. */
export const EXPORT_PADDING = 64;
/** Longest edge of a picture, pixels. */
export const EXPORT_MAX_PX = 4096;
/** Height of the title bar above the board, pixels. */
export const EXPORT_TITLE_BAR_PX = 64;
/** Largest scale a picture is drawn at. */
export const EXPORT_MAX_SCALE = 2;

/** Where and how large a board picture is drawn. */
export interface ExportFrame {
  /** The board area shown (content plus margin), board units. */
  board: Box;
  /** Picture width, pixels. */
  width: number;
  /** Picture height including the title bar, pixels. */
  height: number;
  /** Pixels per board unit. */
  scale: number;
  /** Height of the title bar, pixels. */
  titleBar: number;
}

/**
 * The frame that shows `elements`, with the longest edge at most `maxPx`;
 * `undefined` for an empty board.
 */
export function exportFrameFor(elements: readonly BoardElement[], measures?: ElementMeasures, maxPx = EXPORT_MAX_PX): ExportFrame | undefined {
  const bounds = elementsBounds(elements, measures);
  if (!bounds) return undefined;
  const pad = Math.max(EXPORT_PADDING, ...elements.map((element) => (element.type === 'sticker' ? stickerOutlinePadding(Math.min(element.w, element.h)) : 0)));
  const board: Box = { x: bounds.x - pad, y: bounds.y - pad, w: bounds.w + pad * 2, h: bounds.h + pad * 2 };
  const scale = Math.min(EXPORT_MAX_SCALE, maxPx / board.w, (maxPx - EXPORT_TITLE_BAR_PX) / board.h);
  return { board, width: Math.round(board.w * scale), height: Math.round(board.h * scale) + EXPORT_TITLE_BAR_PX, scale, titleBar: EXPORT_TITLE_BAR_PX };
}

/** The download name of a board picture: the title's word characters, dashed, plus `.png`. */
export function boardPngFilename(title: string): string {
  const stem = title
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${stem || 'whiteboard'}.png`;
}
