/**
 * Tests of the board picture's framing and the pure look helpers the
 * exporter paints with (sticker rims, table header colors, arrow paths).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ArrowGeometry, NoteElement, StickerElement } from '@open-artifact/whiteboard-core';
import { boardPngFilename, EXPORT_MAX_SCALE, EXPORT_PADDING, EXPORT_TITLE_BAR_PX, exportFrameFor } from '../src/export/frame.ts';
import { arrowEndNeighbor, arrowPathData, rectPathData, stickerOutlinePadding, stickerOutlineShadows, tableHeadColors, TABLE_HEAD_FILLS } from '../src/export/look.ts';

const note = (id: string, x = 0, y = 0): NoteElement => ({ type: 'note', id, x, y, w: 180, h: 180, color: 'yellow', text: 'Hi', tilt: 0 });
const sticker = (id: string, size: number): StickerElement => ({ type: 'sticker', id, x: 0, y: 0, w: size, h: size, glyph: '⭐' });

describe('exportFrameFor', () => {
  it('has no frame for an empty board', () => {
    assert.equal(exportFrameFor([]), undefined);
  });

  it('pads the content and caps the scale at 2', () => {
    const frame = exportFrameFor([note('n1')]);
    assert.ok(frame);
    assert.deepEqual(frame.board, { x: -EXPORT_PADDING, y: -EXPORT_PADDING, w: 180 + EXPORT_PADDING * 2, h: 180 + EXPORT_PADDING * 2 });
    assert.equal(frame.scale, EXPORT_MAX_SCALE);
    assert.equal(frame.width, 308 * 2);
    assert.equal(frame.height, 308 * 2 + EXPORT_TITLE_BAR_PX);
    assert.equal(frame.titleBar, EXPORT_TITLE_BAR_PX);
  });

  it('scales down so the longest edge, title bar included, fits', () => {
    const frame = exportFrameFor([note('n1'), note('n2', 5000, 0)], undefined, 1000);
    assert.ok(frame);
    assert.ok(frame.width <= 1000);
    assert.ok(frame.height <= 1000);
    assert.equal(frame.width, 1000);

    const tall = exportFrameFor([note('n1'), note('n2', 0, 400)], undefined, 400);
    assert.ok(tall);
    assert.equal(tall.height, 400);
    assert.ok(tall.width < 400);
  });

  it('widens the margin for big stickers so their rim is not cut', () => {
    const frame = exportFrameFor([sticker('s1', 480)]);
    assert.ok(frame);
    const pad = stickerOutlinePadding(480);
    assert.ok(pad > EXPORT_PADDING);
    assert.equal(frame.board.x, -pad);
  });
});

describe('boardPngFilename', () => {
  it('keeps word characters and dashes the spaces', () => {
    assert.equal(boardPngFilename('Q3 Retro: wins & misses!'), 'Q3-Retro-wins-misses.png');
  });

  it('falls back to "whiteboard"', () => {
    assert.equal(boardPngFilename(''), 'whiteboard.png');
    assert.equal(boardPngFilename('!!!'), 'whiteboard.png');
  });
});

describe('sticker rims', () => {
  it('reach further for bigger stickers', () => {
    assert.ok(Math.abs(stickerOutlinePadding(48) - 8.6) < 1e-9);
    assert.ok(Math.abs(stickerOutlinePadding(96) - 17.2) < 1e-9);
  });

  it('add the faint edge only when asked', () => {
    const plain = stickerOutlineShadows(false);
    const edged = stickerOutlineShadows(true);
    assert.equal(plain.length, 24);
    assert.equal(edged.length, 40);
    assert.ok(plain.every(([, , color]) => color === '#FFFFFF'));
    assert.ok(edged.slice(24).every(([, , color]) => color !== '#FFFFFF'));
  });
});

describe('tableHeadColors', () => {
  it('uses the neutral header fill for white tables', () => {
    assert.equal(tableHeadColors({ color: 'white' }, 'light').fill, TABLE_HEAD_FILLS.light);
    assert.equal(tableHeadColors({ color: 'white' }, 'dark').fill, TABLE_HEAD_FILLS.dark);
  });

  it('tints colored headers toward the paper', () => {
    const { fill, ink } = tableHeadColors({ color: 'blue' }, 'light');
    assert.match(fill, /^#[0-9a-f]{6}$/);
    assert.notEqual(fill, TABLE_HEAD_FILLS.light);
    assert.match(ink, /^#/);
  });
});

describe('arrow paths', () => {
  const straight: ArrowGeometry = { x1: 0, y1: 0, x2: 10, y2: 20 };
  const routed: ArrowGeometry = { x1: 0, y1: 0, x2: 50, y2: 50, elbow: [[0, 0], [50, 0], [50, 50]] };

  it('draws a straight arrow as one segment', () => {
    assert.equal(arrowPathData(straight, ['none', 'arrow']), 'M 0 0 L 10 20');
  });

  it('points heads away from the neighboring point', () => {
    assert.deepEqual(arrowEndNeighbor(straight, 'from'), { x: 10, y: 20 });
    assert.deepEqual(arrowEndNeighbor(straight, 'to'), { x: 0, y: 0 });
    assert.deepEqual(arrowEndNeighbor(routed, 'from'), { x: 50, y: 0 });
    assert.deepEqual(arrowEndNeighbor(routed, 'to'), { x: 50, y: 0 });
  });

  it('draws a routed arrow through its corners', () => {
    assert.match(arrowPathData(routed, ['none', 'arrow']), /^M\s*0[ ,]0/);
  });

  it('writes rectangles as a closed path', () => {
    assert.equal(rectPathData({ x: 1, y: 2, w: 3, h: 4 }), 'M1 2h3v4h-3Z');
  });
});
